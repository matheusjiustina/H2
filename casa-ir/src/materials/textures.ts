/**
 * Procedural texture generator (canvas based).
 *
 * All textures are generated at runtime so the application has no binary
 * asset dependencies. Most maps are *neutral detail maps* (light, low
 * saturation) that are multiplied by the material colour, which allows the
 * client configurator to recolour any finish while keeping its texture.
 * A few maps (terrazzo, cowhide, pebbles…) are full colour by nature.
 */
import * as THREE from 'three'

export type TextureKey =
  | 'wood'
  | 'wood_b'
  | 'foliage'
  | 'wood_fine'
  | 'wood_slats'
  | 'deck'
  | 'terrazzo'
  | 'travertine'
  | 'travertine_pitted'
  | 'marble'
  | 'marble_soft'
  | 'pebble'
  | 'stone_rough'
  | 'linen'
  | 'boucle'
  | 'rope'
  | 'rug_knit'
  | 'rug_stripes'
  | 'cowhide'
  | 'plaster'
  | 'concrete'
  | 'porcelain_grid'
  | 'wallpaper_geo'
  | 'granite'
  | 'grass'
  | 'sand'
  | 'gravel'
  | 'pavers'
  | 'asphalt'
  | 'pool_tile'
  | 'capsule_tile'
  | 'fluted'
  | 'louver'
  | 'water_normal'
  | 'leaf'

const cache = new Map<string, THREE.Texture>()

// Deterministic PRNG so that textures are identical on every load.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Small value-noise helper (tileable on a grid of `cells`).
function makeNoise(cells: number, seed: number) {
  const r = rng(seed)
  const g: number[] = []
  for (let i = 0; i < cells * cells; i++) g.push(r())
  const at = (x: number, y: number) => g[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)]
  return (u: number, v: number) => {
    const x = u * cells
    const y = v * cells
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = at(x0, y0)
    const b = at(x0 + 1, y0)
    const c = at(x0, y0 + 1)
    const d = at(x0 + 1, y0 + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}

function fbm(noises: ((u: number, v: number) => number)[], u: number, v: number) {
  let s = 0
  let a = 0.5
  let n = 0
  for (const f of noises) {
    s += f(u, v) * a
    n += a
    a *= 0.5
  }
  return s / n
}

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  return { c, ctx }
}

function pixelFill(
  size: number,
  fn: (u: number, v: number, x: number, y: number) => [number, number, number],
) {
  const { c, ctx } = canvas(size)
  const img = ctx.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size, x, y)
      const i = (y * size + x) * 4
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

const clamp = (v: number) => Math.max(0, Math.min(255, v))
const grey = (v: number): [number, number, number] => [clamp(v), clamp(v), clamp(v)]

type Gen = (size: number) => HTMLCanvasElement

