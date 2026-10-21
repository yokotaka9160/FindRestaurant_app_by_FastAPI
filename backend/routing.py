"""ルート検索（OSRM）と地名検索（Nominatim）、ルートからの距離計算。

- OSRM: https://project-osrm.org/docs/v5.24.0/api/#route-service
  既定は公開デモサーバー（1 秒 1 リクエスト程度まで・商用不可）。自前のサーバーは OSRM_URL で指定する。
- Nominatim: https://nominatim.org/release-docs/latest/api/Search/
  利用規約により、入力中の自動補完には使わない（検索ボタンを押したときだけ呼ぶ）。
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass

import httpx

# docker compose から空文字で渡ることがあるので `or` で既定値にする
OSRM_URL = (os.environ.get("OSRM_URL") or "https://router.project-osrm.org").rstrip("/")
OSRM_PROFILE = os.environ.get("OSRM_PROFILE") or "driving"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim はアプリを識別できる User-Agent が必須
USER_AGENT = "FindRestr/1.0 (restaurant search demo)"

# 距離計算用にルートを間引く間隔（m）。検索幅（100m〜）より十分小さければ精度に影響しない
SIMPLIFY_M = 20


class RoutingError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


LatLng = tuple[float, float]


@dataclass
class Route:
    coordinates: list[LatLng]  # (lat, lng) の列（間引き済み）
    distance_m: float
    duration_s: float


# ------------------------------------------------------------------ #
# OSRM                                                               #
# ------------------------------------------------------------------ #


async def fetch_route(origin: LatLng, destination: LatLng) -> Route:
    # OSRM の座標は「経度,緯度」の順
    coords = f"{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
    url = f"{OSRM_URL}/route/v1/{OSRM_PROFILE}/{coords}"
    params = {"overview": "full", "geometries": "geojson", "alternatives": "false", "steps": "false"}
    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": USER_AGENT}) as client:
        try:
            res = await client.get(url, params=params)
        except httpx.HTTPError as e:
            raise RoutingError(f"ルート検索サーバーに接続できません: {e}") from e

    data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    if data.get("code") == "NoRoute":
        raise RoutingError("ルートが見つかりませんでした", status_code=404)
    if res.status_code != 200 or data.get("code") != "Ok" or not data.get("routes"):
        raise RoutingError(f"ルート検索に失敗しました（{data.get('code') or res.status_code}）")

    route = data["routes"][0]
    points = [(lat, lng) for lng, lat in route["geometry"]["coordinates"]]
    return Route(
        coordinates=simplify(points, SIMPLIFY_M),
        distance_m=float(route["distance"]),
        duration_s=float(route["duration"]),
    )


# ------------------------------------------------------------------ #
# Nominatim                                                          #
# ------------------------------------------------------------------ #

_geocode_cache: dict[str, list[dict]] = {}


async def geocode(query: str) -> list[dict]:
    """地名・住所から候補を最大 5 件返す [{name, lat, lng}]（日本国内のみ）"""
    key = query.strip()
    if key in _geocode_cache:
        return _geocode_cache[key]

    params = {
        "q": key,
        "format": "jsonv2",
        "limit": 5,
        "countrycodes": "jp",
        "accept-language": "ja",
    }
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": USER_AGENT}) as client:
        try:
            res = await client.get(NOMINATIM_URL, params=params)
        except httpx.HTTPError as e:
            raise RoutingError(f"地名検索サーバーに接続できません: {e}") from e
    if res.status_code != 200:
        raise RoutingError(f"地名検索に失敗しました（{res.status_code}）")

    results = [
        {"name": r.get("display_name", key), "lat": float(r["lat"]), "lng": float(r["lon"])}
        for r in res.json()
    ]
    _geocode_cache[key] = results
    return results


# ------------------------------------------------------------------ #
# 距離計算（ルート周辺の狭い範囲なので平面近似で十分）                   #
# ------------------------------------------------------------------ #

_M_PER_DEG_LAT = 110_540.0
_M_PER_DEG_LNG_EQUATOR = 111_320.0


def _to_xy(p: LatLng, cos_lat: float) -> tuple[float, float]:
    return p[1] * _M_PER_DEG_LNG_EQUATOR * cos_lat, p[0] * _M_PER_DEG_LAT


def simplify(points: list[LatLng], min_gap_m: float) -> list[LatLng]:
    """前の点から min_gap_m 未満の点を間引く（始点・終点は残す）"""
    if len(points) <= 2:
        return points
    cos_lat = math.cos(math.radians(points[0][0]))
    result = [points[0]]
    last = _to_xy(points[0], cos_lat)
    for p in points[1:-1]:
        xy = _to_xy(p, cos_lat)
        if math.dist(xy, last) >= min_gap_m:
            result.append(p)
            last = xy
    result.append(points[-1])
    return result


class RouteGeometry:
    """ルート（折れ線）に対する距離計算。座標は前計算しておく"""

    def __init__(self, points: list[LatLng]):
        lat0 = sum(p[0] for p in points) / len(points)
        self.cos_lat = math.cos(math.radians(lat0))
        self.xy = [_to_xy(p, self.cos_lat) for p in points]
        self.points = points
        # 始点から各頂点までの道のり（m）
        self.cumulative = [0.0]
        for a, b in zip(self.xy, self.xy[1:]):
            self.cumulative.append(self.cumulative[-1] + math.dist(a, b))

    @property
    def length(self) -> float:
        return self.cumulative[-1]

    def locate(self, p: LatLng) -> tuple[float, float]:
        """(ルートまでの最短距離, その地点の始点からの道のり) を m で返す"""
        px, py = _to_xy(p, self.cos_lat)
        best_d, best_along = math.inf, 0.0
        for i, ((ax, ay), (bx, by)) in enumerate(zip(self.xy, self.xy[1:])):
            dx, dy = bx - ax, by - ay
            seg2 = dx * dx + dy * dy
            t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
            cx, cy = ax + t * dx, ay + t * dy
            d = math.hypot(px - cx, py - cy)
            if d < best_d:
                best_d = d
                best_along = self.cumulative[i] + t * math.sqrt(seg2)
        return best_d, best_along

    def sample(self, spacing_m: float) -> list[LatLng]:
        """ルート上に spacing_m 間隔で点を取る（始点・終点を含む）"""
        n = max(1, math.ceil(self.length / spacing_m))
        targets = [self.length * k / n for k in range(n + 1)]
        result, i = [], 0
        for t in targets:
            while i < len(self.cumulative) - 2 and self.cumulative[i + 1] < t:
                i += 1
            seg = self.cumulative[i + 1] - self.cumulative[i]
            r = 0.0 if seg == 0 else (t - self.cumulative[i]) / seg
            (alat, alng), (blat, blng) = self.points[i], self.points[i + 1]
            result.append((alat + (blat - alat) * r, alng + (blng - alng) * r))
        return result
