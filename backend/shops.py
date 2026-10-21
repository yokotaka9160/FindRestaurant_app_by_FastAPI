"""モック店舗データと検索ロジック（FastAPI に依存しないので単体でテスト可能）。"""

from __future__ import annotations

import math
from typing import Optional, Sequence

from categories_ja import ja_title


def unsplash(photo_id: str, width: int = 800) -> str:
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w={width}&q=80"


GENRE_PHOTO = {
    "寿司": unsplash("photo-1768614437681-704009224482"),
    "ラーメン": unsplash("photo-1779635593399-726a96741c4c"),
    "イタリアン": unsplash("photo-1574071318508-1cdbab80d002"),
    "カフェ": unsplash("photo-1544148103-0773bf10d330"),
    "居酒屋": unsplash("photo-1779635593399-726a96741c4c"),
    "焼肉": unsplash("photo-1779635593399-726a96741c4c"),
    "ポケ": unsplash("photo-1602881917445-0b1ba001addf"),
}

_SEEDS = [
    {"id": 1, "name": "鮨 たかはし", "area": "渋谷", "genre": "寿司", "budget": 18000, "rating": 4.7, "review_count": 312,
     "description": "握りのネタが新鮮で、一貫ごとの満足度が高いカウンター寿司。特別な日のディナーに。"},
    {"id": 2, "name": "トラットリア・ベッロ", "area": "中目黒", "genre": "イタリアン", "budget": 4500, "rating": 4.6, "review_count": 528,
     "description": "薪窯で焼く香ばしいピザとワイン。気取らず楽しめる人気店。"},
    {"id": 3, "name": "カフェ ミナ", "area": "表参道", "genre": "カフェ", "budget": 1200, "rating": 4.2, "review_count": 187,
     "description": "落ち着いた雰囲気で長居OK。自家焙煎コーヒーと焼き菓子が自慢。"},
    {"id": 4, "name": "POKE STAND HANA", "area": "六本木", "genre": "ポケ", "budget": 1800, "rating": 4.1, "review_count": 96,
     "description": "ヘルシー志向に人気のポケボウル専門店。トッピングを自由に選べる。"},
    {"id": 5, "name": "炭火居酒屋 炎", "area": "池袋", "genre": "居酒屋", "budget": 3500, "rating": 4.0, "review_count": 241,
     "description": "気軽に楽しめる串焼きと日本酒。仕事帰りの一杯にちょうどいい。"},
    {"id": 6, "name": "麺屋 雷鳴", "area": "新宿", "genre": "ラーメン", "budget": 1100, "rating": 4.4, "review_count": 1204,
     "description": "濃厚豚骨魚介のつけ麺が名物。昼どきは行列必至。"},
    {"id": 7, "name": "焼肉 銀座 牛蔵", "area": "銀座", "genre": "焼肉", "budget": 12000, "rating": 4.8, "review_count": 402,
     "description": "A5ランクの和牛を個室でゆったり。接待や記念日に最適。"},
    {"id": 8, "name": "オステリア ルーチェ", "area": "恵比寿", "genre": "イタリアン", "budget": 6500, "rating": 4.5, "review_count": 356,
     "description": "季節野菜を使った自家製パスタが評判。ナチュラルワインも豊富。"},
    {"id": 9, "name": "寿司 まるやま", "area": "新宿", "genre": "寿司", "budget": 3200, "rating": 3.8, "review_count": 143,
     "description": "ランチはワンコインから。気軽に入れる立ち食いスタイルの寿司店。"},
    {"id": 10, "name": "珈琲 森の時計", "area": "恵比寿", "genre": "カフェ", "budget": 1500, "rating": 4.3, "review_count": 264,
     "description": "緑に囲まれたテラス席が人気。ふわふわのパンケーキも定番。"},
    {"id": 11, "name": "ラーメン 灯", "area": "池袋", "genre": "ラーメン", "budget": 950, "rating": 3.9, "review_count": 689,
     "description": "あっさり醤油の中華そば。深夜まで営業していて〆に最適。"},
    {"id": 12, "name": "個室居酒屋 しずく", "area": "渋谷", "genre": "居酒屋", "budget": 4800, "rating": 4.2, "review_count": 318,
     "description": "全席個室で宴会向き。旬の魚と地酒のペアリングコースが人気。"},
    {"id": 13, "name": "焼肉 ホルモン酒場 ぼん", "area": "新宿", "genre": "焼肉", "budget": 4200, "rating": 3.7, "review_count": 451,
     "description": "新鮮ホルモンをリーズナブルに。ハイボールとの相性抜群。"},
    {"id": 14, "name": "ALOHA BOWL 青山", "area": "表参道", "genre": "ポケ", "budget": 1600, "rating": 4.0, "review_count": 73,
     "description": "サーモンとアボカドのボウルが看板。テイクアウトにも対応。"},
    {"id": 15, "name": "リストランテ ラ・ルナ", "area": "六本木", "genre": "イタリアン", "budget": 15000, "rating": 4.7, "review_count": 219,
     "description": "ミシュラン掲載のモダンイタリアン。夜景を望むテーブルが人気。"},
    {"id": 16, "name": "鮨 銀座 いわさき", "area": "銀座", "genre": "寿司", "budget": 19000, "rating": 4.9, "review_count": 168,
     "description": "江戸前の伝統を守る名店。おまかせコースのみ、要予約。"},
]