const generators: Record<TextureKey, Gen> = {
  wood: (S) => {
    const n1 = makeNoise(4, 11)
    const n2 = makeNoise(16, 12)
    const n3 = makeNoise(64, 13)
    return pixelFill(S, (u, v) => {
      // Grain runs along V (vertical in UV space).
      const warp = fbm([n1, n2], u * 0.5, v * 0.15) * 2.0
      const ring = Math.sin((u * 26 + warp * 3.2) * Math.PI)
      const fine = n3(u * 4, v * 0.25)
      const val = 205 + ring * 22 + (fine - 0.5) * 40 + (n2(u, v * 0.2) - 0.5) * 30
      return grey(val)
    })
  },
  // straighter, finer figure (walnut, cumaru) — so different woods never share one pattern
  wood_b: (S) => {
    const n1 = makeNoise(6, 15)
    const n2 = makeNoise(24, 16)
    const n3 = makeNoise(96, 17)
    return pixelFill(S, (u, v) => {
      const warp = fbm([n1, n2], u * 0.7, v * 0.12) * 1.6
      const ring = Math.sin((u * 42 + warp * 2.4) * Math.PI)
      const streak = n3(u * 3, v * 0.08)
      const val = 208 + ring * 15 + (streak - 0.5) * 46 + (n2(u * 0.5, v * 0.15) - 0.5) * 22
      return grey(val)
    })
  },
  // alpha-tested foliage card (tree canopies)
  foliage: (S) => {
    const { c, ctx } = canvas(S)
    ctx.clearRect(0, 0, S, S)
    const r = rng(301)
    const greens = ['#5f7a45', '#4f6a3a', '#6f8a52', '#41592f', '#7a9356', '#566f3e']
    for (let i = 0; i < 230; i++) {
      const cx = S * (0.12 + r() * 0.76)
      const cy = S * (0.12 + r() * 0.76)
      const dx = cx - S / 2
      const dy = cy - S / 2
      if (dx * dx + dy * dy > (S * 0.42) ** 2) continue
      const len = S * (0.035 + r() * 0.035)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(r() * Math.PI * 2)
      ctx.fillStyle = greens[Math.floor(r() * greens.length)]
      ctx.beginPath()
      ctx.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(30,40,20,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-len, 0)
      ctx.lineTo(len, 0)
      ctx.stroke()
      ctx.restore()
    }
    return c
  },
  wood_fine: (S) => {
    const n1 = makeNoise(8, 21)
    const n2 = makeNoise(64, 22)
    return pixelFill(S, (u, v) => {
      const warp = n1(u * 0.6, v * 0.1) * 1.4
      const ring = Math.sin((u * 60 + warp * 4) * Math.PI)
      const val = 215 + ring * 14 + (n2(u * 2, v * 0.3) - 0.5) * 30
      return grey(val)
    })
  },
  wood_slats: (S) => {
    const n1 = makeNoise(8, 31)
    const n2 = makeNoise(64, 32)
    return pixelFill(S, (u, v) => {
      const slat = Math.floor(u * 8)
      const local = (u * 8) % 1
      const groove = local < 0.06 ? 0.45 : 1
      const tone = 0.9 + ((slat * 37) % 10) / 60
      const ring = Math.sin((u * 80 + n1(u, v * 0.2) * 5) * Math.PI)
      const val = (210 + ring * 10 + (n2(u * 2, v * 0.3) - 0.5) * 28) * tone * groove
      return grey(val)
    })
  },
  deck: (S) => {
    const n1 = makeNoise(8, 41)
    const n2 = makeNoise(64, 42)
    const r = rng(43)
    const tones: number[] = []
    for (let i = 0; i < 64; i++) tones.push(0.86 + r() * 0.22)
    return pixelFill(S, (u, v) => {
      const board = Math.floor(v * 8)
      const local = (v * 8) % 1
      const offset = ((board * 0.37) % 1)
      const seg = Math.floor((u + offset) * 2)
      const segLocal = ((u + offset) * 2) % 1
      const gap = local < 0.05 || segLocal < 0.004 ? 0.35 : 1
      const tone = tones[(board * 3 + seg) % 64]
      const ring = Math.sin((v * 90 + n1(u * 0.3, v) * 6) * Math.PI)
      const val = (205 + ring * 10 + (n2(u * 0.4, v * 3) - 0.5) * 34) * tone * gap
      return grey(val)
    })
  },
  terrazzo: (S) => {
    const { c, ctx } = canvas(S)
    ctx.fillStyle = '#e9e1d4'
    ctx.fillRect(0, 0, S, S)
    const r = rng(51)
    const palette = ['#cdbfae', '#b9a894', '#d9cfc2', '#a69684', '#efe8de', '#c8b6a0', '#8f8172', '#e2d6c6']
    const count = Math.floor(S * S / 900)
    for (let i = 0; i < count; i++) {
      const x = r() * S
      const y = r() * S
      const rad = (r() < 0.15 ? 14 + r() * 26 : 3 + r() * 10) * (S / 1024)
      ctx.fillStyle = palette[Math.floor(r() * palette.length)]
      ctx.beginPath()
      const pts = 5 + Math.floor(r() * 4)
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2
        const rr = rad * (0.6 + r() * 0.5)
        const px = x + Math.cos(a) * rr
        const py = y + Math.sin(a) * rr
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      // wrap for tiling
      if (x < rad * 2 || y < rad * 2) {
        ctx.save()
        ctx.translate(x < rad * 2 ? S : 0, y < rad * 2 ? S : 0)
        ctx.fill()
        ctx.restore()
      }
    }
    return c
  },
  // vein-cut travertine: fine, slightly wavy horizontal strata + elongated pores
  travertine: (S) => {
    const n1 = makeNoise(3, 61)
    const n2 = makeNoise(12, 62)
    const n3 = makeNoise(64, 63)
    const strata = makeNoise(40, 64)
    return pixelFill(S, (u, v) => {
      const w = fbm([n1, n2], u, v) * 0.06
      const vv = v + w
      const layer = strata(0, vv) * 0.85 + strata(u, vv) * 0.15 // ~40 thin layers per tile (tileable)
      const band = Math.sin((vv * 23 + n1(u, v) * 0.8) * Math.PI * 2) * 0.5 + 0.5
      const pn = n3(u, v * 4) // anisotropic sampling → pores elongated along the strata
      const pore = pn < 0.16 ? (-26 * (0.16 - pn)) / 0.16 : 0
      const val = 214 + (layer - 0.5) * 22 + band * 7 + (n3(u, v) - 0.5) * 8 + pore
      return [clamp(val + 7), clamp(val + 1), clamp(val - 9)]
    })
  },
  travertine_pitted: (S) => {
    const base = generators.travertine(S)
    const ctx = base.getContext('2d')!
    const r = rng(71)
    for (let i = 0; i < S * 1.6; i++) {
      const x = r() * S
      const y = r() * S
      ctx.fillStyle = `rgba(120,100,80,${0.25 + r() * 0.35})`
      ctx.beginPath()
      ctx.ellipse(x, y, (1 + r() * 6) * (S / 1024), (0.6 + r() * 2) * (S / 1024), 0, 0, Math.PI * 2)
      ctx.fill()
    }
    return base
  },
  // white marble: soft clouding + thin, branching, low-contrast veins
  marble: (S) => {
    const n1 = makeNoise(3, 81)
    const n2 = makeNoise(7, 82)
    const n3 = makeNoise(17, 83)
    const n4 = makeNoise(48, 84)
    return pixelFill(S, (u, v) => {
      const w = fbm([n1, n2, n3], u, v)
      const main = Math.pow(1 - Math.abs(Math.sin((u + v * 2 + w * 2.6) * Math.PI)), 34)
      const sec = Math.pow(1 - Math.abs(Math.sin((u * 3 - v + fbm([n2, n3, n4], u, v) * 3.4) * Math.PI)), 60)
      const cloud = (fbm([n2, n3], u, v) - 0.5) * 16
      const val = 236 + cloud - main * 46 * (0.55 + n2(u, v) * 0.7) - sec * 22 + (n4(u, v) - 0.5) * 4
      return [clamp(val + 1), clamp(val), clamp(val - 2)]
    })
  },
  marble_soft: (S) => {
    const n1 = makeNoise(3, 91)
    const n2 = makeNoise(8, 92)
    const n3 = makeNoise(20, 93)
    return pixelFill(S, (u, v) => {
      const w = fbm([n1, n2, n3], u, v)
      const vein = Math.pow(1 - Math.abs(Math.sin((u - v * 2 + w * 2.2) * Math.PI)), 20)
      const cloud = (fbm([n1, n2], u, v) - 0.5) * 20
      const val = 228 + cloud - vein * 22 + (n3(u, v) - 0.5) * 5
      return [clamp(val + 3), clamp(val), clamp(val - 4)]
    })
  },
  pebble: (S) => {
    const { c, ctx } = canvas(S)
    ctx.fillStyle = '#9c968c'
    ctx.fillRect(0, 0, S, S)
    const r = rng(101)
    const cell = S / 14
    for (let gy = -1; gy < 15; gy++) {
      for (let gx = -1; gx < 15; gx++) {
        const x = (gx + 0.5 + (r() - 0.5) * 0.5) * cell
        const y = (gy + 0.5 + (r() - 0.5) * 0.5) * cell
        const rx = cell * (0.42 + r() * 0.16)
        const ry = cell * (0.32 + r() * 0.16)
        const a = r() * Math.PI
        const l = 205 + r() * 40
        const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.3, 1, x, y, rx)
        g.addColorStop(0, `rgb(${l + 10},${l + 8},${l + 2})`)
        g.addColorStop(0.7, `rgb(${l - 10},${l - 12},${l - 18})`)
        g.addColorStop(1, `rgb(${l - 60},${l - 62},${l - 66})`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(((x % S) + S) % S, ((y % S) + S) % S, rx, ry, a, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    return c
  },
  stone_rough: (S) => {
    const n1 = makeNoise(8, 111)
    const n2 = makeNoise(32, 112)
    const n3 = makeNoise(128, 113)
    return pixelFill(S, (u, v) => {
      const val = 200 + (fbm([n1, n2, n3], u, v) - 0.5) * 120 + (n3(u * 2, v * 2) > 0.8 ? -40 : 0)
      return [clamp(val + 4), clamp(val + 2), clamp(val - 4)]
    })
  },
  linen: (S) => {
    const n = makeNoise(256, 121)
    const n2 = makeNoise(16, 122)
    return pixelFill(S, (u, v, x, y) => {
      const warp = (x % 4 < 2 ? 1 : 0) ^ (y % 4 < 2 ? 1 : 0)
      const slub = n(u * 0.5, v * 4) * 26 + n2(u, v) * 10
      return grey(200 + warp * 16 + slub)
    })
  },
  boucle: (S) => {
    const n = makeNoise(128, 131)
    const n2 = makeNoise(256, 132)
    return pixelFill(S, (u, v) => {
      const loops = n(u, v) * 0.6 + n2(u, v) * 0.4
      return grey(150 + Math.pow(loops, 1.4) * 120)
    })
  },
  rope: (S) => {
    return pixelFill(S, (u, v) => {
      const a = Math.sin((u * 24 + v * 24) * Math.PI) * 0.5 + 0.5
      const b = Math.sin((u * 24 - v * 24) * Math.PI) * 0.5 + 0.5
      const weave = (Math.floor(u * 12) + Math.floor(v * 12)) % 2 === 0 ? a : b
      return grey(150 + weave * 100)
    })
  },
  rug_knit: (S) => {
    const n = makeNoise(64, 141)
    return pixelFill(S, (u, v) => {
      const row = Math.sin(v * Math.PI * 120) * 0.5 + 0.5
      const knot = Math.sin(u * Math.PI * 160 + Math.floor(v * 60) * 1.3) * 0.5 + 0.5
      return grey(185 + row * 30 + knot * 18 + (n(u, v) - 0.5) * 20)
    })
  },
  rug_stripes: (S) => {
    const n = makeNoise(64, 151)
    return pixelFill(S, (u, v) => {
      const stripe = Math.sin(v * Math.PI * 48) > 0.1 ? 1 : 0
      const knit = Math.sin(u * Math.PI * 200) * 0.5 + 0.5
      return grey(150 + stripe * 70 + knit * 12 + (n(u, v) - 0.5) * 14)
    })
  },
  cowhide: (S) => {
    const n1 = makeNoise(4, 161)
    const n2 = makeNoise(12, 162)
    const n3 = makeNoise(96, 163)
    return pixelFill(S, (u, v) => {
      const f = fbm([n1, n2], u, v)
      const hair = (n3(u, v * 3) - 0.5) * 24
      if (f > 0.56) return [clamp(238 + hair), clamp(234 + hair), clamp(226 + hair)]
      const d = f > 0.47 ? 0.72 : 1
      return [clamp(118 * d + hair), clamp(62 * d + hair * 0.6), clamp(30 * d + hair * 0.3)]
    })
  },
  plaster: (S) => {
    const n1 = makeNoise(16, 171)
    const n2 = makeNoise(64, 172)
    return pixelFill(S, (u, v) => grey(236 + (fbm([n1, n2], u, v) - 0.5) * 18))
  },
  concrete: (S) => {
    const n1 = makeNoise(8, 181)
    const n2 = makeNoise(32, 182)
    const n3 = makeNoise(128, 183)
    return pixelFill(S, (u, v) => grey(214 + (fbm([n1, n2, n3], u, v) - 0.5) * 40))
  },
  porcelain_grid: (S) => {
    const n1 = makeNoise(6, 191)
    const n2 = makeNoise(24, 192)
    return pixelFill(S, (u, v) => {
      const joint = u < 0.004 || v < 0.004 || u > 0.996 || v > 0.996 ? 0.8 : 1
      return grey((236 + (fbm([n1, n2], u, v) - 0.5) * 12) * joint)
    })
  },
  wallpaper_geo: (S) => {
    const base = generators.marble_soft(S)
    const ctx = base.getContext('2d')!
    ctx.strokeStyle = 'rgba(160,155,150,0.35)'
    ctx.lineWidth = 2 * (S / 1024)
    const step = S / 4
    for (let i = -1; i <= 4; i++) {
      for (let j = -1; j <= 4; j++) {
        ctx.beginPath()
        ctx.moveTo(i * step, j * step + step / 2)
        ctx.lineTo(i * step + step / 2, j * step)
        ctx.lineTo(i * step + step, j * step + step / 2)
        ctx.lineTo(i * step + step / 2, j * step + step)
        ctx.closePath()
        ctx.stroke()
      }
    }
    return base
  },
  granite: (S) => {
    const r = rng(201)
    return pixelFill(S, () => {
      const p = r()
      const v = p > 0.985 ? 150 + r() * 70 : p > 0.9 ? 70 + r() * 30 : 25 + r() * 30
      return grey(v)
    })
  },
  grass: (S) => {
    const n1 = makeNoise(8, 211)
    const n2 = makeNoise(64, 212)
    const r = rng(213)
    return pixelFill(S, (u, v) => {
      const f = fbm([n1, n2], u, v)
      const blade = r() * 40
      return [clamp(92 + f * 34 + blade * 0.35), clamp(112 + f * 40 + blade * 0.8), clamp(70 + f * 18 + blade * 0.2)]
    })
  },
  sand: (S) => {
    const n1 = makeNoise(8, 221)
    const n2 = makeNoise(32, 222)
    const r = rng(223)
    return pixelFill(S, (u, v) => {
      const f = fbm([n1, n2], u, v)
      const g = (r() - 0.5) * 36
      return [clamp(228 + f * 12 + g), clamp(209 + f * 11 + g), clamp(174 + f * 9 + g * 0.9)] // warm beach sand (ARQ p.7 / p.10)
    })
  },
  gravel: (S) => {
    const { c, ctx } = canvas(S)
    ctx.fillStyle = '#b8b3aa'
    ctx.fillRect(0, 0, S, S)
    const r = rng(231)
    for (let i = 0; i < S * S / 60; i++) {
      const x = r() * S
      const y = r() * S
      const l = 150 + r() * 100
      ctx.fillStyle = `rgb(${l},${l - 4},${l - 10})`
      ctx.beginPath()
      ctx.ellipse(x, y, (2 + r() * 4) * (S / 512), (1.5 + r() * 3) * (S / 512), r() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    return c
  },
  pavers: (S) => {
    const n = makeNoise(32, 241)
    const r = rng(242)
    const tones: number[] = []
    for (let i = 0; i < 256; i++) tones.push(0.85 + r() * 0.2)
    return pixelFill(S, (u, v) => {
      const row = Math.floor(v * 8)
      const off = row % 2 ? 0.5 : 0
      const col = Math.floor(u * 4 + off)
      const lu = (u * 4 + off) % 1
      const lv = (v * 8) % 1
      const joint = lu < 0.03 || lv < 0.06 ? 0.55 : 1
      const t = tones[(row * 7 + col) % 256]
      return grey((170 + (n(u, v) - 0.5) * 30) * t * joint)
    })
  },
  asphalt: (S) => {
    const r = rng(251)
    const n = makeNoise(16, 252)
    return pixelFill(S, (u, v) => grey(78 + (r() - 0.5) * 40 + (n(u, v) - 0.5) * 18))
  },
  pool_tile: (S) => {
    const n = makeNoise(32, 261)
    return pixelFill(S, (u, v) => {
      const lu = (u * 10) % 1
      const lv = (v * 10) % 1
      const joint = lu < 0.05 || lv < 0.05 ? 0.82 : 1
      const t = 0.92 + (n(u, v) - 0.5) * 0.12
      return [clamp(196 * t * joint), clamp(232 * t * joint), clamp(236 * t * joint)]
    })
  },
  capsule_tile: (S) => {
    const { c, ctx } = canvas(S)
    ctx.fillStyle = '#7f776d'
    ctx.fillRect(0, 0, S, S)
    const cols = 8
    const rows = 4
    const w = S / cols
    const h = S / rows
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * w + w * 0.14
        const y = j * h + h * 0.06
        const ww = w * 0.72
        const hh = h * 0.88
        const g = ctx.createLinearGradient(x, 0, x + ww, 0)
        g.addColorStop(0, '#8e8579')
        g.addColorStop(0.38, '#bfb6a9')
        g.addColorStop(1, '#958c80')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.roundRect(x, y, ww, hh, ww / 2)
        ctx.fill()
      }
    }
    return c
  },
  fluted: (S) => {
    return pixelFill(S, (u) => {
      const f = Math.sin(u * Math.PI * 2 * 12)
      return grey(190 + f * 40)
    })
  },
  louver: (S) => {
    return pixelFill(S, (_u, v) => {
      const l = (v * 16) % 1
      return grey(l < 0.15 ? 120 : 200 + (l - 0.5) * 60)
    })
  },
  water_normal: (S) => {
    const n1 = makeNoise(8, 271)
    const n2 = makeNoise(16, 272)
    const n3 = makeNoise(32, 273)
    const h = (u: number, v: number) => fbm([n1, n2, n3], u, v)
    const e = 1 / S
    return pixelFill(S, (u, v) => {
      const dx = (h(u + e, v) - h(u - e, v)) * 40
      const dy = (h(u, v + e) - h(u, v - e)) * 40
      const nx = -dx
      const ny = -dy
      const nz = 1
      const l = Math.hypot(nx, ny, nz)
      return [((nx / l) * 0.5 + 0.5) * 255, ((ny / l) * 0.5 + 0.5) * 255, ((nz / l) * 0.5 + 0.5) * 255]
    })
  },
  leaf: (S) => {
    const n = makeNoise(16, 281)
    return pixelFill(S, (u, v) => {
      const vein = Math.abs(u - 0.5) < 0.012 ? 0.75 : 1
      const side = Math.abs(Math.sin((v * 14 + Math.abs(u - 0.5) * 6) * Math.PI)) < 0.06 ? 0.88 : 1
      const f = 0.85 + n(u, v) * 0.25
      return grey(225 * vein * side * f)
    })
  },
}

/** Number of distinct textures (used for the loading progress bar). */
export const TEXTURE_KEYS = Object.keys(generators) as TextureKey[]

let baseSize = 1024
export function setTextureBaseSize(size: number) {
  baseSize = size
}

/** Colour map (sRGB). Generated lazily and cached. */
export function getTexture(key: TextureKey): THREE.Texture {
  const id = `${key}@${baseSize}`
  const hit = cache.get(id)
  if (hit) return hit
  const size = key === 'granite' || key === 'asphalt' ? Math.min(512, baseSize) : baseSize
  const cnv = generators[key](size)
  const tex = new THREE.CanvasTexture(cnv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = key === 'water_normal' ? THREE.NoColorSpace : THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  tex.needsUpdate = true
  cache.set(id, tex)
  return tex
}

const means = new Map<TextureKey, number>()
/** Mean linear luminance of a texture — used to keep tinted colours true to their swatch. */
export function textureMean(key: TextureKey): number {
  const hit = means.get(key)
  if (hit !== undefined) return hit
  const tex = getTexture(key)
  const img = tex.image as HTMLCanvasElement
  const ctx = img.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, img.width, img.height)
  let s = 0
  let n = 0
  const toLin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  for (let i = 0; i < data.length; i += 4 * 37) {
    s += 0.2126 * toLin(data[i]) + 0.7152 * toLin(data[i + 1]) + 0.0722 * toLin(data[i + 2])
    n++
  }
  const m = Math.max(0.05, s / n)
  means.set(key, m)
  return m
}

// ── derived PBR maps (normal + roughness) from the procedural height ──
const derived = new Map<string, THREE.Texture>()

function heightData(key: TextureKey) {
  const img = getTexture(key).image as HTMLCanvasElement
  const ctx = img.getContext('2d')!
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height)
  const h = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) h[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255
  return { h, width, height }
}

/** Tangent-space normal map derived from the texture's luminance. */
export function getNormalMap(key: TextureKey): THREE.Texture {
  const id = `n:${key}@${baseSize}`
  const hit = derived.get(id)
  if (hit) return hit
  const { h, width: W, height: H } = heightData(key)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const k = 3.2
  const at = (x: number, y: number) => h[((y + H) % H) * W + ((x + W) % W)]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k
      const dy = (at(x, y + 1) - at(x, y - 1)) * k
      const l = Math.hypot(dx, dy, 1)
      const i = (y * W + x) * 4
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255
      img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 8
  derived.set(id, t)
  return t
}

/** Roughness multiplier map (dark pores / grain slightly rougher). */
export function getRoughnessMap(key: TextureKey): THREE.Texture {
  const id = `r:${key}@${baseSize}`
  const hit = derived.get(id)
  if (hit) return hit
  const { h, width: W, height: H } = heightData(key)
  let mean = 0
  for (let i = 0; i < h.length; i++) mean += h[i]
  mean /= h.length
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const v = Math.max(0.7, Math.min(1, 0.9 + (mean - h[i]) * 0.6)) * 255
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  derived.set(id, t)
  return t
}

/** Pre-generates every texture, yielding to the browser between items so the
 *  loading screen can show real progress. */
export async function preloadTextures(onProgress: (done: number, total: number) => void) {
  const total = TEXTURE_KEYS.length
  let done = 0
  for (const k of TEXTURE_KEYS) {
    getTexture(k)
    done++
    onProgress(done, total)
    await new Promise((r) => setTimeout(r, 0))
  }
}
