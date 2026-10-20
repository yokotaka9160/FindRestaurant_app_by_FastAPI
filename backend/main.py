"""飲食店検索 API。

起動:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

エンドポイント:
    GET /api/shops?area=渋谷&genre=寿司&genre=カフェ&min_rating=4&budget_min=1000&budget_max=8000
"""

from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from shops import SHOPS, filter_shops

app = FastAPI(title="FindRestr API")

# Vite の開発サーバー（localhost の任意ポート）からのアクセスを許可
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET"],
    allow_headers=["*"],
)


class Shop(BaseModel):
    id: int
    name: str
    area: str
    genre: str
    budget: int  # 1人あたりの平均予算（円）
    rating: float
    review_count: int
    description: str
    image: str


class ShopsResponse(BaseModel):
    total: int  # 絞り込み前の総件数
    items: list[Shop]  # 絞り込み後の店舗


@app.get("/api/shops", response_model=ShopsResponse)
def list_shops(
    area: Optional[str] = Query(None, description="エリア名（完全一致）。未指定なら全エリア"),
    genre: Optional[list[str]] = Query(None, description="ジャンル。複数指定可（OR条件）"),
    min_rating: float = Query(0, ge=0, le=5, description="最低評価"),
    budget_min: Optional[int] = Query(None, ge=0, description="予算の下限（円）"),
    budget_max: Optional[int] = Query(None, ge=0, description="予算の上限（円）。未指定なら上限なし"),
) -> ShopsResponse:
    items = filter_shops(
        SHOPS,
        area=area,
        genres=genre,
        min_rating=min_rating,
        budget_min=budget_min,
        budget_max=budget_max,
    )
    return ShopsResponse(total=len(SHOPS), items=items)
