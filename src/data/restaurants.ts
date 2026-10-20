/**
 * 飲食店の型・検索条件・API クライアント。
 *
 * 店舗データは FastAPI（backend/main.py）の `GET /api/shops` から取得します。
 * 型は backend の Pydantic モデル `Shop` と 1:1 です。
 */

export const AREAS = [
  "渋谷",
  "表参道",
  "恵比寿",
  "中目黒",
  "六本木",
  "新宿",
  "池袋",
  "銀座",
] as const

export const GENRES = [
  "寿司",
  "ラーメン",
  "イタリアン",
  "カフェ",
  "居酒屋",
  "焼肉",
  "ポケ",
] as const

export type Area = (typeof AREAS)[number]
export type Genre = (typeof GENRES)[number]

export interface Restaurant {
  id: number
  name: string
  area: Area
  genre: Genre
  /** 1人あたりの平均予算（円） */
  budget: number
  /** 評価（1.0〜5.0） */
  rating: number
  review_count: number
  description: string
  image: string
}

/* ------------------------------------------------------------------ */
/* 検索条件                                                            */
/* ------------------------------------------------------------------ */

export const ALL_AREAS = "all"
export const BUDGET_MIN = 0
/** スライダー上限。上限をここに置いたときは「上限なし」として扱う */
export const BUDGET_MAX = 20000
export const BUDGET_STEP = 500

export interface SearchFilters {
  /** エリア名。ALL_AREAS のときは全エリア */
  area: Area | typeof ALL_AREAS
  /** 1人あたり予算の範囲 [下限, 上限]（円） */
  budget: [number, number]
  /** 選択ジャンル。空配列は「指定なし（すべて）」 */
  genres: Genre[]
  /** 最低評価。0 は「指定なし」 */
  minRating: number
}

export const DEFAULT_FILTERS: SearchFilters = {
  area: ALL_AREAS,
  budget: [BUDGET_MIN, BUDGET_MAX],
  genres: [],
  minRating: 0,
}

export type SortKey = "recommended" | "rating" | "priceAsc" | "priceDesc"

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "おすすめ順" },
  { value: "rating", label: "評価の高い順" },
  { value: "priceAsc", label: "価格の安い順" },
  { value: "priceDesc", label: "価格の高い順" },
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
    default:
      return sorted.sort((a, b) => recommendScore(b) - recommendScore(a))
  }
}

/** 予算を「¥」の段階表示にする（〜¥1,500 / 〜¥4,000 / 〜¥10,000 / それ以上） */
export function priceTier(budget: number): string {
  if (budget <= 1500) return "¥"
  if (budget <= 4000) return "¥¥"
  if (budget <= 10000) return "¥¥¥"
  return "¥¥¥¥"
}

export const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`

/* ------------------------------------------------------------------ */
/* API クライアント                                                     */
/* ------------------------------------------------------------------ */

export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

export interface ShopsResponse {
  /** 絞り込み前の総件数 */
  total: number
  items: Restaurant[]
}

/** SearchFilters を FastAPI のクエリパラメータに変換して取得する */
export async function fetchShops(
  filters: SearchFilters,
  signal?: AbortSignal,
): Promise<ShopsResponse> {
  const params = new URLSearchParams()
  if (filters.area !== ALL_AREAS) params.set("area", filters.area)
  filters.genres.forEach((g) => params.append("genre", g))
  if (filters.minRating > 0) params.set("min_rating", String(filters.minRating))
  const [minBudget, maxBudget] = filters.budget
  if (minBudget > BUDGET_MIN) params.set("budget_min", String(minBudget))
  if (maxBudget < BUDGET_MAX) params.set("budget_max", String(maxBudget))

  const res = await fetch(`${API_BASE}/api/shops?${params}`, { signal })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}
