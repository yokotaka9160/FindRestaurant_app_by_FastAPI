"""飲食店検索 API。

起動:
    cd backend
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    export YELP_API_KEY=xxxxx   # 未設定ならモックデータを返す
    .venv/bin/uvicorn main:app --reload --port 8000

エンドポイント:
    GET /api/shops?prefecture=東京都&area=渋谷&genre=寿司&genre=カフェ&min_rating=3.5&max_rating=4.5&budget_min=1000&budget_max=8000
    GET /api/shops?lat=35.66&lng=139.70&radius=3000   # 現在地から radius（m）以内
    GET /api/shops/route?olat=35.68&olng=139.77&dlat=35.66&dlng=139.70&buffer=500  # ルートから buffer（m）以内
    GET /api/geocode?q=東京駅                           # 地名 → 座標の候補
"""

import asyncio
import math
import time
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

import routing
import yelp
from shops import SHOPS, filter_shops, genre_facets, with_distance

# ルート検索で Yelp を呼ぶ地点数の上限（API の呼び出し回数を抑える）
ROUTE_MAX_SAMPLES = 10
ROUTE_YELP_CONCURRENCY = 3
YELP_MAX_RADIUS_M = 40000

app = FastAPI(title="FindRestr API")

# Vite の開発サーバー（localhost の任意ポート）からのアクセスを許可
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET"],
    allow_headers=["*"],
)


class Category(BaseModel):
    alias: str  # Yelp のカテゴリ ID（例: sushi）
    title: str  # 日本語の表示名（categories_ja.py で変換。対訳がなければ Yelp の英語名）


class GenreFacet(Category):
    count: int  # このカテゴリを持つ店舗数


class Shop(BaseModel):
    id: str
    name: str
    prefecture: str
    area: str
    # 現在地検索では現在地からの距離、ルート検索ではルートからの距離（m）
    distance: Optional[float] = None
    along: Optional[float] = None  # ルート検索のみ：出発地からの道のり（m）。ルート順の並び替え用
    lat: Optional[float] = None
    lng: Optional[float] = None
    genre: str  # 代表ジャンル（categories の先頭の title）
    categories: list[Category]
    budget: int  # 1人あたりの平均予算（円）。Yelp の場合は価格帯からの目安
    rating: float
    review_count: int
    description: str
    image: str
    url: Optional[str] = None  # Yelp の店舗ページ


class ShopsResponse(BaseModel):
    total: int  # 絞り込み前の総件数
    items: list[Shop]  # 絞り込み後の店舗
    # ジャンルの選択肢。エリア内の全店舗（ジャンル・評価・予算で絞り込む前）のカテゴリを集計したもの
    genres: list[GenreFacet]
    source: Literal["yelp", "mock"]


class RouteInfo(BaseModel):
    coordinates: list[tuple[float, float]]  # [lat, lng] の列（地図描画用）
    distance_m: float
    duration_s: float


class RouteShopsResponse(ShopsResponse):
    route: RouteInfo


class GeocodeResult(BaseModel):
    name: str
    lat: float
    lng: float


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    # API サーバーのトップには画面がないので、API ドキュメントへ案内する（アプリの画面はフロント側）
    return RedirectResponse("/docs")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "source": "yelp" if yelp.api_key() else "mock"}


@app.get("/api/shops", response_model=ShopsResponse)
async def list_shops(
    prefecture: Optional[str] = Query(None, description="都道府県名。未指定なら東京都"),
    area: Optional[str] = Query(None, description="市区町村・エリア名（完全一致）。未指定なら都道府県全域"),
    lat: Optional[float] = Query(None, ge=-90, le=90, description="現在地の緯度。lng と併せて指定すると prefecture / area より優先"),
    lng: Optional[float] = Query(None, ge=-180, le=180, description="現在地の経度"),
    radius: int = Query(5000, ge=1000, le=5000, description="現在地検索の半径（m）"),
    genre: Optional[list[str]] = Query(None, description="ジャンル（Yelp のカテゴリ alias）。複数指定可（OR条件）"),
    min_rating: float = Query(0, ge=0, le=5, description="評価の下限"),
    max_rating: float = Query(5, ge=0, le=5, description="評価の上限"),
    budget_min: Optional[int] = Query(None, ge=0, description="予算の下限（円）"),
    budget_max: Optional[int] = Query(None, ge=0, description="予算の上限（円）。未指定なら上限なし"),
) -> ShopsResponse:
    near_me = lat is not None and lng is not None
    if near_me:
        prefecture = area = None
    else:
        prefecture = prefecture or yelp.DEFAULT_PREFECTURE

    if yelp.api_key():
        try:
            total, shops = await yelp.search_shops(prefecture, area, lat, lng, radius_m=radius)
        except yelp.YelpError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        source = "yelp"
    else:
        total, shops = len(SHOPS), with_distance(SHOPS, lat, lng) if near_me else SHOPS
        source = "mock"

    # 先にエリアだけで絞り、そこからジャンルの選択肢を作る（選択中の条件で選択肢が消えないように）
    in_area = filter_shops(
        shops,
        prefecture=prefecture,
        area=area,
        max_distance=radius if near_me else None,
    )
    items = filter_shops(
        in_area,
        genres=genre,
        min_rating=min_rating,
        max_rating=max_rating,
        budget_min=budget_min,
        budget_max=budget_max,
    )
    return ShopsResponse(total=total, items=items, genres=genre_facets(in_area), source=source)


