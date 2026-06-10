'use client'

import { useEffect, useRef } from 'react'

export default function TravelBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let mouseX = 0, mouseY = 0
    let compassRotation = -0.15 // Initial slight rotation for animation

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Riyadh-inspired road network - denser, more structured
    const roads: { x1: number; y1: number; x2: number; y2: number; main: boolean; highlight?: boolean }[] = []
    const vehicles: { progress: number; roadIdx: number; speed: number; trail: {x: number, y: number}[] }[] = []

    const buildRoads = () => {
      roads.length = 0
      const w = canvas.width, h = canvas.height
      const cx = w * 0.25, cy = h * 0.5
      const mapScale = Math.min(w, h)

      // Main highway - King Fahd Road (highlighted route)
      roads.push({ x1: cx - mapScale * 0.35, y1: cy, x2: cx + mapScale * 0.35, y2: cy, main: true, highlight: true })
      
      // Northern/Southern ring roads
      roads.push({ x1: w * 0.02, y1: h * 0.25, x2: w * 0.5, y2: h * 0.25, main: true })
      roads.push({ x1: w * 0.02, y1: h * 0.75, x2: w * 0.5, y2: h * 0.75, main: true })

      // Radial roads from center (12 directions)
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI * 2) / 12
        const len = mapScale * 0.45
        roads.push({ x1: cx, y1: cy, x2: cx + Math.cos(angle) * len, y2: cy + Math.sin(angle) * len, main: i % 3 === 0 })
      }

      // Ring roads (4 rings)
      ;[0.1, 0.2, 0.32, 0.44].forEach((r, ri) => {
        const radius = mapScale * r
        for (let i = 0; i < 24; i++) {
          const a1 = (i * Math.PI * 2) / 24
          const a2 = ((i + 1) * Math.PI * 2) / 24
          roads.push({
            x1: cx + Math.cos(a1) * radius, y1: cy + Math.sin(a1) * radius,
            x2: cx + Math.cos(a2) * radius, y2: cy + Math.sin(a2) * radius,
            main: ri === 2
          })
        }
      })

      // Dense grid streets
      for (let i = -5; i <= 5; i++) {
        const off = i * mapScale * 0.07
        // Vertical
        if (cx + off > 0 && cx + off < w * 0.5) {
          roads.push({ x1: cx + off, y1: h * 0.08, x2: cx + off, y2: h * 0.92, main: false })
        }
        // Horizontal
        const yOff = cy + off * 0.7
        if (yOff > h * 0.1 && yOff < h * 0.9) {
          roads.push({ x1: w * 0.02, y1: yOff, x2: w * 0.5, y2: yOff, main: false })
        }
      }

      // Curved highway (Eastern Ring)
      for (let i = 0; i < 20; i++) {
        const t1 = i / 20, t2 = (i + 1) / 20
        const curve = (t: number) => ({
          x: w * 0.45 + Math.sin(t * Math.PI) * w * 0.06,
          y: h * 0.1 + t * h * 0.8
        })
        const p1 = curve(t1), p2 = curve(t2)
        roads.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, main: true })
      }

      // Airport road (diagonal)
      roads.push({ x1: cx, y1: cy, x2: w * 0.45, y2: h * 0.15, main: true, highlight: true })
    }

    const initVehicles = () => {
      vehicles.length = 0
      for (let i = 0; i < 45; i++) {
        vehicles.push({
          progress: Math.random(),
          roadIdx: Math.floor(Math.random() * roads.length),
          speed: 0.002 + Math.random() * 0.004,
          trail: []
        })
      }
    }

    // Location pins: Airport, Downtown, Hotels, Mall (shifted left)
    const pins = [
      { rx: 0.45, ry: 0.15, label: 'Airport', size: 12 },
      { rx: 0.25, ry: 0.5, label: 'Downtown', size: 14 },
      { rx: 0.12, ry: 0.35, label: 'Hotels', size: 10 },
      { rx: 0.38, ry: 0.65, label: 'Business District', size: 10 },
    ]

    buildRoads()
    initVehicles()

    let t = 0
    const draw = () => {
      t += 0.016
      compassRotation += (0 - compassRotation) * 0.02 // Animate to 0
      const w = canvas.width, h = canvas.height

      // Background with subtle gradient
      const bgGrad = ctx.createRadialGradient(w * 0.25, h * 0.5, 0, w * 0.25, h * 0.5, w * 0.5)
      bgGrad.addColorStop(0, '#0c0c0c')
      bgGrad.addColorStop(0.6, '#0a0a0a')
      bgGrad.addColorStop(1, '#080808')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // Atmospheric glow
      const atmos = ctx.createRadialGradient(w * 0.25, h * 0.5, 0, w * 0.25, h * 0.5, w * 0.45)
      atmos.addColorStop(0, 'rgba(201,169,97,0.15)')
      atmos.addColorStop(0.4, 'rgba(201,169,97,0.06)')
      atmos.addColorStop(1, 'transparent')
      ctx.fillStyle = atmos
      ctx.fillRect(0, 0, w, h)

      // Faint grid coordinates
      ctx.fillStyle = 'rgba(201,169,97,0.06)'
      ctx.font = '10px monospace'
      for (let x = 0; x < w * 0.5; x += 100) {
        for (let y = 0; y < h; y += 100) {
          ctx.fillText(`${Math.floor(x/100)}.${Math.floor(y/100)}`, x + 5, y + 12)
        }
      }

      // Draw roads
      roads.forEach((r, i) => {
        const pulse = 0.8 + Math.sin(t * 2 + i * 0.2) * 0.2
        let alpha = (r.main ? 0.65 : 0.25) * pulse
        let lineWidth = r.main ? 2.5 : 0.8
        let glowWidth = r.main ? 12 : 4
        let color = 'rgba(201,169,97,'

        if (r.highlight) {
          alpha = 0.95
          lineWidth = 3.5
          glowWidth = 18
          color = 'rgba(255,219,88,'
        }

        // Glow layer
        ctx.beginPath()
        ctx.moveTo(r.x1, r.y1)
        ctx.lineTo(r.x2, r.y2)
        ctx.strokeStyle = color + (alpha * 0.3) + ')'
        ctx.lineWidth = glowWidth
        ctx.lineCap = 'round'
        ctx.stroke()

        // Main line
        ctx.beginPath()
        ctx.moveTo(r.x1, r.y1)
        ctx.lineTo(r.x2, r.y2)
        ctx.strokeStyle = color + alpha + ')'
        ctx.lineWidth = lineWidth
        ctx.stroke()
      })

      // Vehicles with motion blur trails
      vehicles.forEach(v => {
        v.progress += v.speed
        if (v.progress > 1) {
          v.progress = 0
          v.roadIdx = Math.floor(Math.random() * roads.length)
          v.speed = 0.002 + Math.random() * 0.004
          v.trail = []
        }

        const r = roads[v.roadIdx]
        if (!r) return
        const x = r.x1 + (r.x2 - r.x1) * v.progress
        const y = r.y1 + (r.y2 - r.y1) * v.progress

        // Add to trail
        v.trail.push({ x, y })
        if (v.trail.length > 8) v.trail.shift()

        // Draw trail (motion blur)
        v.trail.forEach((pt, idx) => {
          const trailAlpha = (idx / v.trail.length) * 0.4
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 3 - idx * 0.3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${trailAlpha})`
          ctx.fill()
        })

        // Glow
        const vg = ctx.createRadialGradient(x, y, 0, x, y, 20)
        vg.addColorStop(0, 'rgba(255,255,255,0.6)')
        vg.addColorStop(0.3, 'rgba(255,219,88,0.3)')
        vg.addColorStop(1, 'transparent')
        ctx.fillStyle = vg
        ctx.beginPath()
        ctx.arc(x, y, 20, 0, Math.PI * 2)
        ctx.fill()

        // Core dot
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = '#FFDB58'
        ctx.fill()
      })

      // Location pins
      pins.forEach((pin, i) => {
        const x = w * pin.rx, y = h * pin.ry
        const pulse = 1 + Math.sin(t * 2.5 + i * 1.5) * 0.3

        // Outer pulse ring
        ctx.beginPath()
        ctx.arc(x, y, pin.size * pulse * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201,169,97,${0.1 / pulse})`
        ctx.fill()

        // Pin glow
        const pg = ctx.createRadialGradient(x, y, 0, x, y, pin.size * 2)
        pg.addColorStop(0, 'rgba(255,219,88,0.9)')
        pg.addColorStop(0.5, 'rgba(201,169,97,0.4)')
        pg.addColorStop(1, 'transparent')
        ctx.fillStyle = pg
        ctx.beginPath()
        ctx.arc(x, y, pin.size * 2, 0, Math.PI * 2)
        ctx.fill()

        // Pin marker (teardrop shape)
        ctx.beginPath()
        ctx.moveTo(x, y - pin.size * 1.2)
        ctx.bezierCurveTo(x + pin.size * 0.8, y - pin.size * 0.8, x + pin.size * 0.8, y + pin.size * 0.3, x, y + pin.size * 0.6)
        ctx.bezierCurveTo(x - pin.size * 0.8, y + pin.size * 0.3, x - pin.size * 0.8, y - pin.size * 0.8, x, y - pin.size * 1.2)
        ctx.fillStyle = '#C9A961'
        ctx.fill()
        ctx.strokeStyle = '#FFDB58'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Inner dot
        ctx.beginPath()
        ctx.arc(x, y - pin.size * 0.3, pin.size * 0.25, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(pin.label, x, y + pin.size * 1.8)
      })

      // COMPASS ROSE (higher position, fully visible)
      const compassX = 90, compassY = h - 180, compassR = 55
      ctx.save()
      ctx.translate(compassX, compassY)
      
      // Compass glow background
      const compassGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, compassR * 1.8)
      compassGlow.addColorStop(0, 'rgba(201,169,97,0.25)')
      compassGlow.addColorStop(0.5, 'rgba(201,169,97,0.08)')
      compassGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = compassGlow
      ctx.beginPath()
      ctx.arc(0, 0, compassR * 1.8, 0, Math.PI * 2)
      ctx.fill()

      // Outer decorative ring
      ctx.beginPath()
      ctx.arc(0, 0, compassR + 8, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(201,169,97,0.4)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Main outer ring
      ctx.beginPath()
      ctx.arc(0, 0, compassR, 0, Math.PI * 2)
      ctx.strokeStyle = '#C9A961'
      ctx.lineWidth = 3
      ctx.stroke()

      // Degree ticks around the edge
      for (let i = 0; i < 36; i++) {
        const angle = (i * Math.PI * 2) / 36
        const inner = i % 9 === 0 ? compassR - 12 : compassR - 6
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
        ctx.lineTo(Math.cos(angle) * compassR, Math.sin(angle) * compassR)
        ctx.strokeStyle = i % 9 === 0 ? '#FFDB58' : 'rgba(201,169,97,0.5)'
        ctx.lineWidth = i % 9 === 0 ? 2 : 1
        ctx.stroke()
      }

      // Inner ring
      ctx.beginPath()
      ctx.arc(0, 0, compassR * 0.55, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(201,169,97,0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Center circle
      ctx.beginPath()
      ctx.arc(0, 0, 8, 0, Math.PI * 2)
      ctx.fillStyle = '#C9A961'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#FFDB58'
      ctx.fill()

      ctx.rotate(compassRotation)

      // North pointer (large golden triangle)
      ctx.beginPath()
      ctx.moveTo(0, -compassR * 0.85)
      ctx.lineTo(-10, 0)
      ctx.lineTo(0, -8)
      ctx.lineTo(10, 0)
      ctx.closePath()
      ctx.fillStyle = '#FFDB58'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()

      // South pointer (darker)
      ctx.beginPath()
      ctx.moveTo(0, compassR * 0.85)
      ctx.lineTo(-8, 0)
      ctx.lineTo(0, 8)
      ctx.lineTo(8, 0)
      ctx.closePath()
      ctx.fillStyle = 'rgba(201,169,97,0.4)'
      ctx.fill()

      // East/West pointers
      ctx.beginPath()
      ctx.moveTo(compassR * 0.7, 0)
      ctx.lineTo(0, -6)
      ctx.lineTo(0, 6)
      ctx.closePath()
      ctx.fillStyle = 'rgba(201,169,97,0.5)'
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(-compassR * 0.7, 0)
      ctx.lineTo(0, -6)
      ctx.lineTo(0, 6)
      ctx.closePath()
      ctx.fill()

      ctx.rotate(-compassRotation) // Reset for labels

      // Cardinal labels with glow
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // N - bright and glowing
      ctx.shadowColor = '#FFDB58'
      ctx.shadowBlur = 15
      ctx.fillStyle = '#FFDB58'
      ctx.font = 'bold 18px serif'
      ctx.fillText('N', 0, -compassR - 18)
      ctx.shadowBlur = 0

      // S, E, W
      ctx.fillStyle = 'rgba(201,169,97,0.8)'
      ctx.font = 'bold 14px serif'
      ctx.fillText('S', 0, compassR + 18)
      ctx.fillText('E', compassR + 18, 0)
      ctx.fillText('W', -compassR - 18, 0)

      ctx.restore()

      // Scale bar (higher, near compass)
      const scaleX = 200, scaleY = h - 110
      ctx.fillStyle = 'rgba(201,169,97,0.6)'
      ctx.fillRect(scaleX, scaleY, 100, 2)
      ctx.fillRect(scaleX, scaleY - 5, 2, 10)
      ctx.fillRect(scaleX + 100, scaleY - 5, 2, 10)
      ctx.fillRect(scaleX + 50, scaleY - 3, 1, 6)
      ctx.font = '10px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.textAlign = 'center'
      ctx.fillText('10 km', scaleX + 50, scaleY + 14)

      // Map legend (top-left)
      ctx.fillStyle = 'rgba(20,20,20,0.7)'
      ctx.fillRect(15, 80, 120, 90)
      ctx.strokeStyle = 'rgba(201,169,97,0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(15, 80, 120, 90)

      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#C9A961'
      ctx.textAlign = 'left'
      ctx.fillText('LEGEND', 25, 97)

      // Legend items
      ctx.lineWidth = 3
      ctx.strokeStyle = '#FFDB58'
      ctx.beginPath(); ctx.moveTo(25, 115); ctx.lineTo(50, 115); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '10px sans-serif'
      ctx.fillText('Main Route', 55, 118)

      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(201,169,97,0.7)'
      ctx.beginPath(); ctx.moveTo(25, 133); ctx.lineTo(50, 133); ctx.stroke()
      ctx.fillText('Highway', 55, 136)

      ctx.beginPath()
      ctx.arc(37, 152, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#FFDB58'
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText('Location', 55, 155)

      // Mouse follow glow
      if (mouseX > 0 && mouseX < w * 0.55) {
        const mg = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 150)
        mg.addColorStop(0, 'rgba(201,169,97,0.2)')
        mg.addColorStop(1, 'transparent')
        ctx.fillStyle = mg
        ctx.fillRect(0, 0, w, h)
      }

      animationId = requestAnimationFrame(draw)
    }

    const onMouse = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY }
    window.addEventListener('mousemove', onMouse)

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouse)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}
