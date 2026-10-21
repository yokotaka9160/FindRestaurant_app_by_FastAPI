import { useState, type FormEvent, type ReactNode } from "react"
import { ArrowDownUp, Flag, Loader2, LocateFixed, MapPin, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ApiError,
  ROUTE_BUFFER_OPTIONS,
  formatDistance,
  geocode,
  type GeocodeResult,
  type RoutePoint,
} from "@/data/restaurants"
import { useGeolocation } from "@/hooks/useGeolocation"

/* ------------------------------------------------------------------ */
/* ルート検索の条件：出発地・目的地・ルートからの距離                       */
/* ------------------------------------------------------------------ */

interface RouteSearchFieldsProps {
  origin: RoutePoint | null
  destination: RoutePoint | null
  bufferM: number
  onOriginChange: (p: RoutePoint | null) => void
  onDestinationChange: (p: RoutePoint | null) => void
  onBufferChange: (m: number) => void
}

export default function RouteSearchFields({
  origin,
  destination,
  bufferM,
  onOriginChange,
  onDestinationChange,
  onBufferChange,
}: RouteSearchFieldsProps) {
  const swap = () => {
    onOriginChange(destination)
    onDestinationChange(origin)
  }

  return (
    <div className="space-y-3">
      <RoutePointField
        id="route-origin"
        label="出発地"
        icon={<MapPin className="size-4 text-emerald-600" />}
        value={origin}
        onChange={onOriginChange}
        allowCurrentLocation
      />
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={swap}
          disabled={!origin && !destination}
        >
          <ArrowDownUp /> 入れ替え
        </Button>
      </div>
      <RoutePointField
        id="route-destination"
        label="目的地"
        icon={<Flag className="size-4 text-rose-600" />}
        value={destination}
        onChange={onDestinationChange}
      />
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="route-buffer" className="font-normal text-muted-foreground">
          ルートからの距離
        </Label>
        <Select value={String(bufferM)} onValueChange={(v) => onBufferChange(Number(v))}>
          <SelectTrigger id="route-buffer" className="w-28 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROUTE_BUFFER_OPTIONS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {formatDistance(m)} 以内
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 地点の入力：地名検索（Nominatim）→ 候補から選ぶ／現在地                  */
/* ------------------------------------------------------------------ */

interface RoutePointFieldProps {
  id: string
  label: string
  icon: ReactNode
  value: RoutePoint | null
  onChange: (p: RoutePoint | null) => void
  allowCurrentLocation?: boolean
}

function RoutePointField({
  id,
  label,
  icon,
  value,
  onChange,
  allowCurrentLocation = false,
}: RoutePointFieldProps) {
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<GeocodeResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const geo = useGeolocation()

  // Nominatim の利用規約に従い、入力中の自動補完はせず検索ボタン（Enter）で 1 回だけ呼ぶ
  const search = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      const results = await geocode(q)
      setCandidates(results)
      if (results.length === 0) setError("見つかりませんでした。別の地名で試してください")
    } catch (err) {
      setCandidates(null)
      setError(err instanceof ApiError ? err.message : "地名を検索できませんでした")
    } finally {
      setSearching(false)
    }
  }

  const select = (r: GeocodeResult) => {
    const [name] = r.name.split(",")
    onChange({ label: name.trim(), lat: r.lat, lng: r.lng })
    setCandidates(null)
    setQuery("")
  }

  if (value) {
    return (
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          {icon}
          <span className="min-w-0 flex-1 truncate" title={value.label}>
            {value.label}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`${label}を解除`}
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <form onSubmit={search} className="flex gap-1.5">
        <input
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="駅名・住所・施設名"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label={`${label}を検索`}
          disabled={searching || !query.trim()}
        >
          {searching ? <Loader2 className="animate-spin" /> : <Search />}
        </Button>
      </form>

      {candidates && candidates.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border bg-background text-sm">
          {candidates.map((c) => {
            const [name, ...rest] = c.name.split(",")
            return (
              <li key={`${c.lat},${c.lng}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => select(c)}
                >
                  <span className="block font-medium">{name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {rest.join(",").trim()}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {allowCurrentLocation && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={geo.locating}
          onClick={() => geo.locate((p) => onChange({ ...p, label: "現在地" }))}
        >
          {geo.locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          {geo.locating ? "現在地を取得中…" : "現在地を出発地にする"}
        </Button>
      )}

      {(error || geo.error) && (
        <p className="text-xs text-destructive" role="alert">
          {error || geo.error}
        </p>
      )}
    </div>
  )
}
