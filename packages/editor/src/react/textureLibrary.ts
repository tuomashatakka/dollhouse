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

  // ── Thirteenth-pass additions ───────────────────────────────────────────
  // The thirteenth enhancement pass introduced one new procedural texture
  // pair: a tilled vineyard soil — warm cinnamon earth in clear plough rows
  // with stubble flecks and scattered pebbles — paired with a companion
  // depth (bump) map so the row crests read as raised ridges at glancing
  // sun. Used as the ground surface on the new southeast vineyard plane.

  // Vineyard soil — warm cinnamon-brown earth carved into clear plough
  // rows running across the tile. Scatter of stubble and small pale
  // pebbles breaks up the bands so the carpet reads as worked cropland
  // rather than a flat strip.
  registry["vineyard-soil"] = makeCanvasTexture({
    seed: 0x71eb0a,
    draw: (ctx, rng, size) => {
      // Warm earth base gradient — slightly redder toward the top, cooler
      // toward the bottom so the mipmap chain has tonal variation.
      const bg = ctx.createLinearGradient(0, 0, 0, size);
      bg.addColorStop(0, "#8a5230");
      bg.addColorStop(0.5, "#6e3f24");
      bg.addColorStop(1, "#4f2c1a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Plough rows — horizontal alternating ridge/furrow bands across the
      // tile. Ridges sit lighter (sun-catching tops) and furrows darker
      // (shaded soil), with a soft transition between them.
      const rows = 10;
      const rowH = size / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rowH;
        // Ridge crest — pale band along the top half of the row.
        const crest = ctx.createLinearGradient(0, y0, 0, y0 + rowH);
        crest.addColorStop(0, `hsla(${22 + rng() * 8}, 38%, ${36 + rng() * 8}%, 0.85)`);
        crest.addColorStop(0.45, `hsla(${22 + rng() * 8}, 36%, ${22 + rng() * 6}%, 0.4)`);
        crest.addColorStop(1, `hsla(${22 + rng() * 8}, 36%, ${14 + rng() * 6}%, 0.45)`);
        ctx.fillStyle = crest;
        ctx.fillRect(0, y0, size, rowH);
        // A few cross-hatch tractor scratches along each ridge.
        ctx.strokeStyle = `hsla(${22 + rng() * 8}, 32%, ${10 + rng() * 8}%, 0.45)`;
        ctx.lineWidth = 0.7;
        for (let s = 0; s < 18; s++) {
          const y = y0 + rng() * rowH;
          const len = 8 + rng() * 22;
          const xs = rng() * size;
          ctx.beginPath();
          ctx.moveTo(xs, y);
          ctx.lineTo(xs + len, y + (rng() - 0.5) * 1.4);
          ctx.stroke();
        }
      }
      // Dark furrow lines between rows — thin shadow bands.
      ctx.strokeStyle = "rgba(28, 18, 12, 0.45)";
      ctx.lineWidth = 1.4;
      for (let r = 1; r < rows; r++) {
        const y = r * rowH;
        ctx.beginPath();
        ctx.moveTo(0, y + (rng() - 0.5) * 1);
        ctx.lineTo(size, y + (rng() - 0.5) * 1);
        ctx.stroke();
      }
      // Stubble flecks — short pale slivers of cut vine cane scattered across.
      for (let i = 0; i < 280; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${32 + rng() * 14}, 38%, ${48 + rng() * 16}%, 0.55)`;
        ctx.fillRect(x, y, 1.4 + rng() * 1.8, 0.6 + rng() * 0.8);
      }
      // Small pale pebbles dusted across the tile.
      for (let i = 0; i < 110; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${30 + rng() * 12}, 14%, ${60 + rng() * 18}%, 0.85)`;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + rng() * 1.6, 0, Math.PI * 2);
        ctx.fill();
        // Subtle shadow under each pebble for a small relief read.
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.arc(x + 0.6, y + 0.8, 0.8 + rng() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Faint micro-noise wash so deeper mipmap levels keep tonal life.
      paintNoise(ctx, rng, size, "transparent", 38, 0.0026);
    },
  });
  // Vineyard soil depth map — the ridge crests sit raised above the
  // furrows (light = high), and the dark furrow lines recess. Drawn
  // with the same row layout so the relief tracks the colour.
  registry["vineyard-soil-bump"] = makeCanvasTexture({
    seed: 0x71eb0a + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#404040";
      ctx.fillRect(0, 0, size, size);
      const rows = 10;
      const rowH = size / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rowH;
        // Ridge crest — bright soft band along the upper half.
        const crest = ctx.createLinearGradient(0, y0, 0, y0 + rowH);
        crest.addColorStop(0, "rgba(220,220,220,0.8)");
        crest.addColorStop(0.45, "rgba(120,120,120,0.4)");
        crest.addColorStop(1, "rgba(30,30,30,0.55)");
        ctx.fillStyle = crest;
        ctx.fillRect(0, y0, size, rowH);
      }
      // Furrow shadows — dark bands at row boundaries (recess).
      ctx.strokeStyle = "rgba(10,10,10,0.7)";
      ctx.lineWidth = 2.2;
      for (let r = 1; r < rows; r++) {
        const y = r * rowH;
        ctx.beginPath();
        ctx.moveTo(0, y + (rng() - 0.5) * 1);
        ctx.lineTo(size, y + (rng() - 0.5) * 1);
        ctx.stroke();
      }
      // Pale pebbles — small raised bumps scattered over the soil.
      for (let i = 0; i < 110; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, 4);
        blob.addColorStop(0, "rgba(245,245,245,0.85)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, 2.6 + rng() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency speckle so the ploughed surface doesn't read smooth.
      for (let i = 0; i < 1500; i++) {
        const v = 80 + Math.floor(rng() * 100);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // ── Fourteenth-pass additions ────────────────────────────────────────
  // The fourteenth enhancement pass introduces a single new procedural
  // texture pair: a Mediterranean olive-grove ground — sun-bleached khaki
  // earth strewn with rosemary tufts, scattered olive pits and pale dry
  // pebbles — paired with a companion depth (bump) map so the pits and
  // pebbles read as raised relief at glancing sun. Used as the ground
  // surface on the new southeast olive grove plane.

  // Olive-grove ground — warm khaki earth with rosemary-green tufts,
  // dark olive-pit specks and pale flat pebbles. Authored on a
  // power-of-two canvas so the mipmap chain stays clean at the long
  // tile repeats used across the grove.
  registry["olive-grove"] = makeCanvasTexture({
    seed: 0x0117e91,
    draw: (ctx, rng, size) => {
      // Warm earth base gradient — slightly lighter top-left (sun-side),
      // dustier toward the bottom-right.
      const bg = ctx.createLinearGradient(0, 0, size, size);
      bg.addColorStop(0, "#c7ac72");
      bg.addColorStop(0.5, "#a48b54");
      bg.addColorStop(1, "#7c6638");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Pale sun-bleached patches — soft cream blooms scattered across.
      for (let i = 0; i < 18; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 14 + rng() * 22;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, `hsla(40, 38%, ${70 + rng() * 10}%, 0.35)`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Dusty rosemary tufts — short irregular green clumps in two shades.
      for (let i = 0; i < 320; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const dark = rng() < 0.45;
        ctx.fillStyle = dark
          ? `hsla(80, 28%, ${24 + rng() * 14}%, 0.7)`
          : `hsla(78, 32%, ${42 + rng() * 12}%, 0.7)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 1.6 + rng() * 1.4, 0.9 + rng() * 0.7, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        // A few short stem flicks above the tuft.
        ctx.strokeStyle = `hsla(78, 30%, ${28 + rng() * 14}%, 0.55)`;
        ctx.lineWidth = 0.6;
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rng() - 0.5) * 2.5, y - 1.4 - rng() * 1.6);
          ctx.stroke();
        }
      }
      // Olive pits — small dark almond-shaped specks.
      for (let i = 0; i < 200; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${20 + rng() * 14}, 30%, ${10 + rng() * 8}%, 0.85)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 1.5 + rng() * 0.8, 0.9 + rng() * 0.4, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        // A tiny glint at one tip.
        ctx.fillStyle = "rgba(255,240,200,0.35)";
        ctx.fillRect(x - 0.5, y - 0.6, 1, 0.6);
      }
      // Pale dry pebbles — flat round dots in cream/grey tones.
      for (let i = 0; i < 130; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 1.4 + rng() * 1.8;
        ctx.fillStyle = `hsla(${36 + rng() * 14}, 12%, ${64 + rng() * 16}%, 0.9)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Soft shadow under each pebble for a small relief read.
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.arc(x + 0.7, y + 0.9, r * 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fine micro-noise wash so deeper mipmap levels keep tonal life.
      paintNoise(ctx, rng, size, "transparent", 36, 0.0028);
    },
  });
  // Olive-grove depth map — pebbles raised as small bumps, rosemary tufts
  // sit slightly above the soil, and the sun-bleached patches recess
  // gently so the relief tracks the warmth of the colour map.
  registry["olive-grove-bump"] = makeCanvasTexture({
    seed: 0x0117e91 + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#666666";
      ctx.fillRect(0, 0, size, size);
      // Sun-bleached patches recess (soft dark blobs).
      for (let i = 0; i < 18; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 14 + rng() * 22;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, "rgba(40,40,40,0.55)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Rosemary tufts — soft raised blobs.
      for (let i = 0; i < 320; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, 3);
        blob.addColorStop(0, "rgba(210,210,210,0.6)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, 2 + rng() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pale pebbles — small bright rounded bumps with a soft falloff.
      for (let i = 0; i < 130; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 2.4 + rng() * 1.4;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, "rgba(245,245,245,0.92)");
        blob.addColorStop(0.6, "rgba(150,150,150,0.4)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Olive pit specks — tiny dark recesses.
      for (let i = 0; i < 200; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = "rgba(20,20,20,0.7)";
        ctx.beginPath();
        ctx.ellipse(x, y, 1.4 + rng() * 0.7, 0.85 + rng() * 0.35, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency speckle so the dry soil never looks smooth.
      for (let i = 0; i < 1500; i++) {
        const v = 90 + Math.floor(rng() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // ── Fifteenth-pass additions ────────────────────────────────────────
  // The fifteenth enhancement pass introduces a single new procedural
  // texture pair: a cultivated lavender-field ground — sage-green tilled
  // earth strewn with purple bloom dabs from cultivated lavender rows,
  // dusty pale gravel and a sparse scatter of fallen florets — paired
  // with a companion depth (bump) map so the bloom-row crests and gravel
  // pebbles read as raised relief at glancing sun. Used as the ground
  // surface on the new southwest lavender-field plane.

  // Lavender-field ground — sage-green earth with rows of cultivated
  // lavender (purple bloom dabs), pale gravel pebbles, fallen florets
  // and a soft sun-bleached cast across the bloom rows.
  registry["lavender-field"] = makeCanvasTexture({
    seed: 0x015a7e7,
    draw: (ctx, rng, size) => {
      // Sage-green earth base gradient — warmer along the top-right
      // (afternoon sun) and slightly cooler toward the lower-left.
      const bg = ctx.createLinearGradient(size, 0, 0, size);
      bg.addColorStop(0, "#8a9a64");
      bg.addColorStop(0.5, "#6c8049");
      bg.addColorStop(1, "#4c603a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Tilled cultivation rows — long faint stripes running the length
      // of the canvas, alternating lighter / darker bands. These are the
      // bands along which the lavender bloom dabs cluster.
      const rowCount = 7;
      for (let r = 0; r < rowCount; r++) {
        const y = (r + 0.5) * (size / rowCount) + (rng() - 0.5) * 3;
        ctx.fillStyle = r % 2 === 0
          ? "rgba(184,184,140,0.18)"
          : "rgba(60,80,52,0.22)";
        ctx.fillRect(0, y - 5, size, 10);
      }
      // Lavender bloom dabs — small purple cluster dots along each row,
      // shifting between bright bloom-purple and a deeper muted shade.
      for (let r = 0; r < rowCount; r++) {
        const yRow = (r + 0.5) * (size / rowCount);
        const dabCount = 80;
        for (let i = 0; i < dabCount; i++) {
          const x = rng() * size;
          const y = yRow + (rng() - 0.5) * 7;
          const radius = 1.4 + rng() * 1.6;
          const hue = 268 + Math.floor(rng() * 18);
          const light = 38 + Math.floor(rng() * 14);
          ctx.fillStyle = `hsla(${hue}, 42%, ${light}%, 0.85)`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          // Soft bloom halo for the brighter dabs.
          if (rng() < 0.32) {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
            glow.addColorStop(0, `hsla(${hue}, 60%, 70%, 0.34)`);
            glow.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // Pale gravel pebbles — small bright dots scattered between rows.
      for (let i = 0; i < 140; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 1.4 + rng() * 1.6;
        ctx.fillStyle = `hsla(${42 + rng() * 16}, 12%, ${66 + rng() * 14}%, 0.86)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Soft drop shadow under the pebble.
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.arc(x + 0.7, y + 0.9, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fallen florets — tiny purple specks adrift over the rows.
      for (let i = 0; i < 220; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${272 + rng() * 12}, 36%, ${44 + rng() * 16}%, 0.6)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 0.9 + rng() * 0.5, 0.55 + rng() * 0.3, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // Subtle warm sun-cast blooms — a soft cream wash on the bloom rows.
      for (let i = 0; i < 14; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 20 + rng() * 22;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, `hsla(50, 32%, ${70 + rng() * 12}%, 0.18)`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fine micro-noise wash so the soil keeps tonal life at deeper mips.
      paintNoise(ctx, rng, size, "transparent", 30, 0.0028);
    },
  });
  // Lavender-field depth map — bloom row crests sit slightly above the
  // soil, gravel pebbles are small bright bumps and fallen florets recess
  // gently so the relief tracks the bloom rhythm of the colour map.
  registry["lavender-field-bump"] = makeCanvasTexture({
    seed: 0x015a7e7 + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#5e5e5e";
      ctx.fillRect(0, 0, size, size);
      const rowCount = 7;
      // Row crests — long subtle raised bands of lavender.
      for (let r = 0; r < rowCount; r++) {
        const y = (r + 0.5) * (size / rowCount);
        const grad = ctx.createLinearGradient(0, y - 6, 0, y + 6);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(220,220,220,0.6)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 6, size, 12);
      }
      // Bloom dabs — small raised bright bumps on each row.
      for (let r = 0; r < rowCount; r++) {
        const yRow = (r + 0.5) * (size / rowCount);
        for (let i = 0; i < 80; i++) {
          const x = rng() * size;
          const y = yRow + (rng() - 0.5) * 6;
          const radius = 1.6 + rng() * 1.4;
          const blob = ctx.createRadialGradient(x, y, 0, x, y, radius);
          blob.addColorStop(0, "rgba(250,250,250,0.85)");
          blob.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = blob;
          ctx.beginPath();
          ctx.arc(x, y, radius * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Gravel pebbles — bright rounded bumps with soft falloff.
      for (let i = 0; i < 140; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 2.4 + rng() * 1.4;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, "rgba(245,245,245,0.92)");
        blob.addColorStop(0.6, "rgba(150,150,150,0.4)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fallen florets — tiny dark recess specks.
      for (let i = 0; i < 220; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = "rgba(20,20,20,0.65)";
        ctx.beginPath();
        ctx.ellipse(x, y, 1.0 + rng() * 0.5, 0.6 + rng() * 0.3, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency speckle so the cultivation surface never reads smooth.
      for (let i = 0; i < 1500; i++) {
        const v = 80 + Math.floor(rng() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // ── Sixteenth-pass additions ────────────────────────────────────────
  // The sixteenth enhancement pass introduces a single new procedural
  // texture pair: a snow-dusted alpine foothills ground — a pale snow
  // base mottled with exposed mossy patches, scattered grey scree pebbles
  // and a fringe of dark pine needle litter — paired with a companion
  // depth (bump) map so the snowdrifts and rock heads read as raised
  // relief at glancing sun. Used as the ground surface on the new far-
  // north alpine foothills plane.

  // Alpine-foothills ground — a pale snow base with exposed mossy
  // patches, scattered grey scree pebbles, dark pine needle litter and
  // soft drifted ridges crossing the surface.
  registry["alpine-foothills"] = makeCanvasTexture({
    seed: 0x16a17ee5,
    draw: (ctx, rng, size) => {
      // Cool snow base gradient — warmer along the top-right (low
      // afternoon sun) and slightly cooler toward the lower-left where
      // drifts shadow gathers.
      const bg = ctx.createLinearGradient(size, 0, 0, size);
      bg.addColorStop(0, "#f6f7f9");
      bg.addColorStop(0.5, "#dde2e8");
      bg.addColorStop(1, "#b8c2cc");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Exposed mossy patches — soft irregular green blobs where the
      // snow has melted off and revealed alpine moss / lichen beneath.
      for (let i = 0; i < 36; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = 14 + rng() * 28;
        const blob = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
        const hue = 70 + Math.floor(rng() * 30);
        const light = 30 + Math.floor(rng() * 18);
        blob.addColorStop(0, `hsla(${hue}, 35%, ${light}%, 0.72)`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        const verts = 7 + Math.floor(rng() * 4);
        for (let v = 0; v < verts; v++) {
          const a = (v / verts) * Math.PI * 2;
          const rr = r * (0.6 + rng() * 0.7);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      // Drifted snow ridges — long faint pale stripes running diagonally
      // across the canvas, suggesting wind-carved snow.
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.PI / 6);
      ctx.translate(-size / 2, -size / 2);
      for (let i = 0; i < 9; i++) {
        const y = (i / 9) * size + (rng() - 0.5) * 8;
        const grad = ctx.createLinearGradient(0, y - 6, 0, y + 6);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.5)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 6, size, 12);
      }
      ctx.restore();
      // Grey scree pebbles — small darker rounded specks scattered over
      // the snow, with a tiny shadow on the lower-right side of each.
      for (let i = 0; i < 220; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 1.4 + rng() * 1.6;
        const light = 24 + Math.floor(rng() * 24);
        ctx.fillStyle = `hsl(${30 + rng() * 20}, 8%, ${light}%)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Tiny shadow under each pebble.
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.arc(x + 0.8, y + 0.9, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      // Dark pine needle litter — slim dark slivers scattered through
      // the moss patches, reading as fallen needles on the alpine floor.
      for (let i = 0; i < 320; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${22 + rng() * 14}, 38%, ${14 + rng() * 12}%, 0.7)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 0.6 + rng() * 0.5, 2.4 + rng() * 1.8, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // A faint cool sun-cast wash on the drifts — pale blue-cream
      // highlight blobs that mimic indirect light off the snow surface.
      for (let i = 0; i < 16; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 24 + rng() * 28;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, `hsla(210, 28%, ${82 + rng() * 8}%, 0.22)`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fine micro-noise wash so the snow retains tonal life at deeper mips.
      paintNoise(ctx, rng, size, "transparent", 28, 0.003);
    },
  });
  // Alpine-foothills depth map — snowdrifts ride above the base ground,
  // exposed moss patches recess slightly, pebbles read as small rounded
  // bumps and pine needle litter sits at the base height.
  registry["alpine-foothills-bump"] = makeCanvasTexture({
    seed: 0x16a17ee5 + 1,
    draw: (ctx, rng, size) => {
      ctx.fillStyle = "#5e5e5e";
      ctx.fillRect(0, 0, size, size);
      // Drifted snow ridges — long bright raised bands of snow drift.
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.PI / 6);
      ctx.translate(-size / 2, -size / 2);
      for (let i = 0; i < 9; i++) {
        const y = (i / 9) * size;
        const grad = ctx.createLinearGradient(0, y - 8, 0, y + 8);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(225,225,225,0.7)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 8, size, 16);
      }
      ctx.restore();
      // Exposed moss patches — gentle recess so the patches sit below
      // the surrounding snow line.
      for (let i = 0; i < 36; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = 14 + rng() * 28;
        const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        blob.addColorStop(0, "rgba(45,45,45,0.65)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Scree pebbles — bright rounded bumps with soft falloff so they
      // read as small rocks poking through the snow.
      for (let i = 0; i < 220; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 2.0 + rng() * 1.4;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, "rgba(245,245,245,0.92)");
        blob.addColorStop(0.6, "rgba(150,150,150,0.4)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pine needle litter — slim recess slivers that read as scattered
      // dark fallen needles.
      for (let i = 0; i < 320; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = "rgba(30,30,30,0.55)";
        ctx.beginPath();
        ctx.ellipse(x, y, 0.7 + rng() * 0.5, 2.6 + rng() * 1.6, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency speckle so the snow surface never reads flat.
      for (let i = 0; i < 1600; i++) {
        const v = 80 + Math.floor(rng() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // ── Seventeenth-pass additions ──────────────────────────────────────
  // The seventeenth enhancement pass introduces two new procedural
  // texture pairs: a leaded `stained-glass` panel of saturated
  // amber / rose / teal / gold wedges around a central rose-window
  // medallion (paired with a depth map so the lead cames read as
  // raised relief at glancing light), used as the surface of the
  // arched fanlight transom above the front door; and an
  // `autumn-canopy` ground — an auburn earth base mottled with
  // crimson / amber / gold leaf piles, exposed soil patches and
  // scattered twigs — paired with a leaf-litter depth map so the
  // piles and soil patches read as raised relief at glancing sun.
  // Used as the ground surface on the new northeast autumn maple
  // grove plane.

  // Stained-glass colour map — a Victorian rose-window medallion: a
  // central amber roundel ringed by alternating rose / teal / gold
  // petal wedges, divided into quadrants by a leaded cross.
  registry["stained-glass"] = makeCanvasTexture({
    seed: 0x17a91e7e,
    draw: (ctx, rng, size) => {
      // Dark lead base — every glass panel sits over a slim dark gap.
      ctx.fillStyle = "#1f1c18";
      ctx.fillRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      // Outer rectangular field — fill with a deep teal ground.
      ctx.fillStyle = "#3f6e80";
      ctx.fillRect(8, 8, size - 16, size - 16);
      // Eight petal wedges fanning around the centre — alternate
      // amber / rose / gold / teal so the rose-window pattern reads.
      const petalCount = 8;
      const palette = ["#f0b664", "#ef89a8", "#f4c542", "#3f7780", "#f0b664", "#ef89a8", "#f4c542", "#3f7780"];
      const petalR = size * 0.36;
      for (let i = 0; i < petalCount; i++) {
        const a0 = (i / petalCount) * Math.PI * 2;
        const a1 = ((i + 1) / petalCount) * Math.PI * 2;
        ctx.fillStyle = palette[i]!;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, petalR, a0 + 0.04, a1 - 0.04);
        ctx.closePath();
        ctx.fill();
        // Slim painted highlight strip near the outer edge of the petal
        // so each wedge reads with a tonal lift toward the rim.
        ctx.fillStyle = `rgba(255,255,255,${0.16 + rng() * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos((a0 + a1) / 2) * petalR * 0.65, cy + Math.sin((a0 + a1) / 2) * petalR * 0.65);
        ctx.arc(cx, cy, petalR - 6, a0 + 0.12, a1 - 0.12);
        ctx.closePath();
        ctx.fill();
      }
      // Central amber roundel — small bright disc at the centre of the
      // rose window with a slim gold highlight ring.
      ctx.fillStyle = "#f0b664";
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,210,140,0.4)";
      ctx.beginPath();
      ctx.arc(cx - size * 0.03, cy - size * 0.04, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
      // Leaded mullions — eight radial cames + a circular came at the
      // petal radius and a smaller circular came at the roundel rim.
      ctx.strokeStyle = "#1f1c18";
      ctx.lineWidth = 6;
      for (let i = 0; i < petalCount; i++) {
        const a = (i / petalCount) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * petalR, cy + Math.sin(a) * petalR);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, petalR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      // Outer frame came — a thick dark border around the whole panel.
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#1a1816";
      ctx.strokeRect(8, 8, size - 16, size - 16);
      // Four corner spandrels filled with a deep teal so the rectangle
      // outside the circular rose reads as inset glass not blank lead.
      const cornerR = size * 0.18;
      const corners: [number, number][] = [
        [16 + cornerR * 0.4, 16 + cornerR * 0.4],
        [size - 16 - cornerR * 0.4, 16 + cornerR * 0.4],
        [16 + cornerR * 0.4, size - 16 - cornerR * 0.4],
        [size - 16 - cornerR * 0.4, size - 16 - cornerR * 0.4],
      ];
      for (let i = 0; i < corners.length; i++) {
        const [x, y] = corners[i]!;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, cornerR);
        grad.addColorStop(0, i % 2 === 0 ? "rgba(63,119,128,0.85)" : "rgba(63,119,128,0.85)");
        grad.addColorStop(1, "rgba(20,40,52,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, cornerR, 0, Math.PI * 2);
        ctx.fill();
      }
      // Small painted highlight on each glass wedge — slim white smudge
      // suggesting a reflection across the cathedral glass.
      for (let i = 0; i < 18; i++) {
        const a = rng() * Math.PI * 2;
        const r = (0.15 + rng() * 0.25) * size;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        ctx.fillStyle = `rgba(255,255,255,${0.18 + rng() * 0.18})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + rng() * 5, 8 + rng() * 14, a, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency tinted glass speckle so deeper mips still read
      // as patterned glass rather than a smooth tint.
      paintNoise(ctx, rng, size, "transparent", 38, 0.004);
    },
  });

  // Stained-glass depth map — bright lead cames as raised relief, glass
  // panels as flat / very slightly recessed.
  registry["stained-glass-bump"] = makeCanvasTexture({
    seed: 0x17a91e7e + 1,
    draw: (ctx, rng, size) => {
      // Glass panels recess slightly below the lead lines.
      ctx.fillStyle = "#7a7a7a";
      ctx.fillRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const petalCount = 8;
      const petalR = size * 0.36;
      // Lead came + outer frame — bright bands the glass sits between.
      ctx.strokeStyle = "#f5f5f5";
      ctx.lineWidth = 7;
      for (let i = 0; i < petalCount; i++) {
        const a = (i / petalCount) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * petalR, cy + Math.sin(a) * petalR);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, petalR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 12;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(8, 8, size - 16, size - 16);
      // A central raised disc at the keystone medallion.
      ctx.fillStyle = "#f0f0f0";
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
      // Slim raised highlight strips on each petal — read as the
      // bevelled glass edge along the inner curve of the came.
      for (let i = 0; i < petalCount; i++) {
        const a0 = (i / petalCount) * Math.PI * 2;
        const a1 = ((i + 1) / petalCount) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        ctx.strokeStyle = "rgba(220,220,220,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const r0 = petalR * 0.5;
        const r1 = petalR * 0.95;
        ctx.moveTo(cx + Math.cos(am) * r0, cy + Math.sin(am) * r0);
        ctx.lineTo(cx + Math.cos(am) * r1, cy + Math.sin(am) * r1);
        ctx.stroke();
      }
      // Speckled glass micro-relief so the panels never look perfectly
      // flat at deeper mip levels.
      for (let i = 0; i < 900; i++) {
        const v = 100 + Math.floor(rng() * 60);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // Autumn-canopy ground colour map — an auburn earth base mottled with
  // crimson / amber / gold leaf piles, exposed soil patches and dark
  // scattered twigs, suggesting a thick blanket of fallen maple leaves.
  registry["autumn-canopy"] = makeCanvasTexture({
    seed: 0x17a91eaf,
    draw: (ctx, rng, size) => {
      // Auburn earth base — slightly warmer toward the top-right where
      // afternoon sun hits, cooler toward the lower-left in shadow.
      const bg = ctx.createLinearGradient(size, 0, 0, size);
      bg.addColorStop(0, "#9a5b2c");
      bg.addColorStop(0.5, "#7a4a25");
      bg.addColorStop(1, "#4e2e18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Exposed soil patches — soft irregular dark mottling where leaves
      // have blown clear and bare earth shows through.
      for (let i = 0; i < 40; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = 12 + rng() * 26;
        const blob = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        const hue = 22 + Math.floor(rng() * 14);
        const light = 14 + Math.floor(rng() * 12);
        blob.addColorStop(0, `hsla(${hue}, 40%, ${light}%, 0.85)`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        const verts = 7 + Math.floor(rng() * 4);
        for (let v = 0; v < verts; v++) {
          const a = (v / verts) * Math.PI * 2;
          const rr = r * (0.6 + rng() * 0.7);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      // Crimson maple-leaf clusters — flat irregular leaf shapes painted
      // as dark red ovals with a fine pointed tip.
      for (let i = 0; i < 260; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const rot = rng() * Math.PI * 2;
        const hue = 350 + rng() * 25;
        const light = 30 + Math.floor(rng() * 18);
        ctx.fillStyle = `hsl(${hue}, 60%, ${light}%)`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3 + rng() * 3, 6 + rng() * 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Amber maple leaves — warmer orange tones scattered above the
      // crimson layer, slightly larger so they read as the dominant
      // canopy tone at distance.
      for (let i = 0; i < 320; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const rot = rng() * Math.PI * 2;
        const hue = 22 + rng() * 14;
        const light = 42 + Math.floor(rng() * 14);
        ctx.fillStyle = `hsl(${hue}, 70%, ${light}%)`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4 + rng() * 3, 7 + rng() * 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Gold maple leaves — bright yellow flecks scattered through the
      // canopy litter to lift the colour.
      for (let i = 0; i < 180; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const rot = rng() * Math.PI * 2;
        const hue = 38 + rng() * 12;
        const light = 50 + Math.floor(rng() * 14);
        ctx.fillStyle = `hsl(${hue}, 75%, ${light}%)`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3 + rng() * 3, 6 + rng() * 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Dark scattered twigs — slim brown slivers strewn through the
      // leaf litter to break the colour rhythm.
      for (let i = 0; i < 120; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = `hsla(${22 + rng() * 12}, 50%, ${16 + rng() * 14}%, 0.8)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 0.7 + rng() * 0.5, 8 + rng() * 6, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // A faint warm sun-cast wash — large pale blobs lifted toward the
      // top-right of the canvas so the ground catches a gold sun glow.
      for (let i = 0; i < 12; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 28 + rng() * 32;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, `hsla(${30 + rng() * 12}, 75%, ${64 + rng() * 8}%, 0.22)`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fine micro-noise so the surface retains tonal life at deep mips.
      paintNoise(ctx, rng, size, "transparent", 38, 0.004);
    },
  });

  // Autumn-canopy depth map — raised leaf piles where leaves cluster, a
  // gentle recess in the exposed soil patches and small bumps for the
  // scattered twigs and pebbles.
  registry["autumn-canopy-bump"] = makeCanvasTexture({
    seed: 0x17a91eaf + 1,
    draw: (ctx, rng, size) => {
      // Mid-grey base — average leaf-blanket height.
      ctx.fillStyle = "#7c7c7c";
      ctx.fillRect(0, 0, size, size);
      // Exposed soil patches — soft recess so the bare earth sits below
      // the leaf piles around it.
      for (let i = 0; i < 40; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = 12 + rng() * 26;
        const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        blob.addColorStop(0, "rgba(40,40,40,0.7)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Raised leaf piles — bright ringed mounds where leaves bank up.
      for (let i = 0; i < 30; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = 18 + rng() * 28;
        const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        blob.addColorStop(0, "rgba(245,245,245,0.6)");
        blob.addColorStop(0.5, "rgba(180,180,180,0.4)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Slim leaf flecks — small bright spots scattered through the
      // surface so each individual leaf reads as a tiny bump.
      for (let i = 0; i < 600; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const rot = rng() * Math.PI * 2;
        ctx.fillStyle = `rgba(${180 + Math.floor(rng() * 60)},${180 + Math.floor(rng() * 60)},${180 + Math.floor(rng() * 60)},0.65)`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.6 + rng() * 1.5, 3.5 + rng() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Dark twig recesses — slim dark slivers reading as twigs pressed
      // into the leaf surface.
      for (let i = 0; i < 120; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.fillStyle = "rgba(40,40,40,0.55)";
        ctx.beginPath();
        ctx.ellipse(x, y, 0.7 + rng() * 0.5, 8 + rng() * 6, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // High-frequency speckle so the surface keeps tonal life at deep
      // mip levels.
      for (let i = 0; i < 1400; i++) {
        const v = 90 + Math.floor(rng() * 80);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });

  // ── Eighteenth-pass additions ──────────────────────────────────────
  // The eighteenth enhancement pass introduces a new procedural texture
  // pair for the northwest waterfall ravine: a `granite-cliff` colour
  // map that suggests blocky granite with horizontal bedding cracks,
  // lichen mottling and a scatter of dark mineral flecks, paired with
  // a `granite-cliff-bump` depth map that lifts the bedding cracks and
  // lichen patches as raised relief at glancing sun. Both maps are used
  // on the ravine ground plane and the cliff-face slabs.

  // Granite-cliff colour map — a cool stone ground with horizontal
  // bedding cracks, lichen patches and dark mineral flecks suggesting
  // a weathered granite outcrop.
  registry["granite-cliff"] = makeCanvasTexture({
    seed: 0x9ee2a17e,
    draw: (ctx, rng, size) => {
      // Cool-grey granite base — slightly warmer toward the top where
      // afternoon sun catches the rim, cooler toward the lower edge in
      // shadow.
      const bg = ctx.createLinearGradient(0, 0, 0, size);
      bg.addColorStop(0, "#8a8278");
      bg.addColorStop(0.5, "#6e6660");
      bg.addColorStop(1, "#4a4540");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // Wide blocky granite faces — soft irregular polygon patches in
      // varied warm + cool greys giving the rock a layered look.
      const blocks = 28;
      for (let i = 0; i < blocks; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = size * (0.06 + rng() * 0.07);
        const hue = 22 + rng() * 28;
        const sat = 6 + rng() * 8;
        const light = 32 + rng() * 22;
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
        ctx.beginPath();
        const verts = 6 + Math.floor(rng() * 3);
        for (let v = 0; v < verts; v++) {
          const a = (v / verts) * Math.PI * 2 + rng() * 0.2;
          const rr = r * (0.7 + rng() * 0.6);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        // Slim painted highlight strip along the upper rim of the block.
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${Math.min(85, light + 28)}%, 0.18)`;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.2, cy - r * 0.35, r * 0.7, r * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Horizontal bedding cracks — eight slim dark lines running
      // mostly horizontally across the canvas, breaking the granite
      // into layered bedding planes.
      for (let i = 0; i < 8; i++) {
        const y = (i / 8) * size + (rng() - 0.5) * (size * 0.06);
        const segs = 6 + Math.floor(rng() * 5);
        ctx.strokeStyle = "rgba(28,26,22,0.7)";
        ctx.lineWidth = 1.4 + rng() * 1.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let s = 0; s < segs; s++) {
          const x = ((s + 1) / segs) * size;
          const yy = y + (rng() - 0.5) * (size * 0.04);
          ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // Lichen patches — soft yellow-green mottles scattered across the
      // face suggesting weathered rock-clinging growth.
      for (let i = 0; i < 18; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 8 + rng() * 22;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        const hue = 60 + rng() * 30;
        grad.addColorStop(0, `hsla(${hue}, 35%, ${48 + rng() * 14}%, 0.55)`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Vertical fracture lines — slim broken dark slivers running
      // mostly vertically across the surface.
      for (let i = 0; i < 14; i++) {
        const x = rng() * size;
        const segs = 4 + Math.floor(rng() * 3);
        ctx.strokeStyle = "rgba(20,18,16,0.55)";
        ctx.lineWidth = 0.8 + rng() * 1.2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let s = 0; s < segs; s++) {
          const y = ((s + 1) / segs) * size;
          const xx = x + (rng() - 0.5) * (size * 0.08);
          ctx.lineTo(xx, y);
        }
        ctx.stroke();
      }
      // Dark mineral flecks — small black dots speckled across the
      // surface so the granite reads as a freckled, mineral-rich rock.
      for (let i = 0; i < 800; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const v = Math.floor(rng() * 22);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 1 + rng(), 1 + rng());
      }
      // Faint sun-cast highlight — a wide pale wash drifting across
      // the upper third so glancing sun catches the rim.
      const sun = ctx.createRadialGradient(size * 0.7, size * 0.2, 0, size * 0.7, size * 0.2, size * 0.6);
      sun.addColorStop(0, "rgba(255,250,232,0.12)");
      sun.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, size, size);
      // Fine micro-noise so the surface retains tonal life at deep mips.
      paintNoise(ctx, rng, size, "transparent", 36, 0.005);
    },
  });

  // Granite-cliff depth map — raised lichen patches as bright bumps,
  // bedding cracks and vertical fractures as dark recesses, so the
  // rock reads with bedded relief at glancing sun.
  registry["granite-cliff-bump"] = makeCanvasTexture({
    seed: 0x9ee2a17e + 1,
    draw: (ctx, rng, size) => {
      // Mid-grey base — average granite face height.
      ctx.fillStyle = "#7a7a7a";
      ctx.fillRect(0, 0, size, size);
      // Blocky face mounds — soft irregular bright patches reading as
      // the slightly raised faces of the bedding blocks.
      for (let i = 0; i < 24; i++) {
        const cx = rng() * size;
        const cy = rng() * size;
        const r = size * (0.05 + rng() * 0.07);
        const blob = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        blob.addColorStop(0, `rgba(${200 + Math.floor(rng() * 40)},${200 + Math.floor(rng() * 40)},${200 + Math.floor(rng() * 40)},0.55)`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lichen mounds — slightly raised brighter blobs suggesting
      // moss-and-lichen rosettes sitting proud of the rock face.
      for (let i = 0; i < 18; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 8 + rng() * 22;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(245,245,245,0.55)");
        grad.addColorStop(0.5, "rgba(180,180,180,0.4)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bedding cracks — dark horizontal lines recessing into the face.
      for (let i = 0; i < 8; i++) {
        const y = (i / 8) * size + (rng() - 0.5) * (size * 0.06);
        ctx.strokeStyle = "rgba(20,20,20,0.85)";
        ctx.lineWidth = 1.8 + rng() * 2.4;
        ctx.beginPath();
        const segs = 6 + Math.floor(rng() * 5);
        ctx.moveTo(0, y);
        for (let s = 0; s < segs; s++) {
          const x = ((s + 1) / segs) * size;
          const yy = y + (rng() - 0.5) * (size * 0.04);
          ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // Vertical fractures — dark slim lines recessed into the face.
      for (let i = 0; i < 14; i++) {
        const x = rng() * size;
        ctx.strokeStyle = "rgba(20,20,20,0.7)";
        ctx.lineWidth = 0.9 + rng() * 1.4;
        ctx.beginPath();
        const segs = 4 + Math.floor(rng() * 3);
        ctx.moveTo(x, 0);
        for (let s = 0; s < segs; s++) {
          const y = ((s + 1) / segs) * size;
          const xx = x + (rng() - 0.5) * (size * 0.08);
          ctx.lineTo(xx, y);
        }
        ctx.stroke();
      }
      // Bright mineral fleck bumps — small bright dots reading as
      // raised quartz inclusions in the granite.
      for (let i = 0; i < 400; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const v = 200 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 1.2 + rng(), 1.2 + rng());
      }
      // High-frequency speckle so the surface keeps tonal life at deep
      // mip levels.
      for (let i = 0; i < 1200; i++) {
        const v = 80 + Math.floor(rng() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * size, rng() * size, 1, 1);
      }
    },
  });
}
