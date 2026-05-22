import {
  DOLLHOUSE_SCHEMA_VERSION,
  type DollhouseDocument,
  type GeometryDef,
  type MaterialDef,
  type SceneNode,
  type Transform,
} from "@dollhouse/shared";
import { mulberry32, NodeFactory } from "./builder.js";
import {
  buildFloorWithHoles,
  buildLowPolyTree,
  buildWallWithDoors,
} from "./geometryHelpers.js";

/**
 * World layout (X right, Y up, Z toward camera):
 *   width 7 (X: -3.5..3.5), depth 5 (Z: -2.5..2.5), floor height 2.7.
 * The front wall now exists (at z = +D/2) with a single arched door.
 * Each interior divider has an arched doorway near the front so every room is
 * reachable; mid + top floors have a rectangular hole at the stair landing.
 *
 * This module is a snapshot of packages/editor/src/presets/dollhouse.ts with
 * incrementally enhanced meshes — see {@link buildDollhouseDocument}.
 */
const W = 7;
const D = 5;
const FLOOR_H = 2.7;
const WALL_T = 0.14;
const BACK_Z = -D / 2;
const FRONT_Z = D / 2;

/** Two interior dividers per floor, partitioning into 3 rooms left → right. */
const DIVIDER_X = [-1.0, 1.2] as const;
/** Stair footprint — the floor hole above it sits at the same X/Z. */
const STAIR_X = 2.6;
const STAIR_WIDTH = 0.9;
const STAIR_DEPTH_FRONT = 1.7;
const STAIR_DEPTH_BACK = -0.6;
const STAIR_HOLE_X = STAIR_X;
const STAIR_HOLE_Z = (STAIR_DEPTH_FRONT + STAIR_DEPTH_BACK) / 2;

/** Roof pitch height — shared by the roof builder and the chimney / ridge. */
const ROOF_H = 2.2;
const ROOF_TOP = FLOOR_H * 3;

/** Courtyard prop anchor points — shared so tree placement can avoid them. */
const BENCH_POS: [number, number, number] = [-4.5, 0, 5.7];
const BIRD_BATH_POS: [number, number, number] = [4.2, 0, 6.8];
const LAMP_POST_POS: [number, number, number] = [1.3, 0, 4.6];

/** Second-pass courtyard props — an ornamental pond, a rose arch and a barrow. */
const POND_POS: [number, number, number] = [-3.9, 0, 10.6];
const POND_RADIUS = 1.35;
const ROSE_ARCH_Z = FRONT_Z + 5.0;
const WHEELBARROW_POS: [number, number, number] = [-3.55, 0, 3.45];

const C = {
  exteriorPink: "#f1aac4",
  wallPinkLight: "#f7c6d9",
  wallPinkInterior: "#fde0ec",
  trim: "#e89bb5",
  roofRose: "#e07ba0",
  roofShingle: "#c95f88",
  walnut: "#5a3a26",
  floorWalnut: "#7a5238",
  floorTileLight: "#fbe4ec",
  floorTileDark: "#d98ab1",
  white: "#fafafa",
  cream: "#fff5ec",
  glass: "#bcd9e8",
  wallpaperTeal: "#3f7780",
  accentMint: "#9ed6c9",
  accentLavender: "#c3aee0",
  bedSpread: "#f6c3d0",
  grass: "#7ea860",
  grassDark: "#5b8543",
  stone: "#9a8d80",
  bark: "#5a3a26",
  foliage: "#3d6e3a",
  fence: "#caa97a",
  doorWood: "#7a4a2e",
  // Enhancement palette — courtyard plantings and house detailing.
  soil: "#4a3526",
  hedge: "#4f7a3f",
  flowerRed: "#e8536d",
  flowerYellow: "#f4c542",
  flowerPurple: "#b07cc6",
  flowerWhite: "#fdf6f0",
  brick: "#b05a47",
  brickDark: "#8f4436",
  lampMetal: "#2e2a2a",
  lampGlow: "#ffe9a8",
  // Second enhancement pass — pond, rose arch, weather vane and corner quoins.
  pondWater: "#6fb1c9",
  lilyPad: "#5b8543",
  rosePink: "#ef89a8",
  ironGrey: "#3a3636",
  quoinCream: "#fff1e4",
} as const;

const std = (color: string, roughness = 0.7, extra: Partial<MaterialDef> = {}): MaterialDef => ({
  color,
  roughness,
  ...extra,
});
const box = (width: number, height: number, depth: number): GeometryDef => ({
  type: "box",
  width,
  height,
  depth,
});
const plane = (width: number, height: number): GeometryDef => ({ type: "plane", width, height });
const cylinder = (
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 10,
): GeometryDef => ({ type: "cylinder", radiusTop, radiusBottom, height, radialSegments });
const cone = (radius: number, height: number, radialSegments = 8): GeometryDef => ({
  type: "cone",
  radius,
  height,
  radialSegments,
});
const sphere = (radius: number, widthSegments = 12, heightSegments = 8): GeometryDef => ({
  type: "sphere",
  radius,
  widthSegments,
  heightSegments,
});

/* ───────────────────────── garden ───────────────────────── */

function buildLawn(f: NodeFactory): SceneNode {
  return f.mesh(
    "Lawn",
    plane(50, 50),
    std(C.grass, 0.95, { texture: "grass", textureScale: [10, 10] }),
    { position: [0, -0.01, 8], rotation: [-Math.PI / 2, 0, 0] },
    { receiveShadow: true },
  );
}

function buildCobblePath(f: NodeFactory): SceneNode {
  // A 1.5-wide path of irregularly stamped stones from the front door (z = D/2)
  // out to the front of the yard. Stones are instanced for cheap rendering.
  const rng = mulberry32(0xc0bb1e);
  const instances: Transform[] = [];
  const startZ = FRONT_Z + 0.8;
  const endZ = FRONT_Z + 11;
  const step = 0.55;
  for (let z = startZ; z <= endZ; z += step) {
    // Roughly two stones per row across the path width.
    for (let i = 0; i < 3; i++) {
      const tx = (i - 1) * 0.55 + (rng() - 0.5) * 0.18;
      const tz = z + (rng() - 0.5) * 0.18;
      const ty = 0.015 + rng() * 0.01;
      const ry = rng() * Math.PI;
      const sx = 0.4 + rng() * 0.15;
      const sz = 0.4 + rng() * 0.15;
      const sy = 0.06 + rng() * 0.03;
      instances.push({
        position: [tx, ty, tz],
        rotation: [0, ry, 0],
        scale: [sx, sy, sz],
      });
    }
  }
  return f.instanced(
    "Path Stones",
    box(1, 1, 1),
    std(C.stone, 0.9, { texture: "cobblestone", flatShading: true }),
    instances,
    { castShadow: false, receiveShadow: true },
  );
}

/** Keep-out circle on the XZ plane — trees are not placed inside one. */
interface KeepOut {
  x: number;
  z: number;
  r: number;
}

function buildTrees(f: NodeFactory, keepOut: KeepOut[] = []): SceneNode {
  const { trunk, foliage } = buildLowPolyTree(C.bark, C.foliage);
  const rng = mulberry32(0xf01ea6e);

  // Sample positions in the yard, avoiding the house footprint, the path and
  // the courtyard props (bench, bird bath, lamp post).
  const trees: SceneNode[] = [];
  let attempts = 0;
  while (trees.length < 18 && attempts < 400) {
    attempts++;
    const x = (rng() - 0.5) * 22;
    const z = -8 + rng() * 22; // roughly the yard range
    // Avoid house footprint (with a margin).
    if (Math.abs(x) < W / 2 + 0.8 && z < FRONT_Z + 0.5 && z > BACK_Z - 0.6) continue;
    // Avoid path corridor (X close to 0, Z between front and far yard).
    if (Math.abs(x) < 1.4 && z > FRONT_Z + 0.5 && z < FRONT_Z + 11.5) continue;
    // Avoid the courtyard furnishings so props are never buried in foliage.
    if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    const scale = 0.85 + rng() * 0.5;
    trees.push(
      f.group(
        `Tree ${trees.length + 1}`,
        [
          f.mesh(
            "Trunk",
            trunk,
            std(C.bark, 0.95, { texture: "bark", flatShading: true }),
            {},
            { castShadow: true, receiveShadow: true },
          ),
          f.mesh(
            "Foliage",
            foliage,
            std(C.foliage, 0.85, { flatShading: true }),
            {},
            { castShadow: true, receiveShadow: true },
          ),
        ],
        { position: [x, 0, z], scale: [scale, scale, scale] },
      ),
    );
  }
  return f.group("Trees", trees);
}

