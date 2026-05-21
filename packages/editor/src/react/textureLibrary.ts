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
}
