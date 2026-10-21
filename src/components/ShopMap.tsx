import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import {
  formatYen,
  type GeoPoint,
  type Restaurant,
  type RouteInfo,
  type RoutePoint,
} from "@/data/restaurants"

/* ------------------------------------------------------------------ */
/* 店舗の位置を地図（Leaflet + OpenStreetMap）に表示する                  */
/* ------------------------------------------------------------------ */

/** 検索結果がまだないときの初期表示位置 */
const TOKYO_STATION: L.LatLngTuple = [35.6812, 139.7671]

interface ShopMapProps {
  restaurants: Restaurant[]
  /** 現在地検索中なら、現在地と検索範囲の円を表示する */
  currentLocation: GeoPoint | null
  radiusKm: number
  /** ルート検索中なら、ルートと出発地・目的地を表示する */
  route?: RouteInfo | null
  origin?: RoutePoint | null
  destination?: RoutePoint | null
}

export default function ShopMap({
  restaurants,
  currentLocation,
  radiusKm,
  route = null,
  origin = null,
  destination = null,
}: ShopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  // 地図本体はマウント時に 1 回だけ作る
  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current).setView(TOKYO_STATION, 12)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // 検索結果が変わるたびにマーカーを描き直し、全体が見えるように表示範囲を合わせる
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    // 表示範囲に含める地点
    const points: L.LatLng[] = []

    if (currentLocation) {
      const center = L.latLng(currentLocation.lat, currentLocation.lng)
      L.circle(center, {
        radius: radiusKm * 1000,
        className: "map-me-range",
        weight: 1,
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(layer)
      L.circleMarker(center, { radius: 8, className: "map-me-marker", weight: 3, fillOpacity: 1 })
        .bindTooltip("現在地")
        .addTo(layer)
      // 検索範囲の円全体が収まるようにする
      const range = center.toBounds(radiusKm * 2000)
      points.push(range.getSouthWest(), range.getNorthEast())
    }

    // ルートは店舗マーカーより下に描く（先に追加したものが下になる）
    if (route) {
      const line = route.coordinates.map(([lat, lng]) => L.latLng(lat, lng))
      L.polyline(line, { className: "map-route-casing", weight: 9, interactive: false }).addTo(layer)
      L.polyline(line, { className: "map-route", weight: 5, interactive: false }).addTo(layer)
      points.push(...line)
    }
    for (const [point, kind] of [
      [origin, "出発地"],
      [destination, "目的地"],
    ] as const) {
      if (!point) continue
      const pos = L.latLng(point.lat, point.lng)
      L.circleMarker(pos, {
        radius: 9,
        className: kind === "出発地" ? "map-origin-marker" : "map-destination-marker",
        weight: 3,
        fillOpacity: 1,
      })
        .bindTooltip(`${kind}：${point.label}`)
        .addTo(layer)
      points.push(pos)
    }

    for (const r of restaurants) {
      if (r.lat == null || r.lng == null) continue
      const pos = L.latLng(r.lat, r.lng)
      const marker = L.circleMarker(pos, {
        radius: 9,
        className: "map-shop-marker",
        weight: 2,
        fillOpacity: 0.9,
      })
        .bindTooltip(r.name, { direction: "top", offset: [0, -8] })
        .bindPopup(() => popupContent(r), { minWidth: 200 })
        .addTo(layer)
      marker.on("popupopen", () => marker.getElement()?.classList.add("map-shop-marker--active"))
      marker.on("popupclose", () => marker.getElement()?.classList.remove("map-shop-marker--active"))
      points.push(pos)
    }

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 })
    }
  }, [restaurants, currentLocation, radiusKm, route, origin, destination])

  const missing = restaurants.filter((r) => r.lat == null || r.lng == null).length

  return (
    <div className="space-y-2">
      {/* isolate：Leaflet の高い z-index が固定ヘッダーに重ならないようにする */}
      <div
        ref={containerRef}
        className="isolate h-[min(70vh,640px)] w-full overflow-hidden rounded-xl border bg-muted"
        role="region"
        aria-label="店舗の地図"
      />
      {missing > 0 && (
        <p className="text-xs text-muted-foreground">
          位置情報のない {missing} 件は地図に表示されていません
        </p>
      )}
    </div>
  )
}

/** ポップアップの中身。店名などは外部（Yelp）由来なので innerHTML ではなく textContent で入れる */
function popupContent(r: Restaurant): HTMLElement {
  const root = document.createElement("div")
  root.className = "space-y-1 text-sm"

  const name = document.createElement("p")
  name.className = "!m-0 font-semibold"
  name.textContent = r.name

  const meta = document.createElement("p")
  meta.className = "!m-0 text-xs text-muted-foreground"
  meta.textContent = `★${r.rating.toFixed(1)}（${r.review_count.toLocaleString("ja-JP")}件）｜${r.genre}｜平均 ${formatYen(r.budget)}`

  root.append(name, meta)

  if (r.url) {
    const link = document.createElement("a")
    link.href = r.url
    link.target = "_blank"
    link.rel = "noreferrer"
    link.className = "inline-block pt-1 text-xs font-medium"
    link.textContent = "Yelpで見る →"
    root.append(link)
  }
  return root
}
