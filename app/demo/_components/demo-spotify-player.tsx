/**
 * Lecteur Spotify officiel, tel que Spotify le livre.
 * Le nom de la playlist et le créateur sont dans l'iframe : on ne peut pas
 * les retirer sans masquer aussi les boutons, et Spotify l'interdit.
 */
const PLAYLIST_EMBED =
  "https://open.spotify.com/embed/playlist/3sDxSkNG2xITKv68hucgBg?utm_source=generator"

export function DemoSpotifyPlayer() {
  return (
    <section className="border-b border-white/5 bg-background" aria-label="Ambiance musicale">
      <div className="mx-auto w-full max-w-[720px] px-4 py-5 sm:py-6">
        <p className="mb-3 text-center text-[10px] uppercase tracking-[0.3em] text-[#3e6757] sm:text-xs">
          Ambiance
        </p>
        <iframe
          title="Lecteur Spotify"
          src={PLAYLIST_EMBED}
          width="100%"
          height={152}
          style={{ borderRadius: 12 }}
          frameBorder={0}
          allowFullScreen
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      </div>
    </section>
  )
}