@app.get("/api/shops/route", response_model=RouteShopsResponse)
async def route_shops(
    olat: float = Query(..., ge=-90, le=90, description="出発地の緯度"),
    olng: float = Query(..., ge=-180, le=180, description="出発地の経度"),
    dlat: float = Query(..., ge=-90, le=90, description="目的地の緯度"),
    dlng: float = Query(..., ge=-180, le=180, description="目的地の経度"),
    buffer: int = Query(500, ge=100, le=2000, description="ルートからの距離（m）"),
    genre: Optional[list[str]] = Query(None, description="ジャンル（Yelp のカテゴリ alias）。複数指定可（OR条件）"),
    min_rating: float = Query(0, ge=0, le=5, description="評価の下限"),
    max_rating: float = Query(5, ge=0, le=5, description="評価の上限"),
    budget_min: Optional[int] = Query(None, ge=0, description="予算の下限（円）"),
    budget_max: Optional[int] = Query(None, ge=0, description="予算の上限（円）。未指定なら上限なし"),
) -> RouteShopsResponse:
    """OSRM で出発地→目的地のルートを引き、ルートから buffer（m）以内の店舗を返す。

    Yelp はルート上の数地点（最大 ROUTE_MAX_SAMPLES）を中心に検索し、結果をまとめてから
    ルートまでの距離で絞り込む。ルートと候補店舗は ROUTE_CACHE_TTL_S 秒キャッシュする。
    """
    key = (round(olat, 5), round(olng, 5), round(dlat, 5), round(dlng, 5), buffer, bool(yelp.api_key()))
    cached = _route_cache.get(key)
    if cached and time.monotonic() - cached[0] < ROUTE_CACHE_TTL_S:
        _, route, candidates, source = cached
    else:
        route, candidates, source = await _route_candidates(olat, olng, dlat, dlng, buffer)
        if len(_route_cache) >= ROUTE_CACHE_MAX:
            _route_cache.pop(next(iter(_route_cache)))  # 一番古いものを捨てる
        _route_cache[key] = (time.monotonic(), route, candidates, source)
    geometry = routing.RouteGeometry(route.coordinates)

    near_route = []
    for shop in candidates:
        if shop.get("lat") is None or shop.get("lng") is None:
            continue
        distance, along = geometry.locate((shop["lat"], shop["lng"]))
        if distance <= buffer:
            near_route.append({**shop, "distance": distance, "along": along})

    items = filter_shops(
        near_route,
        genres=genre,
        min_rating=min_rating,
        max_rating=max_rating,
        budget_min=budget_min,
        budget_max=budget_max,
    )
    return RouteShopsResponse(
        total=len(candidates),
        items=items,
        genres=genre_facets(near_route),
        source=source,
        route=RouteInfo(
            coordinates=route.coordinates,
            distance_m=route.distance_m,
            duration_s=route.duration_s,
        ),
    )


# ルート検索の結果（ルートと候補店舗）のキャッシュ。ジャンル等の変更のたびに OSRM / Yelp を呼ばないため
ROUTE_CACHE_TTL_S = 600
ROUTE_CACHE_MAX = 32
_route_cache: dict[tuple, tuple[float, routing.Route, list[dict], str]] = {}


async def _route_candidates(
    olat: float, olng: float, dlat: float, dlng: float, buffer: int
) -> tuple[routing.Route, list[dict], str]:
    try:
        route = await routing.fetch_route((olat, olng), (dlat, dlng))
    except routing.RoutingError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    geometry = routing.RouteGeometry(route.coordinates)

    if yelp.api_key():
        # 検索円がルートに沿って重なるよう、間隔と半径を決める
        radius = max(buffer * 2, 1500)
        spacing = max(geometry.length / (ROUTE_MAX_SAMPLES - 1), radius)
        radius = min(YELP_MAX_RADIUS_M, max(radius, math.ceil(spacing * 0.75)))
        semaphore = asyncio.Semaphore(ROUTE_YELP_CONCURRENCY)

        async def search(p: routing.LatLng) -> list[dict]:
            async with semaphore:
                return (await yelp.search_shops(None, None, p[0], p[1], radius_m=radius))[1]

        try:
            batches = await asyncio.gather(*(search(p) for p in geometry.sample(spacing)))
        except yelp.YelpError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        candidates = list({s["id"]: s for batch in batches for s in batch}.values())
        return route, candidates, "yelp"
    return route, SHOPS, "mock"


@app.get("/api/geocode", response_model=list[GeocodeResult])
async def geocode(q: str = Query(..., min_length=1, max_length=200, description="地名・住所・駅名など")):
    try:
        return await routing.geocode(q)
    except routing.RoutingError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
