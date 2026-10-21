"""Yelp Fusion API（GET /v3/businesses/search）から店舗を取得し、Shop 形式に変換する。

API キーは環境変数 YELP_API_KEY から読み込む（ブラウザに渡さないため、必ずバックエンド経由で呼ぶ）。
https://docs.developer.yelp.com/reference/v3_business_search
"""

from __future__ import annotations

import os
from typing import Optional

import httpx

from categories_ja import ja_title

YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"
YELP_MAX_LIMIT = 50  # 1 リクエストで取得できる最大件数
# 飲食店全体（Yelp の親カテゴリ）。ジャンルは結果の categories から作り、絞り込みは呼び出し側で行う
YELP_CATEGORIES = "restaurants"


def api_key() -> Optional[str]:
    return os.environ.get("YELP_API_KEY") or None


DEFAULT_PREFECTURE = "東京都"
UNKNOWN_GENRE = "その他"

# Yelp の価格帯（$〜$$$$）→ 1人あたりの目安予算（円）
PRICE_TO_BUDGET = {1: 1000, 2: 3000, 3: 7000, 4: 15000}
UNKNOWN_PRICE_BUDGET = 3000


class YelpError(Exception):
    pass


def to_shop(business: dict, prefecture: Optional[str], area: Optional[str]) -> dict:
    price = len(business.get("price") or "")
    categories = [
        {"alias": c["alias"], "title": ja_title(c["alias"], c.get("title") or c["alias"])}
        for c in business.get("categories", [])
        if c.get("alias")
    ]
    location = business.get("location", {})
    address = " ".join(location.get("display_address", []))
    coords = business.get("coordinates") or {}
    return {
        "id": business["id"],
        "name": business.get("name", ""),
        "prefecture": prefecture or "",
        # エリア指定時はその名前、未指定（都道府県全域・現在地）なら店舗住所の city
        "area": area or location.get("city") or "",
        "distance": business.get("distance"),
        "lat": coords.get("latitude"),
        "lng": coords.get("longitude"),
        "genre": categories[0]["title"] if categories else UNKNOWN_GENRE,
        "categories": categories,
        "budget": PRICE_TO_BUDGET.get(price, UNKNOWN_PRICE_BUDGET),
        "rating": float(business.get("rating") or 0),
        "review_count": int(business.get("review_count") or 0),
        "description": "｜".join(
            s for s in ("・".join(c["title"] for c in categories), address) if s
        ),
        "image": business.get("image_url") or "",
        "url": business.get("url"),
    }


async def search_shops(
    prefecture: Optional[str],
    area: Optional[str],
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_m: int = 5000,
) -> tuple[int, list[dict]]:
    """Yelp で飲食店を検索し (Yelp 上の該当総件数, Shop 形式の店舗リスト) を返す。

    lat / lng があれば現在地から radius_m 以内、なければ「<エリア>, <都道府県>」で検索する。
    ジャンル・評価・予算の絞り込みは呼び出し側（filter_shops）で行う。
    """
    key = api_key()
    if not key:
        raise YelpError("YELP_API_KEY が設定されていません")

    params: dict = {
        "categories": YELP_CATEGORIES,
        "locale": "ja_JP",
        "limit": YELP_MAX_LIMIT,
        "sort_by": "best_match",
    }
    if lat is not None and lng is not None:
        params.update(latitude=lat, longitude=lng, radius=radius_m)
        prefecture = area = None
    else:
        prefecture = prefecture or DEFAULT_PREFECTURE
        params["location"] = f"{area}, {prefecture}" if area else prefecture
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            res = await client.get(
                YELP_SEARCH_URL,
                params=params,
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            )
        except httpx.HTTPError as e:
            raise YelpError(f"Yelp API に接続できません: {e}") from e

    if res.status_code != 200:
        raise YelpError(f"Yelp API error {res.status_code}: {res.text[:200]}")

    data = res.json()
    shops = [to_shop(b, prefecture, area) for b in data.get("businesses", [])]
    return int(data.get("total", len(shops))), shops
