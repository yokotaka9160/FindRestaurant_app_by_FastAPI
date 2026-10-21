/**
 * 飲食店の型・検索条件・API クライアント。
 *
 * 店舗データは FastAPI（backend/main.py）の `GET /api/shops` から取得します。
 * バックエンドが Yelp Fusion API を呼び出します（API キーをブラウザに出さないため）。
 * 型は backend の Pydantic モデル `Shop` と 1:1 です。
 */

import { DEFAULT_PREFECTURE } from "@/data/areas"

/** Yelp のカテゴリ */
export interface Category {
  /** カテゴリ ID（例: sushi）。ジャンル検索の値に使う */
  alias: string
  /** 日本語の表示名（例: 寿司）。バックエンドで対訳がないカテゴリは Yelp の英語名 */
  title: string
}

/** ジャンルの選択肢（エリア内の店舗のカテゴリを集計したもの） */
export interface GenreFacet extends Category {
  count: number
}

export interface Restaurant {
  /** Yelp の business id（モック時は連番の文字列） */
  id: string
  name: string
  /** 都道府県。現在地検索の Yelp 結果では空文字 */
  prefecture: string
  /** 市区町村・エリア名（Yelp の場合は店舗住所の city） */
  area: string
  /** 現在地検索では現在地から、ルート検索ではルートからの距離（m） */
  distance?: number | null
  /** ルート検索のみ：出発地からの道のり（m） */
  along?: number | null
  /** 緯度・経度（地図表示用）。Yelp に座標がない店舗は null */
  lat?: number | null
  lng?: number | null
  /** 代表ジャンル（categories の先頭の title） */
  genre: string
  categories: Category[]
  /** 1人あたりの平均予算（円）。Yelp の場合は価格帯（$〜$$$$）からの目安 */
  budget: number
  /** 評価（1.0〜5.0） */
  rating: number
  review_count: number
  description: string
  /** 画像 URL。Yelp に画像がない店舗は空文字 */
  image: string
  /** Yelp の店舗ページ */
  url?: string | null
}

/* ------------------------------------------------------------------ */
/* 検索条件                                                            */
/* ------------------------------------------------------------------ */

export const ALL_AREAS = "all"
export const BUDGET_MIN = 0
/** スライダー上限。上限をここに置いたときは「上限なし」として扱う */
export const BUDGET_MAX = 20000
export const BUDGET_STEP = 500
export const RATING_MIN = 0
export const RATING_MAX = 5
/** 現在地検索の半径（km）の範囲。backend の radius（m）の上下限と合わせる */
export const RADIUS_MIN_KM = 1
export const RADIUS_MAX_KM = 5

/** ルート検索：ルートからの距離（m）の選択肢。backend の buffer（100〜2000）の範囲内 */
export const ROUTE_BUFFER_OPTIONS = [200, 500, 1000, 2000] as const
export const DEFAULT_ROUTE_BUFFER_M = 500

export interface GeoPoint {
  lat: number
  lng: number
}

/** ルートの出発地・目的地 */
export interface RoutePoint extends GeoPoint {
  /** 表示名（地名検索の結果名、または「現在地」） */
  label: string
}

export type SearchMode = "area" | "route"

export interface SearchFilters {
  /** 検索方法：エリア（都道府県・市区町村・現在地周辺）か、ルート沿いか */
  mode: SearchMode
  /** ルート検索の出発地・目的地。どちらも決まったら検索する */
  origin: RoutePoint | null
  destination: RoutePoint | null
  /** ルート検索：ルートからの距離（m） */
  routeBufferM: number
  /** 都道府県名 */
  prefecture: string
  /** 市区町村・エリア名。ALL_AREAS のときは都道府県全体 */
  area: string
  /** 現在地。設定されているときは prefecture / area より優先して周辺を検索する */
  currentLocation: GeoPoint | null
  /** 現在地検索の半径（km） */
  radiusKm: number
  /** 1人あたり予算の範囲 [下限, 上限]（円） */
  budget: [number, number]
  /** 選択ジャンル（Category.alias）。空配列は「指定なし（すべて）」 */
  genres: string[]
  /** 評価の範囲 [下限, 上限]。[0, 5] は「指定なし」 */
  rating: [number, number]
}

export const DEFAULT_FILTERS: SearchFilters = {
  mode: "area",
  origin: null,
  destination: null,
  routeBufferM: DEFAULT_ROUTE_BUFFER_M,
  prefecture: DEFAULT_PREFECTURE,
  area: ALL_AREAS,
  currentLocation: null,
  radiusKm: RADIUS_MAX_KM,
  budget: [BUDGET_MIN, BUDGET_MAX],
  genres: [],
  rating: [RATING_MIN, RATING_MAX],
}

