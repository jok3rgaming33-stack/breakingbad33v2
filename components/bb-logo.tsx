import { cn } from "@/lib/utils"

export function BbLogo({
  className,
  size = "md",
}: {
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const tile =
    size === "lg"
      ? "w-24 h-24 text-6xl"
      : size === "sm"
      ? "w-8 h-8 text-lg"
      : "w-12 h-12 text-2xl"

  const word =
    size === "lg"
      ? "text-[88px] md:text-[100px]"
      : size === "sm"
      ? "text-xl"
      : "text-4xl"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-sm border border-[#2f5246] bg-[#3e6757] text-white shadow-[0_0_35px_rgba(62,103,87,0.4)]",
          tile,
        )}
      >
        <span className="font-bold" style={{ fontFamily: "Georgia, serif" }}>
          Br
        </span>
        <span className="absolute right-2 top-1 text-xs font-semibold">
          35
        </span>
      </div>

      <div
        className={cn(
          "font-bold tracking-tight text-white leading-none",
          word,
        )}
        style={{ fontFamily: "Georgia, serif" }}
      >
        eakingBad
        <span className="text-[#3e6757]">33</span>
      </div>
    </div>
  )
}