# モック店舗の位置（エリアの中心付近）。現在地検索の距離計算に使う
_AREA_COORDS = {
    "渋谷": (35.6595, 139.7005),
    "表参道": (35.6652, 139.7123),
    "恵比寿": (35.6467, 139.7101),
    "中目黒": (35.6440, 139.6990),
    "六本木": (35.6628, 139.7314),
    "新宿": (35.6909, 139.7003),
    "池袋": (35.7295, 139.7109),
    "銀座": (35.6717, 139.7650),
}

# モックのジャンル → Yelp のカテゴリ（alias, title）。Yelp の結果と同じく title は日本語表記
_GENRE_CATEGORY = {
    genre: (alias, ja_title(alias, genre))
    for genre, alias in {
        "寿司": "sushi",
        "ラーメン": "ramen",
        "イタリアン": "italian",
        "カフェ": "cafes",
        "居酒屋": "izakaya",
        "焼肉": "yakiniku",
        "ポケ": "poke",
    }.items()
}


def _jitter(i: int) -> float:
    """同じエリアの店が地図上で重ならないよう、id から決まる小さなずれ（±約500m）"""
    return ((i * 37) % 11 - 5) * 0.001


SHOPS = [
    {
        **s,
        "id": str(s["id"]),
        "prefecture": "東京都",
        "genre": _GENRE_CATEGORY[s["genre"]][1],
        "categories": [dict(zip(("alias", "title"), _GENRE_CATEGORY[s["genre"]]))],
        "lat": _AREA_COORDS[s["area"]][0] + _jitter(s["id"]),
        "lng": _AREA_COORDS[s["area"]][1] + _jitter(s["id"] * 3),
        "image": GENRE_PHOTO[s["genre"]],
    }
    for s in _SEEDS
]


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2 点間の距離（m、ハーバーサイン）"""
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def with_distance(shops: Sequence[dict], lat: float, lng: float) -> list[dict]:
    return [{**s, "distance": distance_m(lat, lng, s["lat"], s["lng"])} for s in shops]


def filter_shops(
    shops: Sequence[dict],
    prefecture: Optional[str] = None,
    area: Optional[str] = None,
    genres: Optional[Sequence[str]] = None,  # Yelp のカテゴリ alias。いずれかを含めば一致
    min_rating: float = 0.0,
    max_rating: float = 5.0,
    budget_min: Optional[int] = None,
    budget_max: Optional[int] = None,
    max_distance: Optional[float] = None,
) -> list[dict]:
    """クエリ条件に合致する店舗だけを返す。未指定（None / 空）の条件は無視する。"""
    result = []
    for shop in shops:
        if prefecture and shop["prefecture"] != prefecture:
            continue
        if area and shop["area"] != area:
            continue
        if genres and not any(c["alias"] in genres for c in shop["categories"]):
            continue
        if not (min_rating <= shop["rating"] <= max_rating):
            continue
        if max_distance is not None and (shop.get("distance") or 0) > max_distance:
            continue
        if budget_min is not None and shop["budget"] < budget_min:
            continue
        if budget_max is not None and shop["budget"] > budget_max:
            continue
        result.append(shop)
    return result


def genre_facets(shops: Sequence[dict]) -> list[dict]:
    """店舗のカテゴリを集計し、件数の多い順に [{alias, title, count}] を返す（ジャンルの選択肢用）"""
    facets: dict[str, dict] = {}
    for shop in shops:
        for c in shop["categories"]:
            f = facets.setdefault(c["alias"], {"alias": c["alias"], "title": c["title"], "count": 0})
            f["count"] += 1
    return sorted(facets.values(), key=lambda f: (-f["count"], f["title"]))
