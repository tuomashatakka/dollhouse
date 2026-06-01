import * as THREE from "three";

/**
 * A textur library — names that materials reference via `MaterialDef.texture`
 * mapped to THREE.Textures. The editor ships a small set of procedural
 * canvas textures so the viewport is usable out-of-the-box; the frontend can
 * override individual entries with file-backed textures (e.g. downloads from
 * https://ambientcg.com or https://www.poliigon.com/textures/free) by calling
 * {@link registerTexture} before any meshes mount, or by passing a fully
 * populated library to `<ModelRenderer textures={...}>`.
 */
export type TextureLibrary = Record<string, THREE.Texture>;

const registry: TextureLibrary = {};
let defaultBuilt = false;

/** Resolve a texture by key, returning `null` when unknown. */
export function resolveTexture(name: string | undefined): THREE.Texture | null {
  if (!name) return null;
  if (!defaultBuilt && typeof document !== "undefined") buildDefaultLibrary();
  return registry[name] ?? null;
}

/** Add or replace a texture by key. Call before any meshes are mounted. */
export function registerTexture(name: string, texture: THREE.Texture): void {
  registry[name] = texture;
}

/** Replace the entire default library at once. */
export function setDefaultTextureLibrary(lib: TextureLibrary): void {
  for (const key of Object.keys(registry)) delete registry[key];
  Object.assign(registry, lib);
  defaultBuilt = true;
}

