import { NextResponse } from "next/server"

/**
 * Manifest dédié au raccourci « Tournée » (écran d'accueil).
 * ?start=/run/RUN_… pour épingler une commande précise.
 */
export function GET(req: Request) {
  const url = new URL(req.url)
  const raw = url.searchParams.get("start") || "/run"
  const start = raw.startsWith("/run") ? raw : "/run"

  const manifest = {
    id: start === "/run" ? "bb33-tournee" : `bb33-tournee-${start.slice(5, 24)}`,
    name: "BB33 Tournée",
    short_name: "Tournée",
    description: "Arrivé / Livré sans ouvrir le panel.",
    start_url: start,
    scope: "/run",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/images/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
