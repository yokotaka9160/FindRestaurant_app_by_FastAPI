import { useState } from "react"

import type { GeoPoint } from "@/data/restaurants"

/** ブラウザの位置情報で現在地を 1 回取得する */
export function useGeolocation() {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locate = (onSuccess: (point: GeoPoint) => void) => {
    if (!("geolocation" in navigator)) {
      setError("このブラウザは位置情報に対応していません")
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onSuccess({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      (err) => {
        setLocating(false)
        setError(
          err.code === err.PERMISSION_DENIED
            ? "位置情報の利用が許可されていません"
            : "現在地を取得できませんでした",
        )
      },
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  return { locating, error, locate }
}
