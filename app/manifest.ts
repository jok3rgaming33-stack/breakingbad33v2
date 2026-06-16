import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BreakingBad 33 — Premium Fan Store',
    short_name: 'BB33',
    description:
      'Authentic. Premium. Iconic. Official Breaking Bad merchandise and collectibles.',
    start_url: '/',
    display: 'standalone',
    background_color: '#3a5a47',
    theme_color: '#3a5a47',
    icons: [
      {
        src: '/images/logoapp.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/images/logoapp.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/images/logoapp.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
