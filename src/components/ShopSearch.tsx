import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ImageOff,
  LayoutGrid,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  RotateCcw,
  Route,
  SearchX,
  SlidersHorizontal,
  Star,
  UtensilsCrossed,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import RouteSearchFields from "@/components/RouteSearchFields"
import { REGIONS, citiesOf } from "@/data/areas"
import { useGeolocation } from "@/hooks/useGeolocation"
import {
  ALL_AREAS,
  ApiError,
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  DEFAULT_FILTERS,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  RATING_MAX,
  RATING_MIN,
  SORT_OPTIONS,
  fetchShops,
  formatDistance,
  formatDuration,
  formatYen,
  isRouteReady,
  sortRestaurants,
  type GenreFacet,
  type Restaurant,
  type RouteInfo,
  type SearchFilters,
  type ShopsResponse,
  type SortKey,
} from "@/data/restaurants"

// 地図（Leaflet）は地図表示に切り替えたときだけ読み込む
const ShopMap = lazy(() => import("@/components/ShopMap"))

/** ジャンルの選択肢を最初に表示する数（残りは「もっと見る」） */
const GENRE_PREVIEW_COUNT = 12

/* ------------------------------------------------------------------ */
/* 画面本体：検索条件を useState で保持し、変更のたびに FastAPI から再取得する */
/* ------------------------------------------------------------------ */