export type SortKey = "recommended" | "rating" | "priceAsc" | "priceDesc" | "route"

export const SORT_OPTIONS: { value: SortKey; label: string; routeOnly?: boolean }[] = [
  { value: "recommended", label: "おすすめ順" },
  { value: "rating", label: "評価の高い順" },
  { value: "priceAsc", label: "価格の安い順" },
  { value: "priceDesc", label: "価格の高い順" },
  { value: "route", label: "ルート順", routeOnly: true },
]

/** おすすめスコア：評価をレビュー数で補正（レビューが少ない店の過大評価を抑える） */
function recommendScore(r: Restaurant) {
  return r.rating * Math.log10(r.review_count + 10)
}

/** 並び替え（新しい配列を返す） */
export function sortRestaurants(list: Restaurant[], key: SortKey): Restaurant[] {
  const sorted = [...list]
  switch (key) {
    case "rating":
      return sorted.sort((a, b) => b.rating - a.rating || b.review_count - a.review_count)
    case "priceAsc":
      return sorted.sort((a, b) => a.budget - b.budget)
    case "priceDesc":
      return sorted.sort((a, b) => b.budget - a.budget)
    case "route":
      return sorted.sort((a, b) => (a.along ?? 0) - (b.along ?? 0))
    default:
      return sorted.sort((a, b) => recommendScore(b) - recommendScore(a))
  }
}

export const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`

export const formatDistance = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? `${minutes}分` : `${Math.floor(minutes / 60)}時間${minutes % 60}分`
}

/** ルート検索の条件がそろっているか（そろうまで API は呼ばない） */
export const isRouteReady = (f: SearchFilters) =>
  f.mode === "route" && f.origin !== null && f.destination !== null

/* ------------------------------------------------------------------ */
/* API クライアント                                                     */
/* ------------------------------------------------------------------ */

export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

export interface ShopsResponse {
  /** 絞り込み前の総件数（Yelp の場合は Yelp 上の該当件数） */
  total: number
  items: Restaurant[]
  /** ジャンルの選択肢（件数の多い順） */
  genres: GenreFacet[]
  /** データの取得元。バックエンドに YELP_API_KEY が無いと "mock" */
  source: "yelp" | "mock"
  /** ルート検索のときだけ入る */
  route?: RouteInfo
}

export interface RouteInfo {
  /** [lat, lng] の列 */
  coordinates: [number, number][]
  distance_m: number
  duration_s: number
}

export interface GeocodeResult extends GeoPoint {
  name: string
}

/** API のエラー。FastAPI の detail（日本語メッセージ）を message に入れる */
export class ApiError extends Error {}

async function getJson<T>(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}?${params}`, { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(typeof body?.detail === "string" ? body.detail : `API error: ${res.status}`)
  }
  return res.json()
}

/** SearchFilters を FastAPI のクエリパラメータに変換して取得する（ルート検索なら /api/shops/route） */
export async function fetchShops(
  filters: SearchFilters,
  signal?: AbortSignal,
): Promise<ShopsResponse> {
  const params = new URLSearchParams()
  const { origin, destination } = filters
  const route = filters.mode === "route" && origin !== null && destination !== null
  if (route) {
    params.set("olat", String(origin.lat))
    params.set("olng", String(origin.lng))
    params.set("dlat", String(destination.lat))
    params.set("dlng", String(destination.lng))
    params.set("buffer", String(filters.routeBufferM))
  } else if (filters.currentLocation) {
    params.set("lat", String(filters.currentLocation.lat))
    params.set("lng", String(filters.currentLocation.lng))
    params.set("radius", String(filters.radiusKm * 1000))
  } else {
    params.set("prefecture", filters.prefecture)
    if (filters.area !== ALL_AREAS) params.set("area", filters.area)
  }
  filters.genres.forEach((g) => params.append("genre", g))
  const [minRating, maxRating] = filters.rating
  if (minRating > RATING_MIN) params.set("min_rating", String(minRating))
  if (maxRating < RATING_MAX) params.set("max_rating", String(maxRating))
  const [minBudget, maxBudget] = filters.budget
  if (minBudget > BUDGET_MIN) params.set("budget_min", String(minBudget))
  if (maxBudget < BUDGET_MAX) params.set("budget_max", String(maxBudget))

  return getJson(route ? "/api/shops/route" : "/api/shops", params, signal)
}

/** 地名・住所・駅名から座標の候補を探す（バックエンド経由で Nominatim） */
export function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  return getJson("/api/geocode", new URLSearchParams({ q: query }), signal)
}
