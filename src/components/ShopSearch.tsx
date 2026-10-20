import { useEffect, useMemo, useState } from "react"
import {
  ChevronLeft,
  ImageOff,
  Loader2,
  MapPin,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  Star,
  UtensilsCrossed,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  ALL_AREAS,
  AREAS,
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  DEFAULT_FILTERS,
  GENRES,
  SORT_OPTIONS,
  fetchShops,
  formatYen,
  priceTier,
  sortRestaurants,
  type Genre,
  type Restaurant,
  type SearchFilters,
  type SortKey,
} from "@/data/restaurants"

/* ------------------------------------------------------------------ */
/* 画面本体：検索条件を useState で保持し、変更のたびに FastAPI から再取得する */
/* ------------------------------------------------------------------ */

export default function RestaurantSearch({ onHome }: { onHome?: () => void }) {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>("recommended")
  const [filtersOpen, setFiltersOpen] = useState(false) // モバイルのみ使用

  const [shops, setShops] = useState<Restaurant[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [retryCount, setRetryCount] = useState(0)

  // 検索条件が変わるたびに API を呼ぶ。
  // - スライダー操作中の連続リクエストを避けるため 250ms デバウンス
  // - 古いリクエストは AbortController で破棄（レスポンスの追い越し対策）
  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")
    const timer = window.setTimeout(() => {
      fetchShops(filters, controller.signal)
        .then((data) => {
          setShops(data.items)
          setTotal(data.total)
          setStatus("ready")
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return
          setStatus("error")
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [filters, retryCount])

  // 並び替えはクライアント側で実施
  const results = useMemo(() => sortRestaurants(shops, sortKey), [shops, sortKey])

  const update = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }))

  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)
  const reset = () => setFilters(DEFAULT_FILTERS)

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Header onHome={onHome} />

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[300px_1fr] lg:items-start lg:px-8">
        {/* モバイル：フィルタ開閉ボタン */}
        <Button
          variant="outline"
          className="w-full justify-between lg:hidden"
          aria-expanded={filtersOpen}
          aria-controls="filter-panel"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal /> 絞り込み条件
          </span>
          <span className="text-xs text-muted-foreground">
            {filtersOpen ? "閉じる" : "開く"}
          </span>
        </Button>

        <div
          id="filter-panel"
          className={`${filtersOpen ? "block" : "hidden"} lg:sticky lg:top-20 lg:block`}
        >
          <FilterPanel
            filters={filters}
            onChange={update}
            onReset={reset}
            resetDisabled={isDefault}
          />
        </div>

        <section aria-label="検索結果" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1 text-sm" aria-live="polite">
              <span className="text-2xl font-bold tabular-nums">{results.length}</span>
              <span className="ml-1 text-muted-foreground">
                件のお店（全{total}件中）
              </span>
              {status === "loading" && (
                <Loader2 className="ml-2 size-4 animate-spin text-muted-foreground" />
              )}
            </p>
            <div className="flex items-center gap-2">
              <Label htmlFor="sort" className="text-muted-foreground">
                並び替え
              </Label>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger id="sort" className="w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {status === "error" ? (
            <ErrorState onRetry={() => setRetryCount((c) => c + 1)} />
          ) : status === "loading" && shops.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">読み込み中…</p>
          ) : results.length > 0 ? (
            <ul
              className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${
                status === "loading" ? "opacity-60" : ""
              }`}
            >
              {results.map((r) => (
                <li key={r.id}>
                  <RestaurantCard restaurant={r} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState onReset={reset} />
          )}
        </section>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ヘッダー                                                             */
/* ------------------------------------------------------------------ */

function Header({ onHome }: { onHome?: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {onHome && (
          <Button variant="ghost" size="icon" onClick={onHome} aria-label="ホームへ戻る">
            <ChevronLeft />
          </Button>
        )}
        <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-4" />
          </span>
          FindRestr
        </div>
        <p className="ml-auto hidden text-sm text-muted-foreground sm:block">
          エリア・予算・ジャンル・評価でお店を探す
        </p>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* 検索条件パネル                                                       */
/* ------------------------------------------------------------------ */

interface FilterPanelProps {
  filters: SearchFilters
  onChange: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void
  onReset: () => void
  resetDisabled: boolean
}

function FilterPanel({ filters, onChange, onReset, resetDisabled }: FilterPanelProps) {
  const [minB, maxB] = filters.budget

  const toggleGenre = (genre: Genre, checked: boolean) =>
    onChange(
      "genres",
      checked ? [...filters.genres, genre] : filters.genres.filter((g) => g !== genre),
    )

  return (
    <Card className="gap-5 py-5">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">検索条件</CardTitle>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={resetDisabled}>
          <RotateCcw /> リセット
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* エリア */}
        <div className="space-y-2">
          <Label htmlFor="area">エリア</Label>
          <Select
            value={filters.area}
            onValueChange={(v) => onChange("area", v as SearchFilters["area"])}
          >
            <SelectTrigger id="area" className="bg-background">
              <MapPin className="text-muted-foreground" />
              <SelectValue placeholder="エリアを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AREAS}>すべてのエリア</SelectItem>
              {AREAS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 予算 */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label>予算（1人あたり）</Label>
            <span className="text-sm font-medium tabular-nums text-primary">
              {formatYen(minB)} 〜 {maxB >= BUDGET_MAX ? `${formatYen(BUDGET_MAX)}以上` : formatYen(maxB)}
            </span>
          </div>
          <Slider
            min={BUDGET_MIN}
            max={BUDGET_MAX}
            step={BUDGET_STEP}
            minStepsBetweenThumbs={1}
            value={filters.budget}
            thumbLabels={["予算の下限", "予算の上限"]}
            onValueChange={(v) => onChange("budget", [v[0], v[1]])}
          />
        </div>

        {/* ジャンル */}
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm leading-none font-medium">
            ジャンル
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {filters.genres.length === 0 ? "すべて" : `${filters.genres.length}件選択`}
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {GENRES.map((g) => (
              <div key={g} className="flex items-center gap-2">
                <Checkbox
                  id={`genre-${g}`}
                  checked={filters.genres.includes(g)}
                  onCheckedChange={(c) => toggleGenre(g, c === true)}
                />
                <Label htmlFor={`genre-${g}`} className="cursor-pointer font-normal">
                  {g}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        {/* 評価 */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label>評価</Label>
            <span className="flex items-center gap-1 text-sm font-medium tabular-nums text-primary">
              {filters.minRating === 0 ? (
                "指定なし"
              ) : (
                <>
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  {filters.minRating.toFixed(1)} 以上
                </>
              )}
            </span>
          </div>
          <Slider
            min={0}
            max={5}
            step={0.5}
            value={[filters.minRating]}
            thumbLabels={["最低評価"]}
            onValueChange={(v) => onChange("minRating", v[0])}
          />
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 店舗カード                                                           */
/* ------------------------------------------------------------------ */

function RestaurantCard({ restaurant: r }: { restaurant: Restaurant }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/10] bg-muted">
        {imageFailed ? (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageOff />
          </div>
        ) : (
          <img
            src={r.image}
            alt={`${r.name}の料理・店内`}
            loading="lazy"
            className="size-full object-cover"
            onError={() => setImageFailed(true)}
          />
        )}
        <Badge className="absolute top-3 left-3 bg-background/90 text-foreground backdrop-blur">
          {r.genre}
        </Badge>
      </div>

      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="leading-snug font-semibold">{r.name}</h3>
          <span className="shrink-0 text-sm font-medium text-primary">
            {priceTier(r.budget)}
          </span>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          {r.area}｜平均 {formatYen(r.budget)}
        </p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            {r.rating.toFixed(1)}
            <span className="text-xs font-normal text-muted-foreground">
              ({r.review_count.toLocaleString("ja-JP")})
            </span>
          </span>
          <Button variant="outline" size="sm">
            詳しく
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 該当なし                                                             */
/* ------------------------------------------------------------------ */

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <Card className="items-center gap-3 border-dashed py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" />
      <p className="font-semibold">条件に合うお店が見つかりませんでした</p>
      <p className="text-sm text-muted-foreground">
        予算の範囲を広げるか、評価・ジャンルの条件をゆるめてみてください。
      </p>
      <Button variant="outline" onClick={onReset}>
        <RotateCcw /> 条件をリセット
      </Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* API エラー                                                           */
/* ------------------------------------------------------------------ */

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="items-center gap-3 border-dashed py-16 text-center" role="alert">
      <SearchX className="size-10 text-muted-foreground" />
      <p className="font-semibold">店舗データを取得できませんでした</p>
      <p className="text-sm text-muted-foreground">
        バックエンド（http://localhost:8000）が起動しているか確認してください。
      </p>
      <Button variant="outline" onClick={onRetry}>
        <RotateCcw /> 再読み込み
      </Button>
    </Card>
  )
}