export default function RestaurantSearch({ onHome }: { onHome?: () => void }) {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>("recommended")
  const [filtersOpen, setFiltersOpen] = useState(false) // モバイルのみ使用
  const [view, setView] = useState<"list" | "map">("list")

  const [shops, setShops] = useState<Restaurant[]>([])
  const [total, setTotal] = useState(0)
  const [genreFacets, setGenreFacets] = useState<GenreFacet[]>([])
  const [source, setSource] = useState<ShopsResponse["source"] | null>(null)
  // これまでに見たジャンルの表示名（エリアを変えて選択肢から消えた選択中ジャンルの表示用）
  const genreTitles = useRef(new Map<string, string>())
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const routeMode = filters.mode === "route"
  // ルート検索で出発地・目的地がそろっていない
  const routePending = routeMode && !isRouteReady(filters)

  // 検索条件が変わるたびに API を呼ぶ。
  // - スライダー操作中の連続リクエストを避けるため 250ms デバウンス
  // - 古いリクエストは AbortController で破棄（レスポンスの追い越し対策）
  useEffect(() => {
    if (routePending) {
      setShops([])
      setTotal(0)
      setGenreFacets([])
      setRoute(null)
      setStatus("ready")
      return
    }
    const controller = new AbortController()
    setStatus("loading")
    const timer = window.setTimeout(() => {
      fetchShops(filters, controller.signal)
        .then((data) => {
          setShops(data.items)
          setTotal(data.total)
          data.genres.forEach((g) => genreTitles.current.set(g.alias, g.title))
          setGenreFacets(data.genres)
          setSource(data.source)
          setRoute(data.route ?? null)
          setStatus("ready")
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return
          setErrorMessage(err instanceof ApiError ? err.message : null)
          setStatus("error")
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [filters, retryCount, routePending])

  // ルート検索ではルート順を既定にし、ルート検索をやめたら「ルート順」を解除する
  useEffect(() => {
    setSortKey((k) => (routeMode ? "route" : k === "route" ? "recommended" : k))
  }, [routeMode])

  // 出発地・目的地がそろったらルートが見えるよう地図表示に切り替える
  const routeReady = isRouteReady(filters)
  useEffect(() => {
    if (routeReady) setView("map")
  }, [routeReady])

  // 並び替えはクライアント側で実施
  const results = useMemo(() => sortRestaurants(shops, sortKey), [shops, sortKey])
  const sortOptions = SORT_OPTIONS.filter((o) => routeMode || !o.routeOnly)

  // ジャンルの選択肢 = API が返したカテゴリ ＋ 選択中だが今のエリアには無いカテゴリ（0件）
  const genreOptions = useMemo<GenreFacet[]>(() => {
    const missing = filters.genres
      .filter((alias) => !genreFacets.some((g) => g.alias === alias))
      .map((alias) => ({ alias, title: genreTitles.current.get(alias) ?? alias, count: 0 }))
    return [...missing, ...genreFacets]
  }, [genreFacets, filters.genres])

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
          className={`${filtersOpen ? "block" : "hidden"} lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain`}
        >
          <FilterPanel
            filters={filters}
            genreOptions={genreOptions}
            onChange={update}
            onReset={reset}
            resetDisabled={isDefault}
          />
        </div>

        <section aria-label="検索結果" className="min-w-0">
          {routeMode && filters.origin && filters.destination && (
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-background px-3 py-2 text-sm">
              <Route className="size-4 text-primary" />
              <span className="font-medium">{filters.origin.label}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">{filters.destination.label}</span>
              {route && (
                <span className="text-muted-foreground tabular-nums">
                  ｜{formatDistance(route.distance_m)}・車で約{formatDuration(route.duration_s)}
                  ｜ルートから{formatDistance(filters.routeBufferM)}以内
                </span>
              )}
            </div>
          )}
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
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex rounded-md border bg-background p-0.5"
                role="group"
                aria-label="表示切り替え"
              >
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <LayoutGrid /> リスト
                </Button>
                <Button
                  variant={view === "map" ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={view === "map"}
                  onClick={() => setView("map")}
                >
                  <MapIcon /> マップ
                </Button>
              </div>
              {view === "list" && (
                <>
                  <Label htmlFor="sort" className="sr-only">
                    並び替え
                  </Label>
                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger id="sort" className="w-40 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>

          {routePending ? (
            <RoutePendingState />
          ) : status === "error" ? (
            <ErrorState message={errorMessage} onRetry={() => setRetryCount((c) => c + 1)} />
          ) : status === "loading" && shops.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {routeMode ? "ルートとお店を検索中…" : "読み込み中…"}
            </p>
          ) : view === "map" && (results.length > 0 || route) ? (
            <div className={`transition-opacity ${status === "loading" ? "opacity-60" : ""}`}>
              <Suspense
                fallback={
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    地図を読み込み中…
                  </p>
                }
              >
                <ShopMap
                  restaurants={results}
                  currentLocation={routeMode ? null : filters.currentLocation}
                  radiusKm={filters.radiusKm}
                  route={routeMode ? route : null}
                  origin={routeMode ? filters.origin : null}
                  destination={routeMode ? filters.destination : null}
                />
              </Suspense>
              {results.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  ルート沿いに条件に合うお店がありません。ルートからの距離を広げるか、条件をゆるめてください。
                </p>
              )}
            </div>
          ) : results.length > 0 ? (
            <ul
              className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${
                status === "loading" ? "opacity-60" : ""
              }`}
            >
              {results.map((r) => (
                <li key={r.id}>
                  <RestaurantCard restaurant={r} distancePrefix={routeMode ? "ルートから" : ""} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState onReset={reset} />
          )}

          {source === "yelp" && (
            <p className="mt-6 text-right text-xs text-muted-foreground">
              Powered by{" "}
              <a
                href="https://www.yelp.com"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#d32323] hover:underline"
              >
                Yelp
              </a>
              ｜予算は Yelp の価格帯からの目安です
            </p>
          )}
          {source === "mock" && (
            <p className="mt-6 text-right text-xs text-muted-foreground">
              サンプルデータを表示中（バックエンドに YELP_API_KEY を設定すると Yelp の店舗を表示します）
            </p>
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
          エリア・ルート・予算・ジャンル・評価でお店を探す
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
  /** ジャンルの選択肢（API の返り値から作る） */
  genreOptions: GenreFacet[]
  onChange: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void
  onReset: () => void
  resetDisabled: boolean
}

function FilterPanel({
  filters,
  genreOptions,
  onChange,
  onReset,
  resetDisabled,
}: FilterPanelProps) {
  const [minB, maxB] = filters.budget
  const [minR, maxR] = filters.rating
  const geo = useGeolocation()

  const changePrefecture = (prefecture: string) => {
    onChange("prefecture", prefecture)
    onChange("area", ALL_AREAS)
  }

  const [showAllGenres, setShowAllGenres] = useState(false)
  const visibleGenres = showAllGenres
    ? genreOptions
    : genreOptions.slice(0, GENRE_PREVIEW_COUNT)

  const toggleGenre = (alias: string, checked: boolean) =>
    onChange(
      "genres",
      checked ? [...filters.genres, alias] : filters.genres.filter((g) => g !== alias),
    )

  return (
    <Card className="gap-5 py-5">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">検索条件</CardTitle>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={resetDisabled}>
          <RotateCcw /> リセット
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 検索方法の切り替え */}
        <div className="grid grid-cols-2 rounded-md border bg-muted/50 p-0.5" role="tablist">
          {(
            [
              ["area", "エリアで探す", MapPin],
              ["route", "ルートで探す", Route],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={filters.mode === mode}
              onClick={() => onChange("mode", mode)}
              className={`flex items-center justify-center gap-1.5 rounded-[5px] px-2 py-1.5 text-sm transition-colors ${
                filters.mode === mode
                  ? "bg-background font-medium text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {filters.mode === "route" ? (
          <RouteSearchFields
            origin={filters.origin}
            destination={filters.destination}
            bufferM={filters.routeBufferM}
            onOriginChange={(p) => onChange("origin", p)}
            onDestinationChange={(p) => onChange("destination", p)}
            onBufferChange={(m) => onChange("routeBufferM", m)}
          />
        ) : (
          /* エリア：現在地 or 都道府県 → 市区町村 */
          <div className="space-y-2">
            <Label htmlFor="prefecture">エリア</Label>
            {filters.currentLocation ? (
              <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <LocateFixed className="size-4 text-primary" />
                    現在地から
                    <span className="font-medium tabular-nums text-primary">
                      {filters.radiusKm}km
                    </span>
                    以内
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="現在地での検索を解除"
                    onClick={() => onChange("currentLocation", null)}
                  >
                    <X />
                  </Button>
                </div>
                <Slider
                  min={RADIUS_MIN_KM}
                  max={RADIUS_MAX_KM}
                  step={1}
                  value={[filters.radiusKm]}
                  thumbLabels={["現在地からの距離（km）"]}
                  onValueChange={(v) => onChange("radiusKm", v[0])}
                />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{RADIUS_MIN_KM}km</span>
                  <span>{RADIUS_MAX_KM}km</span>
                </div>
              </div>
            ) : (
              <>
                <Select value={filters.prefecture} onValueChange={changePrefecture}>
                  <SelectTrigger id="prefecture" className="bg-background">
                    <MapPin className="text-muted-foreground" />
                    <SelectValue placeholder="都道府県を選択" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {REGIONS.map((region) => (
                      <SelectGroup key={region.name}>
                        <SelectLabel>{region.name}</SelectLabel>
                        {region.prefectures.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filters.area} onValueChange={(v) => onChange("area", v)}>
                  <SelectTrigger aria-label="市区町村" className="bg-background">
                    <SelectValue placeholder="市区町村を選択" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value={ALL_AREAS}>{filters.prefecture}全域</SelectItem>
                    {citiesOf(filters.prefecture).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {!filters.currentLocation && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => geo.locate((p) => onChange("currentLocation", p))}
                disabled={geo.locating}
              >
                {geo.locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                {geo.locating ? "現在地を取得中…" : "現在地から探す"}
              </Button>
            )}
            {geo.error && (
              <p className="text-xs text-destructive" role="alert">
                {geo.error}
              </p>
            )}
          </div>
        )}

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
          {genreOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">このエリアのジャンルはまだありません</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {visibleGenres.map((g) => (
                <div key={g.alias} className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    id={`genre-${g.alias}`}
                    checked={filters.genres.includes(g.alias)}
                    onCheckedChange={(c) => toggleGenre(g.alias, c === true)}
                  />
                  <Label
                    htmlFor={`genre-${g.alias}`}
                    className="min-w-0 cursor-pointer font-normal"
                    title={g.title}
                  >
                    <span className="truncate">{g.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {g.count}
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          )}
          {genreOptions.length > GENRE_PREVIEW_COUNT && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowAllGenres((v) => !v)}
            >
              {showAllGenres
                ? "閉じる"
                : `もっと見る（残り${genreOptions.length - GENRE_PREVIEW_COUNT}件）`}
            </Button>
          )}
        </fieldset>

        {/* 評価 */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label>評価</Label>
            <span className="flex items-center gap-1 text-sm font-medium tabular-nums text-primary">
              {minR === RATING_MIN && maxR === RATING_MAX ? (
                "指定なし"
              ) : (
                <>
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  {minR.toFixed(1)} 〜 {maxR.toFixed(1)}
                </>
              )}
            </span>
          </div>
          <Slider
            min={RATING_MIN}
            max={RATING_MAX}
            step={0.5}
            value={filters.rating}
            thumbLabels={["評価の下限", "評価の上限"]}
            onValueChange={(v) => onChange("rating", [v[0], v[1]])}
          />
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 店舗カード                                                           */
/* ------------------------------------------------------------------ */

function RestaurantCard({
  restaurant: r,
  distancePrefix = "",
}: {
  restaurant: Restaurant
  /** 距離の前に付ける説明（ルート検索なら「ルートから」） */
  distancePrefix?: string
}) {
  const [imageFailed, setImageFailed] = useState(!r.image)

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
        <h3 className="leading-snug font-semibold">{r.name}</h3>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          {[r.prefecture, r.area].filter(Boolean).join(" ") || "—"}
          {r.distance != null && `（${distancePrefix}${formatDistance(r.distance)}）`}
          ｜平均 {formatYen(r.budget)}
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
          {r.url ? (
            <Button variant="outline" size="sm" asChild>
              <a href={r.url} target="_blank" rel="noreferrer">
                Yelpで見る
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              詳しく
            </Button>
          )}
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
/* ルート検索：出発地・目的地の入力待ち                                    */
/* ------------------------------------------------------------------ */

function RoutePendingState() {
  return (
    <Card className="items-center gap-3 border-dashed py-16 text-center">
      <Route className="size-10 text-muted-foreground" />
      <p className="font-semibold">出発地と目的地を指定してください</p>
      <p className="px-4 text-sm text-muted-foreground">
        左の検索条件で駅名・住所などを検索して選ぶと、ルート沿いのお店を探します。
        出発地には現在地も使えます。
      </p>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* API エラー                                                           */
/* ------------------------------------------------------------------ */

function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <Card className="items-center gap-3 border-dashed py-16 text-center" role="alert">
      <SearchX className="size-10 text-muted-foreground" />
      <p className="font-semibold">店舗データを取得できませんでした</p>
      <p className="px-4 text-sm text-muted-foreground">
        {/* バックエンドが理由を返したとき（ルートが見つからない等）はそれを表示する */}
        {message ??
          "バックエンド（http://localhost:8000）が起動しているか、YELP_API_KEY が正しいか確認してください。"}
      </p>
      <Button variant="outline" onClick={onRetry}>
        <RotateCcw /> 再読み込み
      </Button>
    </Card>
  )
}
