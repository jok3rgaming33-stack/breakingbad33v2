"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"

export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const cv = canvas
    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight }
    resize()
    window.addEventListener("resize", resize)

    const crystalImages: HTMLImageElement[] = []
    for (let i = 1; i <= 8; i++) {
      const img = new window.Image()
      img.src = `/images/${i}.png`
      crystalImages.push(img)
    }

    const particles: any[] = []
    class Particle {
      x: number; y: number; size: number; speedX: number; speedY: number; rotation: number; rotationSpeed: number; image: HTMLImageElement
      constructor() {
        this.x = Math.random() * cv.width
        this.y = Math.random() * cv.height * 0.9
        this.size = Math.random() * 55 + 28
        this.speedX = (Math.random() - 1.5) * 0.3
        this.speedY = (Math.random() - 1.5) * 0.3
        this.rotation = Math.random() * Math.PI * 2
        this.rotationSpeed = (Math.random() - 0.5) * 0.012
        this.image = crystalImages[Math.floor(Math.random() * crystalImages.length)]
      }
      update() { this.x += this.speedX; this.y += this.speedY; this.rotation += this.rotationSpeed; if (this.x < 0 || this.x > cv.width) this.speedX *= -1; if (this.y < 0 || this.y > cv.height * 0.95) this.speedY *= -1 }
      draw() { ctx!.save(); ctx!.translate(this.x, this.y); ctx!.rotate(this.rotation); ctx!.globalAlpha = 0.8; ctx!.drawImage(this.image, -this.size / 2, -this.size / 2, this.size, this.size); ctx!.restore() }
    }

    for (let i = 0; i < 35; i++) particles.push(new Particle())

    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, cv.width, cv.height)
      particles.forEach(p => { p.update(); p.draw() })
      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(animationId) }
  }, [])

  return (
    <section className="relative flex min-h-[32vh] items-center justify-center overflow-hidden py-10 sm:min-h-[34vh] sm:py-12 md:min-h-[36vh] md:py-14">
      <Image src="/images/hero-rv.png" alt="RV" fill className="object-cover object-[center_35%]" priority />
      <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />
      <div className="absolute inset-0 z-20 bg-black/45" />
      <div className="absolute inset-0 z-20 bg-gradient-to-b from-black/10 via-black/35 to-[#050505]" />

      {/* === LOGO BR 35 + TEXTE === */}
      <div className="relative z-40 mx-auto flex max-w-5xl flex-col items-center px-4 text-center sm:px-6">
        <div className="flex items-center justify-center gap-2.5 sm:gap-3">
          {/* Carré Br 35 style tableau périodique */}
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#3e6757] text-white shadow-[0_0_40px_rgba(62,103,87,0.5)] sm:h-16 sm:w-16 md:h-20 md:w-20">
            <span className="text-[40px] font-black tracking-tighter sm:text-[46px] md:text-[56px]">Br</span>
            <span className="absolute right-1.5 top-0.5 text-[10px] font-bold sm:right-2 sm:top-1 sm:text-xs">35</span>
          </div>

          <div className="flex items-baseline font-bold tracking-[-2.5px] text-white sm:tracking-[-3.5px]">
            <span className="text-[34px] sm:text-[44px] md:text-[56px]">eakingBad</span>
            <span className="ml-0.5 text-[34px] text-[#3e6757] sm:ml-1 sm:text-[44px] md:text-[56px]">33</span>
          </div>
        </div>
      </div>
    </section>
  )
}