/* ───────────────────────── procedural textures ───────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CanvasOpts {
  size?: number;
  seed: number;
  draw: (ctx: CanvasRenderingContext2D, rng: () => number, size: number) => void;
}

function makeCanvasTexture({ size = 512, seed, draw }: CanvasOpts): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, mulberry32(seed), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps are generated automatically by CanvasTexture when dimensions are
  // power-of-two; anisotropy keeps glancing-angle detail (lawn, paths) crisp.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function paintNoise(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  size: number,
  base: string,
  variance: number,
  density: number,
) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const count = Math.floor(size * size * density);
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.5 + rng() * 1.5;
    const v = Math.floor((rng() - 0.5) * variance);
    ctx.fillStyle = `rgba(${v < 0 ? 0 : 255},${v < 0 ? 0 : 255},${v < 0 ? 0 : 255},${Math.abs(v) / 255})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function buildDefaultLibrary(): void {
  defaultBuilt = true;
  // Cobblestone — irregular stone polygons over a dark grout base.
  registry.cobblestone = makeCanvasTexture({
    seed: 0xc0bb1e,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#2a2823";
      ctx.fillRect(0, 0, size, size);
      const stones = 38;
      for (let i = 0; i < stones; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = size * (0.05 + rng() * 0.05);
        const lightness = 35 + rng() * 35;
        const hue = 25 + rng() * 25;
        ctx.fillStyle = `hsl(${hue}, 10%, ${lightness}%)`;
        ctx.beginPath();
        const verts = 5 + Math.floor(rng() * 3);
        for (let v = 0; v < verts; v++) {
          const a = (v / verts) * Math.PI * 2;
          const rr = r * (0.7 + rng() * 0.6);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        // Tiny highlight.
        ctx.fillStyle = `hsla(${hue}, 10%, 85%, 0.15)`;
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });

  // Wood — vertical plank stripes with grain noise.
  registry.wood = makeCanvasTexture({
    seed: 0xb0a4d,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#5a3a26";
      ctx.fillRect(0, 0, size, size);
      const planks = 6;
      for (let p = 0; p < planks; p++) {
        const x0 = (p / planks) * size;
        const w = size / planks;
        const shade = 35 + rng() * 12;
        ctx.fillStyle = `hsl(${20 + rng() * 8}, 30%, ${shade}%)`;
        ctx.fillRect(x0, 0, w, size);
        // grain lines
        for (let g = 0; g < 30; g++) {
          ctx.strokeStyle = `hsla(20, 25%, ${shade - 12 + rng() * 6}%, 0.25)`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          const y = rng() * size;
          ctx.moveTo(x0, y);
          ctx.bezierCurveTo(x0 + w * 0.3, y + (rng() - 0.5) * 8, x0 + w * 0.7, y + (rng() - 0.5) * 8, x0 + w, y);
          ctx.stroke();
        }
        // plank gap
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(x0 + w - 1, 0, 1, size);
      }
    },
  });

  // Grass — dense green noise with darker speckles.
  registry.grass = makeCanvasTexture({
    seed: 0x9caa55,
    draw: (ctx, rng, size) => {
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, "#7ea860");
      grad.addColorStop(1, "#5b8543");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const blades = 4000;
      for (let i = 0; i < blades; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const dark = rng() < 0.5;
        ctx.fillStyle = dark ? `hsla(95, 35%, ${25 + rng() * 18}%, 0.6)` : `hsla(80, 45%, ${55 + rng() * 12}%, 0.5)`;
        ctx.fillRect(x, y, 1, 1 + rng() * 2);
      }
    },
  });

  // Bark — coarse vertical stripes.
  registry.bark = makeCanvasTexture({
    seed: 0xba2c0,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#3e2715";
      ctx.fillRect(0, 0, size, size);
      const stripes = 14;
      for (let s = 0; s < stripes; s++) {
        const x = (s / stripes) * size + (rng() - 0.5) * 4;
        const w = 4 + rng() * 14;
        ctx.fillStyle = `hsl(${22 + rng() * 12}, 32%, ${18 + rng() * 18}%)`;
        ctx.fillRect(x, 0, w, size);
      }
      paintNoise(ctx, rng, size, "transparent", 60, 0.001);
    },
  });

  // Pink plaster — soft creamy pink with subtle noise.
  registry["plaster-pink"] = makeCanvasTexture({
    seed: 0xf1aac4,
    draw: (ctx, rng, size) => {
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, "#f9c6da");
      grad.addColorStop(1, "#eaa9c2");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      paintNoise(ctx, rng, size, "transparent", 22, 0.004);
    },
  });

  // Pink tile — alternating squares.
  registry["tile-pink"] = makeCanvasTexture({
    seed: 0xf1be7e,
    draw: (ctx, _rng, size) => {
      const tiles = 4;
      const t = size / tiles;
      for (let r = 0; r < tiles; r++) {
        for (let c = 0; c < tiles; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? "#fbe4ec" : "#d98ab1";
          ctx.fillRect(c * t, r * t, t, t);
        }
      }
      // grout
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= tiles; i++) {
        ctx.beginPath();
        ctx.moveTo(i * t, 0);
        ctx.lineTo(i * t, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * t);
        ctx.lineTo(size, i * t);
        ctx.stroke();
      }
    },
  });

  // Burlap — coarse hessian weave with criss-crossing fibres in straw tones.
  // Used for the scarecrow's sack head and hat band.
  registry.burlap = makeCanvasTexture({
    seed: 0xb117a9,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#c2a262";
      ctx.fillRect(0, 0, size, size);
      const threads = 64;
      const step = size / threads;
      for (let i = 0; i < threads; i++) {
        const shade = 30 + rng() * 22;
        // Horizontal weave row.
        ctx.fillStyle = `hsl(${30 + rng() * 14}, 38%, ${shade}%)`;
        for (let x = 0; x < size; x += step * 2) {
          ctx.fillRect(x, i * step, step * 1.05, step * 0.9);
        }
        // Vertical weave row offset by one fibre.
        ctx.fillStyle = `hsl(${30 + rng() * 14}, 32%, ${shade + 6}%)`;
        for (let y = 0; y < size; y += step * 2) {
          ctx.fillRect(i * step, y + step, step * 0.9, step * 1.05);
        }
      }
      // A faint smudge of darker noise to age the fibre.
      paintNoise(ctx, rng, size, "transparent", 40, 0.0025);
    },
  });

  // Awning stripe — vertical alternating cream and pink bands. Used on the
  // window awnings. Authored with a soft inner shadow on each stripe so the
  // canvas reads as fabric rather than a flat decal at glancing angles.
  registry["awning-stripe"] = makeCanvasTexture({
    seed: 0x4a1d177e,
    draw: (ctx, rng, size) => {
      const stripes = 6;
      const w = size / stripes;
      for (let s = 0; s < stripes; s++) {
        const cream = s % 2 === 0;
        ctx.fillStyle = cream ? "#fff5e6" : "#e6738d";
        ctx.fillRect(s * w, 0, w, size);
        // Inner-shadow gradient along each stripe — gives a subtle "fold"
        // reading that mimics depth on a fabric surface.
        const grad = ctx.createLinearGradient(s * w, 0, s * w + w, 0);
        grad.addColorStop(0, "rgba(0,0,0,0.25)");
        grad.addColorStop(0.5, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.25)");
        ctx.fillStyle = grad;
        ctx.fillRect(s * w, 0, w, size);
        // A faint weave noise to break up the flat stripe.
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = `rgba(255,255,255,${0.04 + rng() * 0.06})`;
          ctx.fillRect(s * w + rng() * w, rng() * size, 1, 1);
        }
      }
      // Horizontal seams every 1/8 of the height — suggests stitched panels.
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (size / 8) * i);
        ctx.lineTo(size, (size / 8) * i);
        ctx.stroke();
      }
    },
  });

  // Koi water — drifting concentric ripples over a teal pond surface, with a
  // soft brightness gradient so the centre reads slightly more sunlit than
  // the shaded edge. Layered with a low-density highlight noise to break up
  // any banding on the mipmap chain.
  registry["koi-water"] = makeCanvasTexture({
    seed: 0xc01f15,
    draw: (ctx, rng, size) => {
      // Base radial gradient — sunlit centre, shaded periphery.
      const base = ctx.createRadialGradient(
        size * 0.5, size * 0.45, size * 0.05,
        size * 0.5, size * 0.5, size * 0.6,
      );
      base.addColorStop(0, "#a8d8e8");
      base.addColorStop(0.6, "#5fa3bc");
      base.addColorStop(1, "#2f5d75");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      // Three drifting ripple centres — concentric arcs.
      const centres: [number, number][] = [
        [size * 0.32, size * 0.38],
        [size * 0.7, size * 0.66],
        [size * 0.48, size * 0.78],
      ];
      ctx.lineWidth = 1.4;
      for (const [cx, cy] of centres) {
        for (let r = 6; r < size * 0.55; r += 6 + rng() * 4) {
          ctx.strokeStyle = `rgba(255,255,255,${0.08 + rng() * 0.08})`;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Tiny highlights for sparkle.
      for (let i = 0; i < 280; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.4})`;
        ctx.fillRect(x, y, 1 + rng() * 1.5, 1);
      }
      // Subtle dark depth wash near the edges to imply deeper water.
      paintNoise(ctx, rng, size, "transparent", 30, 0.0012);
    },
  });

  // Checkered cloth — red-and-cream picnic checker with a faint fabric weave
  // and a soft drape shadow at the centre of each square. Authored on a
  // power-of-two canvas with eight squares per side so the mipmap chain still
  // reads as a checker pattern when viewed from across the yard.
  registry["checkered-cloth"] = makeCanvasTexture({
    seed: 0xc4ec1ed,
    draw: (ctx, rng, size) => {
      const squares = 8;
      const sq = size / squares;
      for (let r = 0; r < squares; r++) {
        for (let c = 0; c < squares; c++) {
          const red = (r + c) % 2 === 0;
          ctx.fillStyle = red ? "#c2403a" : "#fff5e8";
          ctx.fillRect(c * sq, r * sq, sq, sq);
          // Inner-shadow gradient on each red square — gives a subtle "drape"
          // reading that mimics depth on the cloth.
          if (red) {
            const grad = ctx.createRadialGradient(
              c * sq + sq / 2, r * sq + sq / 2, sq * 0.1,
              c * sq + sq / 2, r * sq + sq / 2, sq * 0.7,
            );
            grad.addColorStop(0, "rgba(0,0,0,0)");
            grad.addColorStop(1, "rgba(0,0,0,0.2)");
            ctx.fillStyle = grad;
            ctx.fillRect(c * sq, r * sq, sq, sq);
          }
        }
      }
      // A faint horizontal/vertical weave noise — looks like fabric thread.
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + rng() * 0.06})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
      // Cream piping along the cloth edges — a thin lighter band on each side.
      ctx.fillStyle = "#fff5e8";
      ctx.fillRect(0, 0, size, 2);
      ctx.fillRect(0, size - 2, size, 2);
      ctx.fillRect(0, 0, 2, size);
      ctx.fillRect(size - 2, 0, 2, size);
    },
  });

  // Lake water — a soft blue-grey base with a long drift gradient and a few
  // faint wind-streak highlights. Designed so the mipmap chain reads as a
  // calm, distance-fading surface rather than a tiled ripple.
  registry["lake-water"] = makeCanvasTexture({
    seed: 0x1a4ec3,
    draw: (ctx, rng, size) => {
      // Base linear gradient — slightly lighter sun-side, darker shaded edge.
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, "#5a98b4");
      grad.addColorStop(0.5, "#3b6e8c");
      grad.addColorStop(1, "#2c5673");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      // Long drift highlights — thin pale streaks at gentle angles.
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 40; i++) {
        const y = rng() * size;
        const len = size * (0.35 + rng() * 0.4);
        const x0 = rng() * size;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.bezierCurveTo(
          x0 + len * 0.3, y + (rng() - 0.5) * 6,
          x0 + len * 0.7, y + (rng() - 0.5) * 6,
          x0 + len, y,
        );
        ctx.stroke();
      }
      // Sparse sparkle dots — read as sun glints on micro-waves.
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.18 + rng() * 0.3})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
      // Subtle dark noise wash to break up flat bands in deeper mip levels.
      paintNoise(ctx, rng, size, "transparent", 28, 0.0014);
    },
  });

  // ── Ninth-pass additions ───────────────────────────────────────────
  // The ninth enhancement pass introduced three new courtyard / heath
  // materials, each paired with a companion "depth" (bump) map that the
  // renderer applies as a height field. Light pixels in the depth map
  // read as raised, dark pixels as recessed — giving each colour map
  // a subtle relief read at glancing angles without extra geometry.

  // Marble — creamy off-white slab with thin grey veins. Used on the
  // garden statue pedestal and the south-heath standing stones.
  registry.marble = makeCanvasTexture({
    seed: 0xa46b1e,
    draw: (ctx, rng, size) => {
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, "#f4ede0");
      grad.addColorStop(0.5, "#ebe2d0");
      grad.addColorStop(1, "#dccdb1");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      // Soft cloud blobs to break up the gradient.
      for (let i = 0; i < 28; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = size * (0.05 + rng() * 0.12);
        const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        wash.addColorStop(0, `rgba(255,255,255,${0.05 + rng() * 0.06})`);
        wash.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = wash;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Veins — wavering thin grey strokes following sweeping bezier paths.
      ctx.strokeStyle = "rgba(70, 60, 50, 0.45)";
      ctx.lineWidth = 0.9;
      for (let v = 0; v < 9; v++) {
        ctx.beginPath();
        const y0 = rng() * size;
        let x = -10;
        let y = y0;
        ctx.moveTo(x, y);
        while (x < size + 10) {
          const dx = 40 + rng() * 80;
          const dy = (rng() - 0.5) * 60;
          ctx.bezierCurveTo(
            x + dx * 0.3, y + dy * 0.5,
            x + dx * 0.7, y + dy * 0.5,
            x + dx, y + dy,
          );
          x += dx;
          y += dy;
        }
        ctx.stroke();
      }
      // Fine sparkle noise — looks like polished mica.
      paintNoise(ctx, rng, size, "transparent", 50, 0.0014);
    },
  });
  // Marble depth map — veins are darker (recessed), micro-noise raises the
  // slab between veins. Same seed family so the relief tracks the colour.
  registry["marble-bump"] = makeCanvasTexture({
    seed: 0xa46b1e + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#b8b8b8";
      ctx.fillRect(0, 0, size, size);
      // Re-draw the vein pattern with the same RNG signature, in dark grey
      // — these read as carved-in recesses on the bump map.
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 1.3;
      for (let v = 0; v < 9; v++) {
        ctx.beginPath();
        const y0 = rng() * size;
        let x = -10;
        let y = y0;
        ctx.moveTo(x, y);
        while (x < size + 10) {
          const dx = 40 + rng() * 80;
          const dy = (rng() - 0.5) * 60;
          ctx.bezierCurveTo(
            x + dx * 0.3, y + dy * 0.5,
            x + dx * 0.7, y + dy * 0.5,
            x + dx, y + dy,
          );
          x += dx;
          y += dy;
        }
        ctx.stroke();
      }
      // High-frequency speckle for the polished surface micro-relief.
      for (let i = 0; i < 1200; i++) {
        const v = 200 + Math.floor(rng() * 55);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // Honeycomb — gold hexagonal cells over a wax-yellow base. Used on the
  // front face of the apiary hive boxes.
  registry.honeycomb = makeCanvasTexture({
    seed: 0xb33c0b,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#d49b3a";
      ctx.fillRect(0, 0, size, size);
      const cols = 8;
      const rows = 9;
      const cellW = size / cols;
      const cellH = (cellW * Math.sqrt(3)) / 2;
      for (let r = -1; r < rows + 1; r++) {
        for (let c = -1; c < cols + 1; c++) {
          const cx = c * cellW + (r % 2 === 0 ? 0 : cellW / 2);
          const cy = r * cellH;
          const radius = cellW * 0.46;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const px = cx + Math.cos(a) * radius;
            const py = cy + Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          // Cell colour — varying golden warmth.
          const lightness = 40 + rng() * 18;
          ctx.fillStyle = `hsl(${36 + rng() * 8}, 70%, ${lightness}%)`;
          ctx.fill();
          // Highlight rim — narrow lighter band on the upper-left.
          ctx.strokeStyle = `hsla(45, 80%, ${lightness + 18}%, 0.65)`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          // A tiny darker honey dot in the cell.
          ctx.fillStyle = `hsla(30, 80%, ${lightness - 22}%, 0.55)`;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      paintNoise(ctx, rng, size, "transparent", 40, 0.0018);
    },
  });
  // Honeycomb depth map — cell walls (which are bright on the colour map
  // due to the highlight rim) become raised ridges; cell interiors recede.
  registry["honeycomb-bump"] = makeCanvasTexture({
    seed: 0xb33c0b + 1,
    draw: (ctx, _rng, size) => {
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, size, size);
      const cols = 8;
      const rows = 9;
      const cellW = size / cols;
      const cellH = (cellW * Math.sqrt(3)) / 2;
      for (let r = -1; r < rows + 1; r++) {
        for (let c = -1; c < cols + 1; c++) {
          const cx = c * cellW + (r % 2 === 0 ? 0 : cellW / 2);
          const cy = r * cellH;
          const radius = cellW * 0.46;
          // Hex outline raised (bright); fill stays low (dark).
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const px = cx + Math.cos(a) * radius;
            const py = cy + Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = "#f0f0f0";
          ctx.lineWidth = 3.4;
          ctx.stroke();
        }
      }
    },
  });

  // Heather — a purple-and-mauve carpet of flowering shrubs, with darker
  // peat-coloured patches. Used as the ground texture on the south heath.
  registry.heather = makeCanvasTexture({
    seed: 0xb4e7e5,
    draw: (ctx, rng, size) => {
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, "#7a6f4a");
      grad.addColorStop(1, "#5e553a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      // Scatter blobs of heather pink, lavender and peat.
      for (let i = 0; i < 700; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const which = rng();
        const r = 2 + rng() * 5;
        let colour: string;
        if (which < 0.4) {
          colour = `hsla(${320 + rng() * 12}, 38%, ${50 + rng() * 12}%, 0.7)`;
        } else if (which < 0.75) {
          colour = `hsla(${280 + rng() * 18}, 36%, ${45 + rng() * 16}%, 0.65)`;
        } else {
          colour = `hsla(${36 + rng() * 12}, 24%, ${28 + rng() * 14}%, 0.7)`;
        }
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tiny grass-like flecks of green.
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = `hsla(${78 + rng() * 18}, 32%, ${36 + rng() * 16}%, 0.55)`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1 + rng() * 1.5);
      }
      paintNoise(ctx, rng, size, "transparent", 36, 0.002);
    },
  });
  // Heather depth map — the pink/lavender blooms sit a hair above the peat.
  registry["heather-bump"] = makeCanvasTexture({
    seed: 0xb4e7e5 + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#404040";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 700; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const which = rng();
        const r = 2 + rng() * 5;
        if (which < 0.75) {
          // Blooms raised.
          const v = 180 + Math.floor(rng() * 50);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
        } else {
          // Peat patches recessed.
          const v = 30 + Math.floor(rng() * 30);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });

  // ── Tenth-pass additions ───────────────────────────────────────────
  // The tenth enhancement pass introduced a weathered copper material
  // for the front-corner rain barrels — a base patina colour map paired
  // with a companion depth (bump) map so the verdigris mottling reads
  // as crusted relief instead of a flat decal.

  // Copper patina — a mottled green-blue base with bronze-warm streaks
  // and tarnish freckles, on a power-of-two canvas so the mipmap chain
  // stays clean. Used on the rain barrel drum.
  registry["copper-patina"] = makeCanvasTexture({
    seed: 0xc09e16a,
    draw: (ctx, rng, size) => {
      // Base gradient — warmer top (sun-bleached) into cooler patina below.
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, "#7fc09a");
      grad.addColorStop(0.45, "#4d9a76");
      grad.addColorStop(1, "#2c6c52");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      // Soft patina blobs — irregular blue-green cloud washes.
      for (let i = 0; i < 36; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = size * (0.07 + rng() * 0.18);
        const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const lightness = 35 + rng() * 25;
        const hue = rng() < 0.6 ? 150 + rng() * 30 : 30 + rng() * 18;
        wash.addColorStop(0, `hsla(${hue}, 35%, ${lightness}%, 0.55)`);
        wash.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = wash;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Vertical drip streaks — patina runs caused by rain.
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 24; i++) {
        const x = rng() * size;
        const len = size * (0.2 + rng() * 0.6);
        const startY = rng() * size * 0.4;
        ctx.strokeStyle = `hsla(${155 + rng() * 20}, 40%, ${25 + rng() * 15}%, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.bezierCurveTo(
          x + (rng() - 0.5) * 6, startY + len * 0.3,
          x + (rng() - 0.5) * 6, startY + len * 0.7,
          x + (rng() - 0.5) * 4, startY + len,
        );
        ctx.stroke();
      }
      // Bronze pinpricks where the patina has chipped back to raw copper.
      for (let i = 0; i < 90; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${20 + rng() * 14}, 60%, ${45 + rng() * 15}%, 0.7)`;
        ctx.beginPath();
        ctx.arc(x, y, 1 + rng() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // A faint speckle wash to break up flat bands in deeper mipmaps.
      paintNoise(ctx, rng, size, "transparent", 36, 0.0022);
    },
  });
  // Copper patina depth map — the patina blobs sit raised above the
  // smoother copper field, while the bronze chip pinpricks recess
  // slightly so the relief tracks the colour map's blooms.
  registry["copper-patina-bump"] = makeCanvasTexture({
    seed: 0xc09e16a + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#888888";
      ctx.fillRect(0, 0, size, size);
      // Patina blobs — bright (raised).
      for (let i = 0; i < 36; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = size * (0.07 + rng() * 0.18);
        const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        wash.addColorStop(0, "rgba(240, 240, 240, 0.55)");
        wash.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = wash;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Drip streaks raise slightly along their length too.
      ctx.lineWidth = 2;
      for (let i = 0; i < 24; i++) {
        const x = rng() * size;
        const len = size * (0.2 + rng() * 0.6);
        const startY = rng() * size * 0.4;
        ctx.strokeStyle = "rgba(220,220,220,0.45)";
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.bezierCurveTo(
          x, startY + len * 0.3,
          x, startY + len * 0.7,
          x, startY + len,
        );
        ctx.stroke();
      }
      // Bronze chip pinpricks recess (dark).
      for (let i = 0; i < 90; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `rgba(40,40,40,0.7)`;
        ctx.beginPath();
        ctx.arc(x, y, 1 + rng() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency speckle for surface micro-relief.
      for (let i = 0; i < 800; i++) {
        const v = 100 + Math.floor(rng() * 80);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // ── Eleventh-pass additions ───────────────────────────────────────────
  // The eleventh enhancement pass introduced three new procedural
  // textures: a running-bond clay brick (used on the new pizza oven and
  // the windmill tower), a cascading wisteria bloom paired with a
  // companion depth map so the floret cells read as relief for the
  // porch canopy drape, and a golden windrowed wheat field paired with
  // a wind-row depth map for the new southwest wheat-field scene
  // extension.

  // Brick — running-bond clay bricks on a mortar bed, with mottled
  // brick colour and a soft chiselled-edge highlight along each brick
  // so the courses don't read as a flat rectangle grid at glancing sun.
  registry.brick = makeCanvasTexture({
    seed: 0xb1c4ed,
    draw: (ctx, rng, size) => {
      // Mortar bed — pale tan-grey.
      ctx.fillStyle = "#bca78a";
      ctx.fillRect(0, 0, size, size);
      // 8 courses high, ~4 bricks per course at standard 2:1 brick aspect.
      const courses = 8;
      const bricksPerCourse = 4;
      const courseH = size / courses;
      const brickW = size / bricksPerCourse;
      for (let c = 0; c < courses; c++) {
        const offset = c % 2 === 0 ? 0 : brickW / 2;
        const y = c * courseH;
        for (let b = -1; b <= bricksPerCourse; b++) {
          const x = b * brickW + offset;
          const w = brickW - 4;
          const h = courseH - 4;
          // Per-brick colour — a warm red-orange with random tonal shift.
          const hue = 9 + rng() * 18;
          const sat = 38 + rng() * 22;
          const lit = 36 + rng() * 12;
          ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
          ctx.fillRect(x + 2, y + 2, w, h);
          // Darker bottom-right shadow lip suggesting a beveled edge.
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${Math.max(18, lit - 16)}%, 0.55)`;
          ctx.fillRect(x + 2, y + h, w, 2);
          ctx.fillRect(x + w, y + 2, 2, h);
          // Lighter top-left highlight lip.
          ctx.fillStyle = `hsla(${hue}, ${Math.max(20, sat - 12)}%, ${Math.min(80, lit + 18)}%, 0.5)`;
          ctx.fillRect(x + 2, y + 2, w, 2);
          ctx.fillRect(x + 2, y + 2, 2, h);
          // Sparse darker freckles on each brick face.
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = `hsla(${hue - 6}, ${sat + 4}%, ${Math.max(16, lit - 14)}%, 0.4)`;
            ctx.beginPath();
            ctx.arc(x + 4 + rng() * (w - 6), y + 4 + rng() * (h - 6), 0.6 + rng() * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // A faint speckle wash across the whole tile to keep mip levels lively.
      paintNoise(ctx, rng, size, "transparent", 30, 0.0018);
    },
  });


  // Wisteria bloom — a stacked vertical raceme of small lilac florets
  // tightening toward the bottom of the tile, on a darker leaf-shaded
  // ground. Layered with soft highlights along the raceme spine so the
  // canvas reads as a flower cluster rather than a flat band.
  registry["wisteria-bloom"] = makeCanvasTexture({
    seed: 0xb100ed,
    draw: (ctx, rng, size) => {
      // Background — deep leaf-shadow green so empty space reads as foliage.
      const bg = ctx.createLinearGradient(0, 0, 0, size);
      bg.addColorStop(0, "#3a523a");
      bg.addColorStop(1, "#2a3d29");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Several vertical racemes spanning the tile.
      const racemes = 4;
      for (let r = 0; r < racemes; r++) {
        const cx = (size / racemes) * (r + 0.5) + (rng() - 0.5) * size * 0.05;
        const topY = size * 0.04 + rng() * size * 0.06;
        const length = size * (0.85 + rng() * 0.1);
        // A faint stem line down the centre of each raceme.
        ctx.strokeStyle = `hsla(95, 35%, 28%, 0.6)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.bezierCurveTo(
          cx + (rng() - 0.5) * 6, topY + length * 0.4,
          cx + (rng() - 0.5) * 6, topY + length * 0.8,
          cx + (rng() - 0.5) * 6, topY + length,
        );
        ctx.stroke();
        // Florets stamped down the raceme, growing in size and density toward the bottom.
        const florets = 28;
        for (let i = 0; i < florets; i++) {
          const t = i / (florets - 1);
          const y = topY + length * t;
          const fwidthBase = 4 + t * 22; // florets fan out lower down.
          const flatten = 0.7 + rng() * 0.3;
          // Each floret is a cluster of 3 small petals.
          for (let p = 0; p < 3; p++) {
            const px = cx + (rng() - 0.5) * fwidthBase;
            const py = y + (rng() - 0.5) * 4;
            const lightness = 55 + rng() * 20;
            const hue = 268 + rng() * 18;
            // Pretty mauve-purple petal.
            ctx.fillStyle = `hsl(${hue}, ${40 + rng() * 25}%, ${lightness}%)`;
            ctx.beginPath();
            ctx.ellipse(px, py, 3.4 + rng() * 1.6, (3.4 + rng() * 1.6) * flatten, rng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
            // A small lighter highlight.
            ctx.fillStyle = `hsla(${hue + 6}, 55%, ${Math.min(90, lightness + 18)}%, 0.55)`;
            ctx.beginPath();
            ctx.arc(px - 0.6, py - 0.8, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // A small green leaf or two scattered along the raceme.
        for (let l = 0; l < 4; l++) {
          const y = topY + length * (0.1 + rng() * 0.85);
          const x = cx + (rng() < 0.5 ? -1 : 1) * (10 + rng() * 14);
          ctx.fillStyle = `hsl(${95 + rng() * 20}, 35%, ${30 + rng() * 18}%)`;
          ctx.beginPath();
          ctx.ellipse(x, y, 4 + rng() * 3, 1.8 + rng() * 1.4, rng() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Faint pollen-yellow speckles atop the bloom for visual interest.
      for (let i = 0; i < 120; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${48 + rng() * 12}, 70%, 70%, ${0.2 + rng() * 0.25})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + rng() * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      // Light micro-noise wash to keep deeper mipmap levels from banding.
      paintNoise(ctx, rng, size, "transparent", 22, 0.0015);
    },
  });
  // Wisteria bloom depth map — the florets sit raised above the leaf
  // ground (light = high), the raceme stems are neutral and the
  // background sinks slightly. Drawn with the same deterministic seed
  // so the relief lines up with the colour blooms.
  registry["wisteria-bloom-bump"] = makeCanvasTexture({
    seed: 0xb100ed + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#404040";
      ctx.fillRect(0, 0, size, size);
      const racemes = 4;
      for (let r = 0; r < racemes; r++) {
        const cx = (size / racemes) * (r + 0.5) + (rng() - 0.5) * size * 0.05;
        const topY = size * 0.04 + rng() * size * 0.06;
        const length = size * (0.85 + rng() * 0.1);
        const florets = 28;
        for (let i = 0; i < florets; i++) {
          const t = i / (florets - 1);
          const y = topY + length * t;
          const fwidthBase = 4 + t * 22;
          for (let p = 0; p < 3; p++) {
            const px = cx + (rng() - 0.5) * fwidthBase;
            const py = y + (rng() - 0.5) * 4;
            // Each floret bumps up — a small soft white blob.
            const blob = ctx.createRadialGradient(px, py, 0, px, py, 6);
            blob.addColorStop(0, "rgba(245,245,245,0.85)");
            blob.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = blob;
            ctx.beginPath();
            ctx.arc(px, py, 5.4 + rng() * 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Stem line — a slim neutral midtone bar so it reads flat-ish
        // between the raised florets.
        ctx.strokeStyle = "rgba(110,110,110,0.6)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.lineTo(cx, topY + length);
        ctx.stroke();
      }
      // High-frequency micro-relief noise so the surface doesn't read
      // perfectly smooth at glancing angles.
      for (let i = 0; i < 1200; i++) {
        const v = 70 + Math.floor(rng() * 80);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // Wheat field — close-packed golden grain heads on a warm ochre ground,
  // arranged in subtle horizontal wind rows so the carpet reads as a
  // breeze-tilted cropland from above. Authored at a power-of-two size so
  // the mipmap chain stays clean for the larger field tile repeats.
  registry["wheat-field"] = makeCanvasTexture({
    seed: 0x12eaf5,
    draw: (ctx, rng, size) => {
      // Warm ochre ground gradient.
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, "#d0a64d");
      grad.addColorStop(0.5, "#b88a34");
      grad.addColorStop(1, "#a07820");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      // Wind-row bands — a few wide darker stripes across the tile so the
      // eye reads them as a tilted field from above.
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const y = (r / rows) * size + (rng() - 0.5) * 4;
        ctx.fillStyle = `hsla(38, 45%, ${28 + rng() * 10}%, 0.35)`;
        ctx.fillRect(0, y, size, 1.6);
      }
      // Dense stalk specks — many thin tall slivers in muted gold tones.
      const stalks = 4200;
      for (let i = 0; i < stalks; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const lightness = 45 + rng() * 30;
        ctx.fillStyle = `hsla(${35 + rng() * 18}, ${50 + rng() * 25}%, ${lightness}%, 0.75)`;
        ctx.fillRect(x, y, 0.8 + rng() * 0.4, 2 + rng() * 3);
      }
      // Grain heads — small bright tufts arranged in rough rows for a
      // ripe wheat reading.
      for (let i = 0; i < 600; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r2 = 1.6 + rng() * 1.4;
        // Bright yellow-cream centre with a slightly warmer halo.
        ctx.fillStyle = `hsla(46, 70%, ${70 + rng() * 10}%, 0.65)`;
        ctx.beginPath();
        ctx.ellipse(x, y, r2, r2 * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Sparse darker husks and the occasional bare patch to break up the gold.
      for (let i = 0; i < 90; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${28 + rng() * 12}, 40%, ${20 + rng() * 10}%, 0.5)`;
        ctx.beginPath();
        ctx.arc(x, y, 2 + rng() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      paintNoise(ctx, rng, size, "transparent", 42, 0.0024);
    },
  });
  // Wheat field depth map — the wind rows raise slightly above the
  // surrounding stalks (light = high) and the bare patches recess
  // (dark = low) so the field carpet shows subtle relief on glancing sun.
  registry["wheat-field-bump"] = makeCanvasTexture({
    seed: 0x12eaf5 + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#7a7a7a";
      ctx.fillRect(0, 0, size, size);
      // Wind row ridges — bright horizontal bands.
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const y = (r / rows) * size + (rng() - 0.5) * 4;
        const grad = ctx.createLinearGradient(0, y - 3, 0, y + 6);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(235,235,235,0.7)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 3, size, 9);
      }
      // Stalk speckles — bright tiny dots, raised.
      for (let i = 0; i < 2400; i++) {
        const v = 200 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgba(${v},${v},${v},0.6)`;
        ctx.fillRect(rng() * size, rng() * size, 0.9, 2.2 + rng() * 1.5);
      }
      // Bare patches — soft dark recesses.
      for (let i = 0; i < 90; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, 8);
        blob.addColorStop(0, "rgba(20,20,20,0.6)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency micro relief so the carpet doesn't ever look smooth.
      for (let i = 0; i < 1500; i++) {
        const v = 90 + Math.floor(rng() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // Shingle — rows of overlapping diamond-tipped shingles, weathered cedar.
  // Used on the well roof.
  registry.shingle = makeCanvasTexture({
    seed: 0x54171c1e,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#3b2a1f";
      ctx.fillRect(0, 0, size, size);
      const rows = 7;
      const cols = 9;
      const rh = size / rows;
      const cw = size / cols;
      for (let r = 0; r < rows; r++) {
        const offset = r % 2 === 0 ? 0 : cw / 2;
        const y = size - (r + 1) * rh;
        for (let c = -1; c < cols + 1; c++) {
          const x = c * cw + offset;
          const shade = 28 + rng() * 22;
          ctx.fillStyle = `hsl(${22 + rng() * 14}, 24%, ${shade}%)`;
          // Shingle tab — a rounded-rectangle wide tooth.
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + cw * 0.96, y);
          ctx.lineTo(x + cw * 0.96, y + rh * 0.72);
          ctx.lineTo(x + cw * 0.78, y + rh * 0.88);
          ctx.lineTo(x + cw * 0.18, y + rh * 0.88);
          ctx.lineTo(x, y + rh * 0.72);
          ctx.closePath();
          ctx.fill();
          // Subtle highlight along the top edge to suggest a beveled lip.
          ctx.fillStyle = `hsla(30, 30%, ${shade + 18}%, 0.4)`;
          ctx.fillRect(x + 1, y + 1, cw * 0.94, 2);
          // Grain scratch down the middle.
          ctx.strokeStyle = `hsla(28, 20%, ${shade - 14}%, 0.55)`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x + cw / 2, y + 4);
          ctx.lineTo(x + cw / 2, y + rh * 0.84);
          ctx.stroke();
        }
      }
      paintNoise(ctx, rng, size, "transparent", 50, 0.0018);
    },
  });

  // ── Twelfth-pass additions ───────────────────────────────────────────
  // The twelfth enhancement pass introduced a single new procedural
  // texture pair: a coniferous pine bark — vertical ridged plates over a
  // warmer brown core — paired with a companion depth (bump) map so the
  // ridge edges read as raised crests at glancing sun. Used on the new
  // northwest-woodland pine grove trunks, the lookout-tower stilts and
  // the mossy fallen log.

  // Pine bark — long vertical fissured plates in warm brown tones, with
  // a sparse litter of darker resin freckles and a faint horizontal
  // grain wash. Authored on a power-of-two canvas with extra vertical
  // detail so the mipmap chain still reads as bark on distant trunks.
  registry["pine-bark"] = makeCanvasTexture({
    seed: 0xb1ec0e,
    draw: (ctx, rng, size) => {
      // Warmer brown base gradient — slightly redder at the centre to
      // suggest sap-rich heartwood peeking through.
      const bg = ctx.createLinearGradient(0, 0, 0, size);
      bg.addColorStop(0, "#5e3c24");
      bg.addColorStop(0.5, "#714a2c");
      bg.addColorStop(1, "#4a2e1c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Vertical bark plates — long irregular ridges separated by
      // darker fissures.
      const plates = 10;
      for (let p = 0; p < plates; p++) {
        const x = (p / plates) * size + (rng() - 0.5) * 6;
        const w = (size / plates) * (0.55 + rng() * 0.4);
        const lightness = 24 + rng() * 18;
        ctx.fillStyle = `hsl(${22 + rng() * 12}, ${32 + rng() * 18}%, ${lightness}%)`;
        // Draw each plate as a wavering vertical rectangle.
        ctx.beginPath();
        const segs = 12;
        const ribs: [number, number][] = [];
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const y = t * size;
          const jitter = (rng() - 0.5) * w * 0.18;
          ribs.push([x + jitter, y]);
        }
        const first = ribs[0]!;
        ctx.moveTo(first[0], first[1]);
        for (const [rx, ry] of ribs) ctx.lineTo(rx, ry);
        for (let s = segs; s >= 0; s--) {
          const t = s / segs;
          const y = t * size;
          const jitter = (rng() - 0.5) * w * 0.22;
          ctx.lineTo(x + w + jitter, y);
        }
        ctx.closePath();
        ctx.fill();
        // A lighter raised highlight along the centre of the plate.
        ctx.strokeStyle = `hsla(${26 + rng() * 8}, ${40 + rng() * 12}%, ${Math.min(60, lightness + 22)}%, 0.5)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, 0);
        for (let s = 1; s <= segs; s++) {
          const y = (s / segs) * size;
          ctx.lineTo(x + w / 2 + (rng() - 0.5) * 1.4, y);
        }
        ctx.stroke();
      }
      // Sparse horizontal cracks across plates — short dark slashes that
      // read as bark fissures from a distance.
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 60; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const len = 6 + rng() * 14;
        ctx.strokeStyle = `hsla(${20 + rng() * 10}, 30%, ${10 + rng() * 12}%, 0.55)`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y + (rng() - 0.5) * 3);
        ctx.stroke();
      }
      // Dark resin freckles — small near-black dots scattered over the trunk.
      for (let i = 0; i < 140; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${20 + rng() * 10}, 30%, ${6 + rng() * 8}%, 0.5)`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + rng() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Mossy speckle near the bottom — a faint green wash that suggests
      // damp bark close to the forest floor.
      for (let i = 0; i < 160; i++) {
        const x = rng() * size;
        const y = size * (0.5 + rng() * 0.5);
        ctx.fillStyle = `hsla(${88 + rng() * 18}, 32%, ${32 + rng() * 14}%, 0.4)`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + rng() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      paintNoise(ctx, rng, size, "transparent", 44, 0.0024);
    },
  });
  // Pine bark depth map — plate centres bump up (light = high), fissures
  // recess between them (dark = low). Same deterministic seed family so
  // the relief lines up with the colour ridges.
  registry["pine-bark-bump"] = makeCanvasTexture({
    seed: 0xb1ec0e + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(0, 0, size, size);
      const plates = 10;
      for (let p = 0; p < plates; p++) {
        const x = (p / plates) * size + (rng() - 0.5) * 6;
        const w = (size / plates) * (0.55 + rng() * 0.4);
        // Plate body — bright raised band.
        const grad = ctx.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, "rgba(40,40,40,0.6)");
        grad.addColorStop(0.5, "rgba(230,230,230,0.85)");
        grad.addColorStop(1, "rgba(40,40,40,0.6)");
        ctx.fillStyle = grad;
        // Draw a wavering rectangle along the plate.
        ctx.beginPath();
        const segs = 12;
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const y = t * size;
          const jitter = (rng() - 0.5) * w * 0.18;
          if (s === 0) ctx.moveTo(x + jitter, y);
          else ctx.lineTo(x + jitter, y);
        }
        for (let s = segs; s >= 0; s--) {
          const t = s / segs;
          const y = t * size;
          const jitter = (rng() - 0.5) * w * 0.22;
          ctx.lineTo(x + w + jitter, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      // Horizontal cracks recess slightly — short dark slashes mirror the
      // colour map's bark fissures.
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 60; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const len = 6 + rng() * 14;
        ctx.strokeStyle = "rgba(28,28,28,0.6)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y + (rng() - 0.5) * 3);
        ctx.stroke();
      }
      // High-frequency speckle for the micro-relief of rough bark.
      for (let i = 0; i < 1400; i++) {
        const v = 90 + Math.floor(rng() * 100);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });
}
