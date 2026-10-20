import { useEffect, useState } from "react"

import RestaurantSearch from "@/components/ShopSearch"

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "brand-mark brand-mark--compact" : "brand-mark"}
      aria-hidden="true"
    >
      <div className="brand-pin">
        <span />
      </div>
      <div className="brand-route" />
      <div className="brand-device brand-device--one" />
      <div className="brand-device brand-device--two" />
    </div>
  )
}

function HeroIllustration() {
  return (
    <svg className="hero-illustration" viewBox="0 0 580 500" aria-hidden="true">
      <defs>
        <linearGradient id="heroGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#15d6d2" />
          <stop offset=".58" stopColor="#2947e8" />
          <stop offset="1" stopColor="#c636f0" />
        </linearGradient>
        <linearGradient id="warmGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffca6a" />
          <stop offset="1" stopColor="#ff7f87" />
        </linearGradient>
      </defs>
      <path
        d="M74 80v93M64 80v56M84 80v56M54 80v56M54 136c0 18 30 18 30 0M69 173v165"
        className="hero-stroke"
      />
      <path d="M366 330V72c66 64 74 157 3 206" className="hero-knife" />
      <path
        d="M251 123c-23 23-40 64-39 118 2 59-28 105-61 156"
        className="hero-flame"
      />
      <path
        d="M237 142c25 41 13 73-6 103M255 144c14 27 14 56-1 83"
        className="hero-flame thin"
      />
      <path
        d="m222 315 97-211M243 338l94-204M222 315l29 14M234 290l30 15M246 264l29 15"
        className="hero-stroke hero-fork"
      />
      <path d="m166 57 60 62-62 64-63-62z" fill="url(#heroGradient)" />
      <circle
        cx="164"
        cy="120"
        r="44"
        fill="none"
        stroke="#fff"
        strokeOpacity=".75"
        strokeWidth="2"
      />
      <path
        d="M183 118c0-22-36-25-39 2-3 28 36 27 39 3"
        fill="none"
        stroke="#fff"
        strokeOpacity=".38"
        strokeWidth="2"
      />
      <path d="M355 332h86V212c-14 43-42 77-86 91z" fill="url(#heroGradient)" />
    </svg>
  )
}

function Home({ onStart }: { onStart: () => void }) {
  return (
    <main className="home-screen">
      <section className="home-art" aria-label="FindRestr food illustration">
        <HeroIllustration />
      </section>
      <section className="home-content">
        <div className="home-brand">
          <BrandMark />
          <h1>FindRestr</h1>
          <p>Find and Book Restaurants</p>
          <button className="primary-button start-button" onClick={onStart}>
            Start
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState<"home" | "menu">(() =>
    window.location.hash === "#main-menu" ? "menu" : "home",
  )

  useEffect(() => {
    const onHashChange = () =>
      setScreen(window.location.hash === "#main-menu" ? "menu" : "home")
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const navigate = (next: "home" | "menu") => {
    window.location.hash = next === "menu" ? "main-menu" : ""
    setScreen(next)
  }

  return screen === "home" ? (
    <Home onStart={() => navigate("menu")} />
  ) : (
    <RestaurantSearch onHome={() => navigate("home")} />
  )
}
