import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  title: "Mode tournée — BreakingBad33",
  robots: { index: false, follow: false },
  manifest: "/run/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BB33 Tournée",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/images/logoapp.png", type: "image/png" }],
    apple: "/images/logoapp.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  viewportFit: "cover",
}

export default function RunLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      {children}
    </div>
  )
}