function buildFence(f: NodeFactory): SceneNode {
  // Rectangular fence around the yard. Two layouts: short posts (instanced)
  // and continuous top + bottom rails along each side.
  const xMin = -12;
  const xMax = 12;
  const zMin = -9;
  const zMax = 14;
  const postSpacing = 1.2;
  const postHeight = 1.1;
  const posts: Transform[] = [];
  const pushPostsAlongX = (z: number) => {
    for (let x = xMin; x <= xMax + 1e-3; x += postSpacing) {
      posts.push({ position: [x, postHeight / 2, z], rotation: [0, 0, 0], scale: [1, 1, 1] });
    }
  };
  const pushPostsAlongZ = (x: number) => {
    for (let z = zMin; z <= zMax + 1e-3; z += postSpacing) {
      posts.push({ position: [x, postHeight / 2, z], rotation: [0, 0, 0], scale: [1, 1, 1] });
    }
  };
  pushPostsAlongX(zMin);
  pushPostsAlongX(zMax);
  pushPostsAlongZ(xMin);
  pushPostsAlongZ(xMax);

  // Rails: long thin boxes — keep these as a few static meshes, not instanced.
  const rail = (
    name: string,
    width: number,
    depth: number,
    pos: [number, number, number],
  ): SceneNode =>
    f.mesh(
      name,
      box(width, 0.06, depth),
      std(C.fence, 0.8, { texture: "bark", flatShading: true }),
      { position: pos },
      { castShadow: true, receiveShadow: true },
    );
  const xSpan = xMax - xMin;
  const zSpan = zMax - zMin;
  const xMid = (xMax + xMin) / 2;
  const zMid = (zMax + zMin) / 2;

  // Skip a gap at the front center for the path.
  const gapHalf = 1.1;
  const segLeftZ = (zMax + (xMid - gapHalf - xMin)) / 2;
  void segLeftZ;

  return f.group("Fence", [
    f.instanced(
      "Fence Posts",
      box(0.1, postHeight, 0.1),
      std(C.fence, 0.8, { texture: "bark", flatShading: true }),
      posts,
      { castShadow: true, receiveShadow: true },
    ),
    // Front rail in two segments (split by the path opening).
    rail("Front Rail Top L", (xMid - gapHalf) - xMin, 0.05, [
      (xMin + xMid - gapHalf) / 2,
      0.95,
      zMax,
    ]),
    rail("Front Rail Top R", xMax - (xMid + gapHalf), 0.05, [
      (xMax + xMid + gapHalf) / 2,
      0.95,
      zMax,
    ]),
    rail("Front Rail Bot L", (xMid - gapHalf) - xMin, 0.05, [
      (xMin + xMid - gapHalf) / 2,
      0.35,
      zMax,
    ]),
    rail("Front Rail Bot R", xMax - (xMid + gapHalf), 0.05, [
      (xMax + xMid + gapHalf) / 2,
      0.35,
      zMax,
    ]),
    // Back rails (continuous).
    rail("Back Rail Top", xSpan, 0.05, [xMid, 0.95, zMin]),
    rail("Back Rail Bot", xSpan, 0.05, [xMid, 0.35, zMin]),
    // Side rails (continuous, rotated by depth).
    f.mesh(
      "Left Rail Top",
      box(0.05, 0.06, zSpan),
      std(C.fence, 0.8, { texture: "bark", flatShading: true }),
      { position: [xMin, 0.95, zMid] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh(
      "Left Rail Bot",
      box(0.05, 0.06, zSpan),
      std(C.fence, 0.8, { texture: "bark", flatShading: true }),
      { position: [xMin, 0.35, zMid] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh(
      "Right Rail Top",
      box(0.05, 0.06, zSpan),
      std(C.fence, 0.8, { texture: "bark", flatShading: true }),
      { position: [xMax, 0.95, zMid] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh(
      "Right Rail Bot",
      box(0.05, 0.06, zSpan),
      std(C.fence, 0.8, { texture: "bark", flatShading: true }),
      { position: [xMax, 0.35, zMid] },
      { castShadow: true, receiveShadow: true },
    ),
  ]);
}

/* ─────────────────── courtyard enhancements ─────────────────── */

/** A single stylised flower — green stem, flattened bloom, bright centre. */
function buildFlower(
  f: NodeFactory,
  pos: [number, number, number],
  bloomColor: string,
  scale = 1,
): SceneNode {
  return f.group(
    "Flower",
    [
      f.mesh(
        "Stem",
        cylinder(0.015, 0.022, 0.26, 5),
        std(C.foliage, 0.8, { flatShading: true }),
        { position: [0, 0.13, 0] },
        { castShadow: true },
      ),
      f.mesh(
        "Bloom",
        sphere(0.07, 8, 6),
        std(bloomColor, 0.6, { flatShading: true }),
        { position: [0, 0.28, 0], scale: [1, 0.7, 1] },
        { castShadow: true },
      ),
      f.mesh(
        "Bloom Centre",
        sphere(0.032, 6, 5),
        std(C.flowerYellow, 0.5),
        { position: [0, 0.3, 0] },
      ),
    ],
    { position: pos, scale: [scale, scale, scale] },
  );
}

/** Two raised flower beds flanking the front porch, each densely planted. */
function buildFlowerBeds(f: NodeFactory): SceneNode {
  const rng = mulberry32(0xb3df10a);
  const palette = [C.flowerRed, C.flowerYellow, C.flowerPurple, C.flowerWhite];
  const bedZ = FRONT_Z + 0.4;
  const bedW = 1.7;
  const bedD = 0.55;
  const beds: SceneNode[] = [];
  for (const cx of [-2.45, 2.45]) {
    const parts: SceneNode[] = [
      f.mesh(
        "Border",
        box(bedW + 0.12, 0.2, bedD + 0.12),
        std(C.fence, 0.85, { texture: "bark", flatShading: true }),
        { position: [0, 0.1, 0] },
        { castShadow: true, receiveShadow: true },
      ),
      f.mesh(
        "Soil",
        box(bedW, 0.22, bedD),
        std(C.soil, 0.95, { flatShading: true }),
        { position: [0, 0.13, 0] },
        { receiveShadow: true },
      ),
    ];
    for (let i = 0; i < 7; i++) {
      const fx = (rng() - 0.5) * (bedW - 0.3);
      const fz = (rng() - 0.5) * (bedD - 0.18);
      const color = palette[Math.floor(rng() * palette.length)] ?? C.flowerRed;
      parts.push(buildFlower(f, [fx, 0.22, fz], color, 0.8 + rng() * 0.5));
    }
    beds.push(
      f.group(`Flower Bed ${cx < 0 ? "Left" : "Right"}`, parts, { position: [cx, 0, bedZ] }),
    );
  }
  return f.group("Flower Beds", beds);
}

/** Low rounded shrubs lining both sides of the cobble path. */
function buildHedges(f: NodeFactory): SceneNode {
  const rng = mulberry32(0x4edc3a);
  const instances: Transform[] = [];
  for (const side of [-1, 1] as const) {
    for (let z = FRONT_Z + 1.6; z <= FRONT_Z + 10.5; z += 1.0) {
      const s = 0.5 + rng() * 0.16;
      instances.push({
        position: [side * 1.18 + (rng() - 0.5) * 0.1, s * 0.42, z + (rng() - 0.5) * 0.16],
        rotation: [0, rng() * Math.PI, 0],
        scale: [s, s * 0.85, s],
      });
    }
  }
  return f.instanced(
    "Hedge Shrubs",
    sphere(1, 10, 7),
    std(C.hedge, 0.9, { flatShading: true }),
    instances,
    { castShadow: true, receiveShadow: true },
  );
}

/** A slatted wooden garden bench. Built facing +Z, then rotated into place. */
function buildGardenBench(
  f: NodeFactory,
  pos: [number, number, number],
  rotationY: number,
): SceneNode {
  const wood = std(C.walnut, 0.6, { texture: "wood" });
  const seatW = 1.5;
  const leg = (lx: number, lz: number): SceneNode =>
    f.mesh("Leg", box(0.09, 0.42, 0.09), wood, { position: [lx, 0.21, lz] }, {
      castShadow: true,
      receiveShadow: true,
    });
  const seatSlat = (sz: number): SceneNode =>
    f.mesh("Seat Slat", box(seatW, 0.05, 0.13), wood, { position: [0, 0.45, sz] }, {
      castShadow: true,
      receiveShadow: true,
    });
  const backSlat = (sy: number): SceneNode =>
    f.mesh("Back Slat", box(seatW, 0.11, 0.05), wood, { position: [0, sy, -0.23] }, {
      castShadow: true,
    });
  return f.group(
    "Garden Bench",
    [
      leg(-0.62, 0.2),
      leg(0.62, 0.2),
      leg(-0.62, -0.2),
      leg(0.62, -0.2),
      seatSlat(-0.16),
      seatSlat(0),
      seatSlat(0.16),
      backSlat(0.6),
      backSlat(0.76),
      backSlat(0.92),
      f.mesh("Backrest Post L", box(0.08, 0.55, 0.08), wood, { position: [-0.62, 0.7, -0.23] }, {
        castShadow: true,
      }),
      f.mesh("Backrest Post R", box(0.08, 0.55, 0.08), wood, { position: [0.62, 0.7, -0.23] }, {
        castShadow: true,
      }),
      f.mesh("Armrest L", box(0.09, 0.06, 0.5), wood, { position: [-0.66, 0.63, 0] }, {
        castShadow: true,
      }),
      f.mesh("Armrest R", box(0.09, 0.06, 0.5), wood, { position: [0.66, 0.63, 0] }, {
        castShadow: true,
      }),
    ],
    { position: pos, rotation: [0, rotationY, 0] },
  );
}

/** A stone bird bath — pedestal plus a shallow water-filled basin. */
function buildBirdBath(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stoneMat = std(C.stone, 0.9, { texture: "cobblestone", flatShading: true });
  return f.group(
    "Bird Bath",
    [
      f.mesh("Base", cylinder(0.34, 0.42, 0.18, 12), stoneMat, { position: [0, 0.09, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh("Pillar", cylinder(0.13, 0.17, 0.8, 10), stoneMat, { position: [0, 0.58, 0] }, {
        castShadow: true,
      }),
      f.mesh("Basin", cylinder(0.6, 0.32, 0.2, 16), stoneMat, { position: [0, 1.06, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh(
        "Water",
        cylinder(0.5, 0.5, 0.05, 16),
        { color: C.glass, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.7 },
        { position: [0, 1.14, 0] },
      ),
    ],
    { position: pos },
  );
}

/** A wrought-iron lamp post with a softly glowing lantern. */
function buildLampPost(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const metal = std(C.lampMetal, 0.45, { metalness: 0.55 });
  return f.group(
    "Lamp Post",
    [
      f.mesh("Base", cylinder(0.1, 0.2, 0.26, 10), metal, { position: [0, 0.13, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh("Pole", cylinder(0.045, 0.07, 2.3, 8), metal, { position: [0, 1.4, 0] }, {
        castShadow: true,
      }),
      f.mesh("Lantern Mount", box(0.16, 0.12, 0.16), metal, { position: [0, 2.55, 0] }, {
        castShadow: true,
      }),
      f.mesh(
        "Lantern Glass",
        box(0.26, 0.38, 0.26),
        { color: C.lampGlow, roughness: 0.25, emissive: C.lampGlow, transparent: true, opacity: 0.9 },
        { position: [0, 2.82, 0] },
      ),
      f.mesh("Lantern Cap", cone(0.24, 0.26, 8), metal, { position: [0, 3.14, 0] }, {
        castShadow: true,
      }),
      f.mesh("Finial", sphere(0.05, 8, 6), metal, { position: [0, 3.31, 0] }, { castShadow: true }),
    ],
    { position: pos },
  );
}

/** A white picket garden gate set into the fence opening on the path. */
function buildGardenGate(f: NodeFactory): SceneNode {
  const z = 14;
  const paint = std(C.white, 0.7);
  const gatePanel = (hingeX: number, dir: 1 | -1, swing: number): SceneNode => {
    const slats: SceneNode[] = [];
    for (let i = 0; i < 4; i++) {
      slats.push(
        f.mesh("Picket", box(0.16, 0.78, 0.04), paint, {
          position: [dir * (0.14 + i * 0.22), 0.05, 0],
        }, { castShadow: true }),
      );
    }
    slats.push(
      f.mesh("Rail Top", box(0.9, 0.1, 0.05), paint, { position: [dir * 0.45, 0.28, 0] }, {
        castShadow: true,
      }),
    );
    slats.push(
      f.mesh("Rail Bot", box(0.9, 0.1, 0.05), paint, { position: [dir * 0.45, -0.24, 0] }, {
        castShadow: true,
      }),
    );
    return f.group("Gate Panel", slats, { position: [hingeX, 0.62, z], rotation: [0, swing, 0] });
  };
  return f.group("Garden Gate", [
    f.mesh("Gate Post L", box(0.16, 1.5, 0.16), paint, { position: [-1.12, 0.75, z] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Gate Post R", box(0.16, 1.5, 0.16), paint, { position: [1.12, 0.75, z] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Post Cap L", sphere(0.12, 10, 8), paint, { position: [-1.12, 1.56, z] }, {
      castShadow: true,
    }),
    f.mesh("Post Cap R", sphere(0.12, 10, 8), paint, { position: [1.12, 1.56, z] }, {
      castShadow: true,
    }),
    gatePanel(-1.04, 1, -0.5),
    gatePanel(1.04, -1, 0.5),
  ]);
}

/**
 * An ornamental garden pond — a shallow sunken basin of water ringed by a low
 * kerb of irregular cobbles, dotted with lily pads and a clump of cattail reeds.
 */
function buildPond(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const r = POND_RADIUS;
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const parts: SceneNode[] = [
    // Sunken basin liner — gives the water a dark bottom to sit against.
    f.mesh(
      "Basin",
      cylinder(r, r * 0.8, 0.3, 20),
      std(C.soil, 0.95, { flatShading: true }),
      { position: [0, 0.05, 0] },
      { receiveShadow: true },
    ),
    // Water surface, inset just under the kerb.
    f.mesh(
      "Water",
      cylinder(r - 0.12, r - 0.12, 0.12, 20),
      { color: C.pondWater, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.82 },
      { position: [0, 0.14, 0] },
      { receiveShadow: true },
    ),
  ];
  // Stone kerb — a ring of irregularly stamped cobbles around the rim.
  const rng = mulberry32(0x90d51fe);
  const kerb: Transform[] = [];
  const kerbCount = 24;
  for (let i = 0; i < kerbCount; i++) {
    const a = (i / kerbCount) * Math.PI * 2;
    const rr = r + 0.05 + (rng() - 0.5) * 0.06;
    kerb.push({
      position: [Math.cos(a) * rr, 0.12 + rng() * 0.05, Math.sin(a) * rr],
      rotation: [0, rng() * Math.PI, 0],
      scale: [0.27 + rng() * 0.13, 0.22 + rng() * 0.1, 0.27 + rng() * 0.13],
    });
  }
  parts.push(
    f.instanced("Pond Kerb", box(1, 1, 1), stone, kerb, {
      castShadow: true,
      receiveShadow: true,
    }),
  );
  // Lily pads floating on the surface.
  const padSpots: [number, number][] = [
    [-0.42, 0.22],
    [0.5, -0.32],
    [0.12, 0.62],
    [-0.58, -0.46],
  ];
  padSpots.forEach(([px, pz], i) => {
    parts.push(
      f.mesh(
        `Lily Pad ${i + 1}`,
        cylinder(0.22, 0.22, 0.03, 12),
        std(C.lilyPad, 0.7, { flatShading: true }),
        { position: [px, 0.2, pz], scale: [1, 1, 0.82] },
        { receiveShadow: true },
      ),
    );
  });
  // A clump of cattail reeds rising from one edge of the pond.
  const reeds: SceneNode[] = [];
  for (let i = 0; i < 6; i++) {
    const rx = (rng() - 0.5) * 0.34;
    const rz = (rng() - 0.5) * 0.34;
    const h = 0.6 + rng() * 0.4;
    reeds.push(
      f.mesh(
        "Reed",
        cylinder(0.018, 0.026, h, 5),
        std(C.hedge, 0.8, { flatShading: true }),
        { position: [rx, h / 2, rz] },
        { castShadow: true },
      ),
    );
    reeds.push(
      f.mesh(
        "Cattail",
        cylinder(0.042, 0.042, 0.16, 6),
        std(C.bark, 0.85),
        { position: [rx, h, rz] },
        { castShadow: true },
      ),
    );
  }
  parts.push(f.group("Reeds", reeds, { position: [r * 0.46, 0.16, r * 0.5] }));
  return f.group("Garden Pond", parts, { position: pos });
}

/**
 * A rose-covered trellis arch straddling the cobble path — two uprights joined
 * by a semicircular crown, with climbing rose blooms instanced along the frame.
 */
function buildRoseArch(f: NodeFactory, z: number): SceneNode {
  const wood = std(C.fence, 0.82, { texture: "bark", flatShading: true });
  const postX = 1.05;
  const postH = 2.3;
  const archR = postX;
  const archY = postH;
  const parts: SceneNode[] = [];
  for (const side of [-1, 1] as const) {
    parts.push(
      f.mesh(
        "Arch Post",
        box(0.1, postH, 0.1),
        wood,
        { position: [side * postX, postH / 2, 0] },
        { castShadow: true, receiveShadow: true },
      ),
    );
  }
  // Curved crown — short box ribs stepped around a semicircle in the XY plane.
  const segs = 9;
  const segLen = (Math.PI * archR) / segs;
  for (let i = 0; i < segs; i++) {
    const th = (Math.PI * (i + 0.5)) / segs;
    parts.push(
      f.mesh(
        "Arch Rib",
        box(segLen + 0.05, 0.1, 0.12),
        wood,
        {
          position: [Math.cos(th) * archR, archY + Math.sin(th) * archR, 0],
          rotation: [0, 0, Math.atan2(Math.cos(th), -Math.sin(th))],
        },
        { castShadow: true },
      ),
    );
  }
  // Climbing roses — instanced blooms scattered up the posts and over the crown.
  const rng = mulberry32(0x205ea4c);
  const roses: Transform[] = [];
  for (const side of [-1, 1] as const) {
    for (let h = 0.3; h < postH; h += 0.27) {
      roses.push({
        position: [
          side * postX + (rng() - 0.5) * 0.22,
          h + (rng() - 0.5) * 0.12,
          (rng() - 0.5) * 0.22,
        ],
        rotation: [0, rng() * Math.PI, 0],
        scale: [0.7 + rng() * 0.6, 0.7 + rng() * 0.6, 0.7 + rng() * 0.6],
      });
    }
  }
  for (let i = 0; i < segs * 2; i++) {
    const th = (Math.PI * (i + 0.5)) / (segs * 2);
    roses.push({
      position: [
        Math.cos(th) * archR + (rng() - 0.5) * 0.2,
        archY + Math.sin(th) * archR + (rng() - 0.5) * 0.14,
        (rng() - 0.5) * 0.22,
      ],
      rotation: [0, rng() * Math.PI, 0],
      scale: [0.7 + rng() * 0.5, 0.7 + rng() * 0.5, 0.7 + rng() * 0.5],
    });
  }
  parts.push(
    f.instanced(
      "Climbing Roses",
      sphere(0.09, 7, 6),
      std(C.rosePink, 0.6, { flatShading: true }),
      roses,
      { castShadow: true },
    ),
  );
  return f.group("Rose Arch", parts, { position: [0, 0, z] });
}

/**
 * A wooden garden wheelbarrow heaped with soil — a four-walled tray on a single
 * front wheel with two handles and rear legs. Built facing +Z, then rotated.
 */
function buildWheelbarrow(
  f: NodeFactory,
  pos: [number, number, number],
  rotationY: number,
): SceneNode {
  const wood = std(C.walnut, 0.6, { texture: "wood" });
  const metal = std(C.ironGrey, 0.5, { metalness: 0.5 });
  const parts: SceneNode[] = [
    f.mesh("Tray Floor", box(0.6, 0.05, 0.8), wood, { position: [0, 0.34, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Tray Side L", box(0.05, 0.26, 0.8), wood, { position: [-0.3, 0.46, 0] }, {
      castShadow: true,
    }),
    f.mesh("Tray Side R", box(0.05, 0.26, 0.8), wood, { position: [0.3, 0.46, 0] }, {
      castShadow: true,
    }),
    f.mesh("Tray Back", box(0.6, 0.26, 0.05), wood, { position: [0, 0.46, -0.4] }, {
      castShadow: true,
    }),
    f.mesh("Tray Front", box(0.6, 0.18, 0.05), wood, { position: [0, 0.42, 0.4] }, {
      castShadow: true,
    }),
    f.mesh(
      "Soil Heap",
      sphere(0.26, 10, 7),
      std(C.soil, 0.95, { flatShading: true }),
      { position: [0, 0.44, -0.05], scale: [1, 0.55, 1.3] },
      { castShadow: true },
    ),
    f.mesh("Handle L", box(0.05, 0.05, 1.1), wood, { position: [-0.27, 0.36, -0.2] }, {
      castShadow: true,
    }),
    f.mesh("Handle R", box(0.05, 0.05, 1.1), wood, { position: [0.27, 0.36, -0.2] }, {
      castShadow: true,
    }),
    f.mesh("Leg L", box(0.05, 0.3, 0.05), wood, { position: [-0.27, 0.15, -0.62] }, {
      castShadow: true,
    }),
    f.mesh("Leg R", box(0.05, 0.3, 0.05), wood, { position: [0.27, 0.15, -0.62] }, {
      castShadow: true,
    }),
    f.group(
      "Wheel",
      [
        f.mesh(
          "Tyre",
          cylinder(0.22, 0.22, 0.1, 14),
          std(C.ironGrey, 0.7, { flatShading: true }),
          { rotation: [0, 0, Math.PI / 2] },
          { castShadow: true },
        ),
        f.mesh(
          "Hub",
          cylinder(0.07, 0.07, 0.12, 8),
          metal,
          { rotation: [0, 0, Math.PI / 2] },
          { castShadow: true },
        ),
      ],
      { position: [0, 0.22, 0.62] },
    ),
    f.mesh("Fork", box(0.05, 0.34, 0.05), metal, { position: [0, 0.3, 0.55] }, {
      castShadow: true,
    }),
  ];
  return f.group("Wheelbarrow", parts, { position: pos, rotation: [0, rotationY, 0] });
}

/* ───────────────────────── exterior walls ───────────────────────── */

function buildBackWall(f: NodeFactory): SceneNode {
  const wallPinkTex = std(C.wallPinkInterior, 0.9, { texture: "plaster-pink" });
  return f.group("Back Wall", [
    f.mesh(
      "Back Panel",
      box(W, FLOOR_H * 3, WALL_T),
      wallPinkTex,
      { position: [0, FLOOR_H * 1.5, BACK_Z] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh(
      "Back Trim",
      box(W + 0.2, 0.12, WALL_T),
      std(C.trim),
      { position: [0, FLOOR_H * 3 - 0.05, BACK_Z - WALL_T / 2 - 0.005] },
      { castShadow: true },
    ),
    buildPicture(f, -2.4, 1.3, 0.7, 0.5, C.accentLavender),
    buildPicture(f, -1.5, 1.4, 0.5, 0.4, C.accentMint),
    buildPicture(f, -2.4, 3.8 + 1.0, 0.9, 0.6, C.wallpaperTeal),
    buildWindow(f, 2.3, 1.3),
    buildWindow(f, 2.3, 1.3 + FLOOR_H),
    buildWindow(f, 2.3, 1.3 + FLOOR_H * 2),
  ]);
}

function buildPicture(
  f: NodeFactory,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): SceneNode {
  const z = BACK_Z + WALL_T / 2 + 0.003;
  return f.group(
    "Picture",
    [
      f.mesh("Frame", box(w + 0.06, h + 0.06, 0.02), std(C.walnut, 0.5, { texture: "wood" }), {}, {
        castShadow: true,
      }),
      f.mesh("Art", plane(w, h), std(color), { position: [0, 0, 0.015] }),
    ],
    { position: [x, y, z] },
  );
}

function buildWindow(f: NodeFactory, x: number, y: number): SceneNode {
  const z = BACK_Z + WALL_T / 2 + 0.003;
  return f.group(
    "Window",
    [
      f.mesh("Frame", box(0.8, 0.9, 0.03), std(C.white), {}, { castShadow: true }),
      f.mesh(
        "Glass",
        plane(0.66, 0.76),
        { color: C.glass, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 },
        { position: [0, 0, 0.02] },
      ),
      f.mesh("Mullion V", box(0.04, 0.78, 0.005), std(C.white), { position: [0, 0, 0.025] }),
      f.mesh("Mullion H", box(0.68, 0.04, 0.005), std(C.white), { position: [0, 0, 0.025] }),
    ],
    { position: [x, y, z] },
  );
}

/**
 * Window dressing for the three stacked back-wall windows — a pair of mint
 * shutters and a wooden flower box with three small blooms per window.
 */
function buildWindowDressing(f: NodeFactory): SceneNode {
  const zFront = BACK_Z + WALL_T / 2;
  const shutterMat = std(C.accentMint, 0.7);
  const boxMat = std(C.walnut, 0.6, { texture: "wood" });
  const palette = [C.flowerRed, C.flowerYellow, C.flowerPurple, C.flowerWhite];
  const wx = 2.3;
  const groups: SceneNode[] = [];
  for (let floor = 0; floor < 3; floor++) {
    const wy = 1.3 + floor * FLOOR_H;
    const parts: SceneNode[] = [
      f.mesh("Shutter L", box(0.16, 0.92, 0.04), shutterMat, {
        position: [wx - 0.5, wy, zFront + 0.02],
      }, { castShadow: true }),
      f.mesh("Shutter R", box(0.16, 0.92, 0.04), shutterMat, {
        position: [wx + 0.5, wy, zFront + 0.02],
      }, { castShadow: true }),
      f.mesh("Window Box", box(0.92, 0.2, 0.22), boxMat, {
        position: [wx, wy - 0.56, zFront + 0.12],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Window Box Soil", box(0.82, 0.07, 0.15), std(C.soil, 0.95), {
        position: [wx, wy - 0.45, zFront + 0.12],
      }),
    ];
    for (let i = 0; i < 3; i++) {
      parts.push(
        buildFlower(
          f,
          [wx - 0.28 + i * 0.28, wy - 0.43, zFront + 0.12],
          palette[(floor + i) % palette.length] ?? C.flowerRed,
          0.62,
        ),
      );
    }
    groups.push(f.group(`Window Dressing ${floor + 1}`, parts));
  }
  return f.group("Window Dressing", groups);
}

function buildFrontWall(f: NodeFactory): SceneNode {
  // Solid pink wall with a single arched door on the ground floor at x=0.
  // The wall lies in the XY plane (the doorway shape is authored in XY) and
  // is positioned at z = FRONT_Z, extruded along Z by WALL_T.
  const wallGeometry = buildWallWithDoors(W, FLOOR_H * 3, WALL_T, [
    { x: 0, width: 1.4, height: 2.2, archRadius: 0.7 },
  ]);
  return f.group("Front Wall", [
    f.mesh(
      "Front Panel",
      wallGeometry,
      std(C.exteriorPink, 0.85, { texture: "plaster-pink" }),
      { position: [0, 0, FRONT_Z] },
      { castShadow: true, receiveShadow: true },
    ),
    // Decorative door frame trim around the arch.
    f.mesh(
      "Door Frame Top Trim",
      box(1.6, 0.08, 0.06),
      std(C.trim),
      { position: [0, 2.28, FRONT_Z + WALL_T / 2 + 0.005] },
      { castShadow: true },
    ),
    // A short door panel sits open behind the wall — purely visual.
    f.mesh(
      "Door Panel",
      box(0.65, 2.15, 0.05),
      std(C.doorWood, 0.7, { texture: "wood" }),
      { position: [-0.5, 1.08, FRONT_Z - WALL_T / 2 - 0.05], rotation: [0, -0.5, 0] },
      { castShadow: true, receiveShadow: true },
    ),
    // Brass doorknob on the open door panel.
    f.mesh(
      "Door Knob",
      sphere(0.05, 10, 8),
      std(C.flowerYellow, 0.3, { metalness: 0.7 }),
      { position: [-0.18, 1.08, FRONT_Z - WALL_T / 2 - 0.12] },
      { castShadow: true },
    ),
    // Front porch slab.
    f.mesh(
      "Front Porch",
      box(2.6, 0.12, 0.7),
      std(C.stone, 0.9, { texture: "cobblestone" }),
      { position: [0, 0.06, FRONT_Z + 0.4] },
      { receiveShadow: true },
    ),
  ]);
}

function buildSideWalls(f: NodeFactory): SceneNode {
  const wall = (name: string, x: number) =>
    f.mesh(
      name,
      box(WALL_T, FLOOR_H * 3, D),
      std(C.exteriorPink, 0.85, { texture: "plaster-pink" }),
      { position: [x, FLOOR_H * 1.5, 0] },
      { castShadow: true, receiveShadow: true },
    );
  return f.group("Side Walls", [wall("Left Wall", -W / 2), wall("Right Wall", W / 2)]);
}

/* ───────────────────────── floors ───────────────────────── */

function buildFloors(f: NodeFactory): SceneNode {
  const innerW = W - WALL_T * 2;
  const innerD = D - WALL_T * 2;
  // Ground floor — solid, no holes, pink tile.
  const ground = f.mesh(
    "Ground Floor",
    buildFloorWithHoles(innerW, innerD, 0.06, []),
    std(C.floorTileLight, 0.7, { texture: "tile-pink", textureScale: [6, 4] }),
    { position: [0, 0, 0] },
    { receiveShadow: true },
  );
  // Mid + top floors have a rectangular hole at the stair landing.
  const stairHole = [{
    x: STAIR_HOLE_X,
    z: STAIR_HOLE_Z,
    width: STAIR_WIDTH + 0.2,
    depth: Math.abs(STAIR_DEPTH_FRONT - STAIR_DEPTH_BACK) + 0.2,
  }];
  const mid = f.mesh(
    "Mid Floor",
    buildFloorWithHoles(innerW, innerD, 0.06, stairHole),
    std(C.floorWalnut, 0.7, { texture: "wood", textureScale: [6, 4] }),
    { position: [0, FLOOR_H, 0] },
    { receiveShadow: true, castShadow: true },
  );
  const top = f.mesh(
    "Top Floor",
    buildFloorWithHoles(innerW, innerD, 0.06, stairHole),
    std(C.wallPinkLight, 0.7, { texture: "tile-pink", textureScale: [6, 4] }),
    { position: [0, FLOOR_H * 2, 0] },
    { receiveShadow: true, castShadow: true },
  );
  return f.group("Floors", [ground, mid, top]);
}

/* ─────────────────── room dividers (interior walls with arches) ─────────────────── */

function buildInteriorWall(
  f: NodeFactory,
  name: string,
  x: number,
  floor: number,
  archZ: number,
): SceneNode {
  const wallH = FLOOR_H - 0.05;
  // Wall extends along Z; door cuts through. We author the wall in XY (width =
  // depth, height = wallH) then rotate so it sits in the YZ plane.
  const innerD = D - WALL_T * 2;
  const wallGeometry = buildWallWithDoors(innerD, wallH, WALL_T, [
    { x: archZ, width: 1.0, height: 2.05, archRadius: 0.5 },
  ]);
  return f.mesh(
    name,
    wallGeometry,
    std(C.wallPinkInterior, 0.9, { texture: "plaster-pink" }),
    {
      position: [x, floor * FLOOR_H, 0],
      // The extruded wall's "width" maps onto Z, its "height" onto Y, and the
      // extrusion (Z axis) becomes X — so a single rotateY of π/2 lines it up.
      rotation: [0, Math.PI / 2, 0],
    },
    { castShadow: true, receiveShadow: true },
  );
}

function buildRoomDividers(f: NodeFactory): SceneNode {
  // Doorway near the front so every room is reachable from the entry hallway.
  // The doorway X within the wall's local coords (its "width" axis) maps onto
  // world Z after the rotation.
  const archAtZ = D / 2 - 1.0;
  const levels: SceneNode[] = [];
  for (let floor = 0; floor < 3; floor++) {
    const parts: SceneNode[] = [];
    for (const x of DIVIDER_X) {
      parts.push(buildInteriorWall(f, `Divider x=${x}`, x, floor, archAtZ));
    }
    levels.push(f.group(`Level ${floor + 1} Dividers`, parts));
  }
  return f.group("Room Dividers", levels);
}

/* ───────────────────────── stairs ───────────────────────── */

function buildStairs(f: NodeFactory): SceneNode {
  const steps = 9;
  const stepH = FLOOR_H / steps;
  const zStart = STAIR_DEPTH_FRONT;
  const zEnd = STAIR_DEPTH_BACK;
  const stepD = Math.abs(zStart - zEnd) / steps;
  const flights: SceneNode[] = [];
  for (let floor = 0; floor < 2; floor++) {
    const baseY = floor * FLOOR_H;
    const parts: SceneNode[] = [];
    for (let i = 0; i < steps; i++) {
      parts.push(
        f.mesh(
          `Step ${i + 1}`,
          box(STAIR_WIDTH, stepH, stepD * 1.05),
          std(C.white, 0.7),
          {
            position: [STAIR_X, baseY + stepH * (i + 0.5), zStart - (i + 0.5) * stepD],
          },
          { castShadow: true, receiveShadow: true },
        ),
      );
    }
    parts.push(
      f.mesh(
        "Railing",
        box(0.04, 0.04, Math.abs(zStart - zEnd) * 1.05),
        std(C.white),
        {
          position: [STAIR_X - STAIR_WIDTH / 2 + 0.05, baseY + FLOOR_H / 2 + 0.5, (zStart + zEnd) / 2],
          rotation: [Math.atan2(FLOOR_H, Math.abs(zStart - zEnd)), 0, 0],
        },
        { castShadow: true },
      ),
    );
    flights.push(f.group(`Stair Flight ${floor + 1}`, parts));
  }
  return f.group("Stairs", flights);
}

/* ───────────────────────── roof ───────────────────────── */

function buildRoof(f: NodeFactory): SceneNode {
  const roofH = ROOF_H;
  const roofTop = ROOF_TOP;
  const slope = Math.atan2(roofH, W / 2 + 0.4);
  const hyp = Math.hypot(roofH, W / 2 + 0.4);
  const roofDepth = D + 0.6;

  const pitches: SceneNode[] = [];
  ([-1, 1] as const).forEach((side) => {
    const cols = 14;
    const rows = 8;
    const sw = (hyp / cols) * 1.1;
    const sd = (roofDepth / rows) * 1.05;
    const instances: Transform[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offset = r % 2 === 0 ? 0 : sw / 2;
        instances.push({
          position: [
            -hyp / 2 + sw / 2 + c * sw + offset,
            0.07,
            -roofDepth / 2 + sd / 2 + r * sd,
          ],
          rotation: [0, 0, 0],
          scale: [1, 0.4, 1],
        });
      }
    }
    pitches.push(
      f.group(
        side < 0 ? "Left Pitch" : "Right Pitch",
        [
          f.mesh(
            "Slab",
            box(hyp, 0.12, roofDepth),
            std(C.roofRose, 0.85),
            {},
            { castShadow: true, receiveShadow: true },
          ),
          f.instanced(
            "Shingles",
            {
              type: "sphere",
              radius: sw * 0.55,
              widthSegments: 10,
              heightSegments: 6,
              phiStart: 0,
              phiLength: Math.PI * 2,
              thetaStart: 0,
              thetaLength: Math.PI / 2,
            },
            std(C.roofShingle),
            instances,
            { castShadow: true, receiveShadow: true },
          ),
        ],
        { position: [side * (W / 4 + 0.1), roofH / 2, 0], rotation: [0, 0, -side * slope] },
      ),
    );
  });

  const gablePoly: GeometryDef = {
    type: "buffer",
    attributes: {
      position: [
        -(W / 2 + 0.3), -roofH / 2, 0,
        W / 2 + 0.3, -roofH / 2, 0,
        0, roofH / 2 + 0.05, 0,
      ],
      normal: [0, 0, -1, 0, 0, -1, 0, 0, -1],
    },
  };
  const backGable = f.mesh(
    "Back Gable",
    gablePoly,
    { color: C.exteriorPink, roughness: 0.7, side: "double", texture: "plaster-pink" },
    { position: [0, roofH / 2, BACK_Z - 0.02] },
    { castShadow: true },
  );
  const frontGable = f.mesh(
    "Front Gable",
    gablePoly,
    { color: C.exteriorPink, roughness: 0.7, side: "double", texture: "plaster-pink" },
    { position: [0, roofH / 2, FRONT_Z + 0.02], rotation: [0, Math.PI, 0] },
    { castShadow: true },
  );

  return f.group("Roof", [...pitches, backGable, frontGable], { position: [0, roofTop, 0] });
}

/**
 * A row of half-round ridge tiles capping the roof peak, finished with a
 * turned finial above the front gable.
 */
function buildRoofRidge(f: NodeFactory): SceneNode {
  const ridgeY = ROOF_TOP + ROOF_H;
  const roofDepth = D + 0.6;
  const tileMat = std(C.roofShingle, 0.85, { flatShading: true });
  const n = 11;
  const seg = roofDepth / n;
  const caps: SceneNode[] = [];
  for (let i = 0; i < n; i++) {
    const z = -roofDepth / 2 + seg * (i + 0.5);
    caps.push(
      f.mesh(
        "Ridge Cap",
        cylinder(0.14, 0.14, seg * 0.96, 7),
        tileMat,
        { position: [0, ridgeY + 0.02, z], rotation: [Math.PI / 2, 0, 0] },
        { castShadow: true, receiveShadow: true },
      ),
    );
  }
  const finial = f.group(
    "Roof Finial",
    [
      f.mesh("Finial Post", cylinder(0.035, 0.05, 0.5, 6), std(C.trim, 0.5, { metalness: 0.3 }), {
        position: [0, 0.25, 0],
      }, { castShadow: true }),
      f.mesh("Finial Orb", sphere(0.12, 12, 8), std(C.roofRose, 0.4, { metalness: 0.4 }), {
        position: [0, 0.58, 0],
      }, { castShadow: true }),
    ],
    { position: [0, ridgeY + 0.14, FRONT_Z + 0.15] },
  );
  return f.group("Roof Ridge", [f.group("Ridge Caps", caps), finial]);
}

/** A brick chimney rising from the left roof pitch, with two clay pots. */
function buildChimney(f: NodeFactory): SceneNode {
  const brick = std(C.brick, 0.95, { texture: "cobblestone", flatShading: true });
  const cx = -2.0;
  const cz = 0.7;
  const pot = (px: number): SceneNode =>
    f.mesh("Chimney Pot", cylinder(0.1, 0.12, 0.34, 10), std(C.brickDark, 0.9), {
      position: [cx + px, 11.32, cz],
    }, { castShadow: true });
  return f.group("Chimney", [
    f.mesh("Stack", box(0.62, 3.0, 0.62), brick, { position: [cx, 9.7, cz] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Crown", box(0.78, 0.18, 0.78), std(C.brickDark, 0.9, { flatShading: true }), {
      position: [cx, 11.15, cz],
    }, { castShadow: true }),
    pot(-0.16),
    pot(0.16),
  ]);
}

/**
 * A small pitched canopy sheltering the arched front door — two slabs meeting
 * at a ridge, carried on a pair of slender posts standing on the porch slab.
 */
function buildPorchCanopy(f: NodeFactory): SceneNode {
  const postMat = std(C.white, 0.7);
  const slabMat = std(C.roofRose, 0.85);
  const canopyW = 2.7;
  const canopyZ = FRONT_Z + 0.45;
  const ridgeY = 2.95;
  const halfDepth = 0.55;
  const rise = 0.28;
  const slope = Math.atan2(rise, halfDepth);
  const hyp = Math.hypot(rise, halfDepth);
  const postX = 1.18;
  const postZ = FRONT_Z + 0.65;
  const postTopY = ridgeY - rise - 0.05;
  const parts: SceneNode[] = [];
  for (const side of [-1, 1] as const) {
    parts.push(
      f.mesh(
        "Canopy Post",
        box(0.1, postTopY, 0.1),
        postMat,
        { position: [side * postX, postTopY / 2, postZ] },
        { castShadow: true, receiveShadow: true },
      ),
    );
    // Decorative knee bracket from the post up to the canopy eave.
    parts.push(
      f.mesh(
        "Canopy Bracket",
        box(0.06, 0.34, 0.34),
        std(C.trim),
        { position: [side * postX, postTopY - 0.06, postZ - 0.22], rotation: [Math.PI / 4, 0, 0] },
        { castShadow: true },
      ),
    );
  }
  parts.push(
    f.mesh(
      "Canopy Front Pitch",
      box(canopyW, 0.08, hyp),
      slabMat,
      { position: [0, ridgeY - rise / 2, canopyZ + halfDepth / 2], rotation: [slope, 0, 0] },
      { castShadow: true, receiveShadow: true },
    ),
  );
  parts.push(
    f.mesh(
      "Canopy Back Pitch",
      box(canopyW, 0.08, hyp),
      slabMat,
      { position: [0, ridgeY - rise / 2, canopyZ - halfDepth / 2], rotation: [-slope, 0, 0] },
      { castShadow: true, receiveShadow: true },
    ),
  );
  parts.push(
    f.mesh(
      "Canopy Ridge",
      cylinder(0.06, 0.06, canopyW, 8),
      std(C.roofShingle, 0.85, { flatShading: true }),
      { position: [0, ridgeY + 0.02, canopyZ], rotation: [0, 0, Math.PI / 2] },
      { castShadow: true },
    ),
  );
  return f.group("Porch Canopy", parts);
}

/**
 * A pair of carriage lanterns mounted on the front wall flanking the door —
 * each a glowing glass box in an iron frame on a short bracket arm.
 */
function buildDoorLanterns(f: NodeFactory): SceneNode {
  const metal = std(C.ironGrey, 0.4, { metalness: 0.55 });
  const wallZ = FRONT_Z + WALL_T / 2;
  const lantern = (x: number): SceneNode =>
    f.group(
      "Door Lantern",
      [
        f.mesh("Backplate", box(0.16, 0.26, 0.04), metal, { position: [0, 0, 0.02] }, {
          castShadow: true,
        }),
        f.mesh("Bracket", box(0.04, 0.04, 0.2), metal, { position: [0, 0.12, 0.13] }, {
          castShadow: true,
        }),
        f.mesh(
          "Lantern Glass",
          box(0.17, 0.26, 0.17),
          {
            color: C.lampGlow,
            roughness: 0.25,
            emissive: C.lampGlow,
            transparent: true,
            opacity: 0.9,
          },
          { position: [0, 0, 0.31] },
        ),
        f.mesh("Lantern Crown", box(0.2, 0.05, 0.2), metal, { position: [0, 0.15, 0.31] }, {
          castShadow: true,
        }),
        f.mesh("Lantern Base", box(0.2, 0.05, 0.2), metal, { position: [0, -0.15, 0.31] }, {
          castShadow: true,
        }),
        f.mesh("Lantern Cap", cone(0.16, 0.16, 4), metal, { position: [0, 0.27, 0.31] }, {
          castShadow: true,
        }),
      ],
      { position: [x, 1.95, wallZ] },
    );
  return f.group("Door Lanterns", [lantern(-1.05), lantern(1.05)]);
}

/**
 * A wrought-iron weather vane pinned to the rear of the roof ridge — a vertical
 * spindle with the four cardinal arms and a pointer arrow that turns the wind.
 */
function buildWeatherVane(f: NodeFactory): SceneNode {
  const iron = std(C.ironGrey, 0.4, { metalness: 0.6 });
  const ridgeY = ROOF_TOP + ROOF_H;
  const parts: SceneNode[] = [
    f.mesh("Spindle", cylinder(0.03, 0.045, 0.95, 8), iron, { position: [0, 0.48, 0] }, {
      castShadow: true,
    }),
    f.mesh("Ball", sphere(0.07, 10, 8), iron, { position: [0, 0.2, 0] }, { castShadow: true }),
  ];
  // Crossed cardinal bars with a small sphere at each tip.
  for (const rot of [0, Math.PI / 2]) {
    parts.push(
      f.mesh(
        "Cardinal Arm",
        box(0.7, 0.025, 0.025),
        iron,
        { position: [0, 0.62, 0], rotation: [0, rot, 0] },
        { castShadow: true },
      ),
    );
  }
  for (const [ax, az] of [
    [0.35, 0],
    [-0.35, 0],
    [0, 0.35],
    [0, -0.35],
  ] as const) {
    parts.push(
      f.mesh("Cardinal Tip", sphere(0.035, 6, 5), iron, { position: [ax, 0.62, az] }, {
        castShadow: true,
      }),
    );
  }
  // The pointer arrow, perched above the arms.
  parts.push(
    f.group(
      "Wind Arrow",
      [
        f.mesh("Shaft", box(0.9, 0.03, 0.03), iron, {}, { castShadow: true }),
        f.mesh(
          "Arrow Head",
          cone(0.09, 0.24, 8),
          iron,
          { position: [0.5, 0, 0], rotation: [0, 0, -Math.PI / 2] },
          { castShadow: true },
        ),
        f.mesh("Tail Fin", box(0.04, 0.22, 0.3), iron, { position: [-0.42, 0, 0] }, {
          castShadow: true,
        }),
      ],
      { position: [0, 0.98, 0], rotation: [0, Math.PI / 5, 0] },
    ),
  );
  return f.group("Weather Vane", parts, { position: [0, ridgeY, BACK_Z + 0.25] });
}

/**
 * Decorative stone quoins toothing the four vertical corners of the house —
 * stacked blocks whose long axis alternates for the classic Victorian look.
 */
function buildCornerQuoins(f: NodeFactory): SceneNode {
  const corners: [number, number][] = [
    [-W / 2, -D / 2],
    [W / 2, -D / 2],
    [-W / 2, D / 2],
    [W / 2, D / 2],
  ];
  const blockH = 0.42;
  const gap = 0.66;
  const instances: Transform[] = [];
  for (const [cx, cz] of corners) {
    let i = 0;
    for (let y = 0.5; y < FLOOR_H * 3 - 0.2; y += gap) {
      const long = i % 2 === 0;
      instances.push({
        position: [cx, y, cz],
        rotation: [0, 0, 0],
        scale: long ? [1.35, 1, 0.78] : [0.78, 1, 1.35],
      });
      i++;
    }
  }
  return f.instanced(
    "Corner Quoins",
    box(0.46, blockH, 0.46),
    std(C.quoinCream, 0.8, { flatShading: true }),
    instances,
    { castShadow: true, receiveShadow: true },
  );
}

/* ───────────────────────── balcony rail ───────────────────────── */

function buildBalconyRail(f: NodeFactory): SceneNode {
  const posts: SceneNode[] = [];
  let idx = 0;
  for (let x = 0.2; x <= 3.2; x += 0.22) {
    posts.push(
      f.mesh(
        `Post ${++idx}`,
        box(0.04, 0.5, 0.04),
        std(C.white),
        { position: [x, 0.32, 0] },
        { castShadow: true },
      ),
    );
  }
  return f.group(
    "Balcony Rail",
    [
      f.mesh("Top Rail", box(3.1, 0.06, 0.08), std(C.white), { position: [1.7, 0.55, 0] }, { castShadow: true }),
      f.mesh("Bottom Rail", box(3.1, 0.06, 0.08), std(C.white), { position: [1.7, 0.08, 0] }, { castShadow: true }),
      ...posts,
    ],
    { position: [0, FLOOR_H * 2 + 0.55, FRONT_Z - 0.05] },
  );
}

/* ───────────────────────── furniture ───────────────────────── */

function buildFurniture(f: NodeFactory): SceneNode {
  const item = (
    name: string,
    pos: [number, number, number],
    size: [number, number, number],
    material: MaterialDef,
  ): SceneNode =>
    f.mesh(name, box(size[0], size[1], size[2]), material, { position: pos }, {
      castShadow: true,
      receiveShadow: true,
    });
  const wood = std(C.walnut, 0.6, { texture: "wood" });
  return f.group("Furniture", [
    item("Kitchen Counter", [-2.6, 0.45, -1.5], [1.3, 0.9, 0.4], std(C.white)),
    item("Kitchen Stove", [-1.6, 0.35, -1.5], [0.4, 0.7, 0.4], wood),
    item("Bathtub", [0.1, 0.18, -0.6], [0.9, 0.35, 0.5], std(C.white)),
    item("Bath Water", [0.1, 0.25, -0.6], [0.75, 0.25, 0.35], std(C.wallPinkLight)),
    item("Workbench", [2.4, 0.45, -1.5], [1.0, 0.9, 0.45], wood),
    item("Sofa Base", [-2.4, FLOOR_H + 0.35, -0.9], [1.4, 0.6, 0.55], std(C.accentMint)),
    item("Sofa Back", [-2.4, FLOOR_H + 0.65, -1.15], [1.4, 0.55, 0.18], std(C.accentMint)),
    item("Bookcase", [0, FLOOR_H + 0.9, -1.9], [1.2, 1.5, 0.2], wood),
    item("Bookshelf Upper", [0, FLOOR_H + 1.1, -1.82], [1.0, 0.05, 0.18], std(C.cream)),
    item("Bookshelf Lower", [0, FLOOR_H + 0.7, -1.82], [1.0, 0.05, 0.18], std(C.cream)),
    item("Desk Top", [2.4, FLOOR_H + 0.4, -1.3], [1.0, 0.05, 0.5], wood),
    item("Desk Leg", [2.4, FLOOR_H + 0.2, -1.3], [1.0, 0.4, 0.05], wood),
    item("Monitor Arm", [2.4, FLOOR_H + 0.7, -1.5], [0.55, 0.4, 0.04], wood),
    item("Monitor Screen", [2.4, FLOOR_H + 0.7, -1.48], [0.5, 0.35, 0.01], std(C.wallpaperTeal)),
    item("Bed Frame", [-2.4, FLOOR_H * 2 + 0.25, -0.7], [1.6, 0.45, 0.9], wood),
    item("Bed Spread", [-2.4, FLOOR_H * 2 + 0.55, -0.7], [1.55, 0.15, 0.85], std(C.bedSpread)),
    item("Headboard", [-2.95, FLOOR_H * 2 + 0.6, -0.7], [0.05, 0.4, 0.85], wood),
    item("Crib", [2.4, FLOOR_H * 2 + 0.35, -0.9], [1.0, 0.55, 0.7], std(C.white)),
    item("Crib Mattress", [2.4, FLOOR_H * 2 + 0.45, -0.9], [0.95, 0.1, 0.65], std(C.bedSpread)),
  ]);
}

/* ───────────────────────── document ───────────────────────── */

/**
 * Build the default dollhouse document — a pink Victorian house in the centre
 * of a fenced yard with a cobblestone path leading to an arched front door.
 *
 * Courtyard and house meshes are incrementally enhanced over the base preset:
 *  - First pass — yard: flower beds, path hedges, a slatted bench, a stone bird
 *    bath, a glowing lamp post and a picket garden gate; house: a brass
 *    doorknob, a brick chimney, window dressing (shutters + flower boxes) and a
 *    tiled roof ridge with a finial.
 *  - Second pass — yard: an ornamental pond with lily pads and reeds, a
 *    rose-covered trellis arch over the path and a soil-heaped wheelbarrow;
 *    house: a pitched porch canopy, a pair of carriage lanterns flanking the
 *    door, a rooftop weather vane and toothed stone corner quoins.
 *
 * Trees route around every courtyard prop. Deterministic: every call produces
 * the same ids and randomised positions.
 */
export function buildDollhouseDocument(): DollhouseDocument {
  const f = new NodeFactory("dh");
  const treeKeepOut: KeepOut[] = [
    { x: BENCH_POS[0], z: BENCH_POS[2], r: 1.8 },
    { x: BIRD_BATH_POS[0], z: BIRD_BATH_POS[2], r: 1.4 },
    { x: LAMP_POST_POS[0], z: LAMP_POST_POS[2], r: 0.9 },
    { x: POND_POS[0], z: POND_POS[2], r: POND_RADIUS + 0.9 },
    { x: WHEELBARROW_POS[0], z: WHEELBARROW_POS[2], r: 1.1 },
  ];
  const garden = f.group("Garden", [
    buildLawn(f),
    buildCobblePath(f),
    buildHedges(f),
    buildTrees(f, treeKeepOut),
    buildFence(f),
    buildGardenGate(f),
    buildFlowerBeds(f),
    buildGardenBench(f, BENCH_POS, Math.PI / 2),
    buildBirdBath(f, BIRD_BATH_POS),
    buildLampPost(f, LAMP_POST_POS),
    buildPond(f, POND_POS),
    buildRoseArch(f, ROSE_ARCH_Z),
    buildWheelbarrow(f, WHEELBARROW_POS, -0.4),
  ]);
  const house = f.group("House", [
    buildFloors(f),
    buildBackWall(f),
    buildFrontWall(f),
    buildSideWalls(f),
    buildRoomDividers(f),
    buildStairs(f),
    buildRoof(f),
    buildRoofRidge(f),
    buildChimney(f),
    buildWeatherVane(f),
    buildCornerQuoins(f),
    buildBalconyRail(f),
    buildPorchCanopy(f),
    buildDoorLanterns(f),
    buildWindowDressing(f),
    buildFurniture(f),
  ]);
  const root: SceneNode = {
    id: "dh-root",
    name: "Dollhouse",
    kind: "group",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    children: [garden, house],
  };
  return {
    schemaVersion: DOLLHOUSE_SCHEMA_VERSION,
    kind: "dollhouse",
    root,
    metadata: { name: "Pink Victorian Dollhouse" },
  };
}
