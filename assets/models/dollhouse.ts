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
 * This module was imported from packages/editor/src/presets and incrementally
 * enhanced — the courtyard gained hedges, flower beds, a bench, a bird bath,
 * lamp posts and door planters; the house gained a chimney, ridge trim, window
 * shutters + boxes, a covered porch and extra interior decor.
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
  // ── enhancement palette ──
  flowerRed: "#e2566b",
  flowerYellow: "#f4cd6b",
  flowerWhite: "#fdf4f0",
  flowerPurple: "#b48fd8",
  stem: "#5b8a4a",
  hedge: "#4f7d49",
  water: "#9fcfe0",
  brick: "#b06550",
  lampPost: "#3c3531",
  lampGlow: "#ffe7a6",
  brass: "#c9a24a",
  terracotta: "#c2734a",
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
const cyl = (
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 12,
): GeometryDef => ({ type: "cylinder", radiusTop, radiusBottom, height, radialSegments });
const sphere = (radius: number, widthSegments = 16, heightSegments = 12): GeometryDef => ({
  type: "sphere",
  radius,
  widthSegments,
  heightSegments,
});
const cone = (radius: number, height: number, radialSegments = 12): GeometryDef => ({
  type: "cone",
  radius,
  height,
  radialSegments,
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

function buildTrees(f: NodeFactory): SceneNode {
  const { trunk, foliage } = buildLowPolyTree(C.bark, C.foliage);
  const rng = mulberry32(0xf01ea6e);

  // Sample positions in the yard, avoiding the house footprint and the path.
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

/**
 * Clipped boxwood hedges lining the cobblestone path — a long flat-shaded body
 * topped with a row of instanced spherical crowns for a hand-trimmed look.
 */
function buildHedges(f: NodeFactory): SceneNode {
  const hedgeMat = std(C.hedge, 0.92, { texture: "grass", textureScale: [3, 3], flatShading: true });
  const z0 = FRONT_Z + 1.0;
  const z1 = FRONT_Z + 9.5;
  const len = z1 - z0;
  const zMid = (z0 + z1) / 2;
  const hedgeH = 0.5;
  const makeRow = (name: string, x: number): SceneNode => {
    const crowns: Transform[] = [];
    for (let z = z0 + 0.28; z <= z1 - 0.28 + 1e-3; z += 0.5) {
      crowns.push({ position: [x, hedgeH, z], rotation: [0, 0, 0], scale: [1, 0.66, 1] });
    }
    return f.group(name, [
      f.mesh(
        "Hedge Body",
        box(0.48, hedgeH, len),
        hedgeMat,
        { position: [x, hedgeH / 2, zMid] },
        { castShadow: true, receiveShadow: true },
      ),
      f.instanced("Hedge Crowns", sphere(0.3, 8, 6), hedgeMat, crowns, { castShadow: true }),
    ]);
  };
  return f.group("Hedges", [makeRow("Left Hedge", -1.15), makeRow("Right Hedge", 1.15)]);
}

/**
 * Flower beds — clusters of instanced stems and colour-sorted instanced blooms.
 * Two beds hug the front wall either side of the porch; two more brighten the
 * far corners of the yard. Deterministic from a fixed seed.
 */
function buildFlowerBeds(f: NodeFactory): SceneNode {
  const rng = mulberry32(0xb10550);
  const bloomColors = [C.flowerRed, C.flowerYellow, C.flowerWhite, C.flowerPurple] as const;
  interface Flower {
    x: number;
    z: number;
    h: number;
    s: number;
    color: string;
  }
  const flowers: Flower[] = [];
  const scatter = (
    xMin: number,
    xMax: number,
    zMin: number,
    zMax: number,
    count: number,
  ): void => {
    for (let i = 0; i < count; i++) {
      const x = xMin + rng() * (xMax - xMin);
      const z = zMin + rng() * (zMax - zMin);
      const h = 0.2 + rng() * 0.24;
      const s = 0.75 + rng() * 0.7;
      const ci = Math.min(bloomColors.length - 1, Math.floor(rng() * bloomColors.length));
      flowers.push({ x, z, h, s, color: bloomColors[ci] ?? bloomColors[0] });
    }
  };
  scatter(-W / 2 + 0.4, -1.25, FRONT_Z + 0.35, FRONT_Z + 0.95, 16);
  scatter(1.25, W / 2 - 0.4, FRONT_Z + 0.35, FRONT_Z + 0.95, 16);
  scatter(-9.5, -5.5, -5.5, -1.5, 18);
  scatter(5.5, 9.5, 7, 11.5, 18);

  const stemBase = 0.28;
  const stems: Transform[] = flowers.map((fl): Transform => ({
    position: [fl.x, fl.h / 2, fl.z],
    rotation: [0, 0, 0],
    scale: [1, fl.h / stemBase, 1],
  }));
  const stemNode = f.instanced(
    "Stems",
    cyl(0.015, 0.022, stemBase, 5),
    std(C.stem, 0.85, { flatShading: true }),
    stems,
    { castShadow: true },
  );
  const bloomNodes = bloomColors.map((color, idx): SceneNode => {
    const insts: Transform[] = flowers
      .filter((fl) => fl.color === color)
      .map((fl): Transform => ({
        position: [fl.x, fl.h + 0.03, fl.z],
        rotation: [rng() * 0.4, rng() * Math.PI, 0],
        scale: [fl.s, fl.s, fl.s],
      }));
    return f.instanced(
      `Blooms ${idx + 1}`,
      sphere(0.07, 8, 6),
      std(color, 0.6, { flatShading: true }),
      insts,
      { castShadow: true },
    );
  });
  return f.group("Flower Beds", [stemNode, ...bloomNodes]);
}

/** A slatted garden bench tucked under the trees, facing the path. */
function buildGardenBench(f: NodeFactory): SceneNode {
  const woodMat = std(C.fence, 0.7, { texture: "wood" });
  const frameMat = std(C.white, 0.6);
  const slat = (name: string, y: number, z: number): SceneNode =>
    f.mesh(name, box(1.5, 0.07, 0.12), woodMat, { position: [0, y, z] }, {
      castShadow: true,
      receiveShadow: true,
    });
  const parts: SceneNode[] = [
    slat("Seat Slat 1", 0.42, -0.16),
    slat("Seat Slat 2", 0.42, 0),
    slat("Seat Slat 3", 0.42, 0.16),
    f.mesh("Back Slat 1", box(1.5, 0.12, 0.06), woodMat, { position: [0, 0.66, -0.24] }, {
      castShadow: true,
    }),
    f.mesh("Back Slat 2", box(1.5, 0.12, 0.06), woodMat, { position: [0, 0.84, -0.24] }, {
      castShadow: true,
    }),
  ];
  ([-1, 1] as const).forEach((side) => {
    const sx = side * 0.66;
    parts.push(
      f.mesh("Front Leg", box(0.09, 0.42, 0.09), frameMat, { position: [sx, 0.21, 0.2] }, {
        castShadow: true,
      }),
      f.mesh("Back Leg", box(0.09, 0.9, 0.09), frameMat, { position: [sx, 0.45, -0.24] }, {
        castShadow: true,
      }),
      f.mesh("Armrest", box(0.09, 0.07, 0.5), frameMat, { position: [sx, 0.6, -0.02] }, {
        castShadow: true,
      }),
    );
  });
  return f.group("Garden Bench", parts, {
    position: [-5.2, 0, FRONT_Z + 5.2],
    rotation: [0, Math.PI / 2, 0],
  });
}

/** A stone bird bath — the courtyard centrepiece, off to one side of the path. */
function buildBirdBath(f: NodeFactory): SceneNode {
  const stoneMat = std(C.stone, 0.85, { texture: "cobblestone", flatShading: true });
  return f.group(
    "Bird Bath",
    [
      f.mesh("Base", cyl(0.26, 0.34, 0.16, 16), stoneMat, { position: [0, 0.08, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh("Pedestal", cyl(0.13, 0.2, 0.62, 12), stoneMat, { position: [0, 0.47, 0] }, {
        castShadow: true,
      }),
      f.mesh("Bowl", cyl(0.5, 0.22, 0.18, 20), stoneMat, { position: [0, 0.87, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh(
        "Water",
        cyl(0.43, 0.43, 0.05, 20),
        { color: C.water, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.8 },
        { position: [0, 0.95, 0] },
      ),
    ],
    { position: [4.6, 0, FRONT_Z + 6.2] },
  );
}

/** Victorian lamp posts flanking the path, with softly glowing lanterns. */
function buildLampPosts(f: NodeFactory): SceneNode {
  const metal = std(C.lampPost, 0.5, { metalness: 0.4 });
  const glow: MaterialDef = {
    color: C.lampGlow,
    emissive: C.lampGlow,
    roughness: 0.3,
    transparent: true,
    opacity: 0.92,
  };
  const makeLamp = (name: string, x: number, z: number): SceneNode =>
    f.group(
      name,
      [
        f.mesh("Footing", cyl(0.13, 0.17, 0.14, 10), metal, { position: [0, 0.07, 0] }, {
          castShadow: true,
        }),
        f.mesh("Pole", cyl(0.045, 0.06, 1.8, 8), metal, { position: [0, 0.97, 0] }, {
          castShadow: true,
        }),
        f.mesh("Lantern Cage", box(0.2, 0.3, 0.2), metal, { position: [0, 1.99, 0] }, {
          castShadow: true,
        }),
        f.mesh("Lantern Glass", box(0.13, 0.22, 0.13), glow, { position: [0, 1.99, 0] }),
        f.mesh("Cap", cone(0.16, 0.2, 8), metal, { position: [0, 2.24, 0] }, { castShadow: true }),
      ],
      { position: [x, 0, z] },
    );
  return f.group("Lamp Posts", [
    makeLamp("Lamp 1", -1.7, FRONT_Z + 2.3),
    makeLamp("Lamp 2", 1.7, FRONT_Z + 2.3),
    makeLamp("Lamp 3", -1.7, FRONT_Z + 7.2),
    makeLamp("Lamp 4", 1.7, FRONT_Z + 7.2),
  ]);
}

/** Terracotta planters with flowering shrubs, flanking the front door. */
function buildPlanters(f: NodeFactory): SceneNode {
  const potMat = std(C.terracotta, 0.8, { flatShading: true });
  const makePlanter = (name: string, x: number): SceneNode =>
    f.group(
      name,
      [
        f.mesh("Pot", cyl(0.2, 0.14, 0.32, 12), potMat, { position: [0, 0.16, 0] }, {
          castShadow: true,
          receiveShadow: true,
        }),
        f.mesh("Pot Rim", cyl(0.22, 0.21, 0.06, 12), potMat, { position: [0, 0.31, 0] }, {
          castShadow: true,
        }),
        f.mesh(
          "Shrub",
          sphere(0.26, 10, 8),
          std(C.foliage, 0.85, { flatShading: true }),
          { position: [0, 0.52, 0], scale: [1, 0.9, 1] },
          { castShadow: true },
        ),
        f.mesh("Blossom A", sphere(0.07, 8, 6), std(C.flowerWhite, 0.6, { flatShading: true }), {
          position: [0.13, 0.62, 0.08],
        }),
        f.mesh("Blossom B", sphere(0.07, 8, 6), std(C.flowerPurple, 0.6, { flatShading: true }), {
          position: [-0.1, 0.58, -0.1],
        }),
      ],
      { position: [x, 0.12, FRONT_Z + 0.55] },
    );
  return f.group("Door Planters", [makePlanter("Planter L", -0.95), makePlanter("Planter R", 0.95)]);
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

/**
 * A mullioned window dressed with louvred shutters, a sill and a planter box of
 * blooms — the shutters and box face into the room (the dollhouse is viewed
 * through its open front).
 */
function buildWindow(f: NodeFactory, x: number, y: number): SceneNode {
  const z = BACK_Z + WALL_T / 2 + 0.003;
  const shutterMat = std(C.roofShingle, 0.7, { texture: "wood" });
  const shutter = (name: string, sx: number): SceneNode => {
    const slats: SceneNode[] = [];
    for (let i = 0; i < 4; i++) {
      slats.push(
        f.mesh(`Louver ${i + 1}`, box(0.13, 0.035, 0.012), std(C.cream, 0.6), {
          position: [0, 0.27 - i * 0.18, 0.022],
        }),
      );
    }
    return f.group(
      name,
      [f.mesh("Panel", box(0.18, 0.86, 0.04), shutterMat, {}, { castShadow: true }), ...slats],
      { position: [sx, 0, 0.01] },
    );
  };
  const windowBox = f.group(
    "Window Box",
    [
      f.mesh("Box", box(0.74, 0.16, 0.18), std(C.walnut, 0.6, { texture: "wood" }), {}, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh("Bloom L", sphere(0.08, 8, 6), std(C.flowerRed, 0.6, { flatShading: true }), {
        position: [-0.22, 0.11, 0.02],
      }),
      f.mesh("Bloom C", sphere(0.08, 8, 6), std(C.flowerYellow, 0.6, { flatShading: true }), {
        position: [0, 0.12, 0.03],
      }),
      f.mesh("Bloom R", sphere(0.08, 8, 6), std(C.flowerPurple, 0.6, { flatShading: true }), {
        position: [0.22, 0.11, 0.02],
      }),
    ],
    { position: [0, -0.62, 0.12] },
  );
  return f.group(
    "Window",
    [
      f.mesh("Sill", box(1.0, 0.07, 0.12), std(C.white), { position: [0, -0.5, 0.05] }, {
        castShadow: true,
      }),
      f.mesh("Frame", box(0.8, 0.9, 0.03), std(C.white), {}, { castShadow: true }),
      f.mesh(
        "Glass",
        plane(0.66, 0.76),
        { color: C.glass, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 },
        { position: [0, 0, 0.02] },
      ),
      f.mesh("Mullion V", box(0.04, 0.78, 0.005), std(C.white), { position: [0, 0, 0.025] }),
      f.mesh("Mullion H", box(0.68, 0.04, 0.005), std(C.white), { position: [0, 0, 0.025] }),
      shutter("Shutter L", -0.52),
      shutter("Shutter R", 0.52),
      windowBox,
    ],
    { position: [x, y, z] },
  );
}

/**
 * A panelled front door with recessed panels and a brass knob. Stays a group so
 * the leaf, panels and knob swing open together about the hinge.
 */
function buildDoorPanel(f: NodeFactory): SceneNode {
  const doorMat = std(C.doorWood, 0.65, { texture: "wood" });
  const recessMat = std(C.doorWood, 0.5);
  return f.group(
    "Door Panel",
    [
      f.mesh("Leaf", box(0.65, 2.15, 0.05), doorMat, {}, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh("Upper Panel", box(0.42, 0.78, 0.02), recessMat, { position: [0, 0.46, 0.03] }),
      f.mesh("Lower Panel", box(0.42, 0.78, 0.02), recessMat, { position: [0, -0.46, 0.03] }),
      f.mesh(
        "Knob",
        sphere(0.05, 10, 8),
        { color: C.brass, roughness: 0.3, metalness: 0.7 },
        { position: [0.22, 0, 0.07] },
        { castShadow: true },
      ),
    ],
    { position: [-0.5, 1.08, FRONT_Z - WALL_T / 2 - 0.05], rotation: [0, -0.5, 0] },
  );
}

/** Covered porch — turned posts, a sloped awning and a two-tread stoop. */
function buildPorch(f: NodeFactory): SceneNode {
  const postMat = std(C.white, 0.6);
  const roofMat = std(C.roofRose, 0.85);
  const stepMat = std(C.stone, 0.9, { texture: "cobblestone" });
  const post = (name: string, x: number): SceneNode =>
    f.group(
      name,
      [
        f.mesh("Base", box(0.2, 0.12, 0.2), postMat, { position: [0, 0.06, 0] }, {
          castShadow: true,
        }),
        f.mesh("Shaft", cyl(0.07, 0.09, 2.4, 10), postMat, { position: [0, 1.32, 0] }, {
          castShadow: true,
        }),
        f.mesh("Capital", box(0.2, 0.12, 0.2), postMat, { position: [0, 2.58, 0] }, {
          castShadow: true,
        }),
      ],
      { position: [x, 0.12, FRONT_Z + 0.62] },
    );
  return f.group("Porch", [
    post("Porch Post L", -1.15),
    post("Porch Post R", 1.15),
    f.mesh(
      "Awning",
      box(2.8, 0.12, 1.15),
      roofMat,
      { position: [0, 2.84, FRONT_Z + 0.52], rotation: [-0.16, 0, 0] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh(
      "Awning Trim",
      box(2.9, 0.1, 0.08),
      std(C.cream, 0.7),
      { position: [0, 2.72, FRONT_Z + 1.05], rotation: [-0.16, 0, 0] },
      { castShadow: true },
    ),
    f.mesh("Step Upper", box(2.6, 0.08, 0.3), stepMat, { position: [0, 0.07, FRONT_Z + 0.92] }, {
      receiveShadow: true,
    }),
    f.mesh("Step Lower", box(3.0, 0.08, 0.32), stepMat, { position: [0, 0.03, FRONT_Z + 1.24] }, {
      receiveShadow: true,
    }),
  ]);
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
    // A panelled door sits open behind the wall — purely visual.
    buildDoorPanel(f),
    // Front porch slab.
    f.mesh(
      "Front Porch",
      box(2.6, 0.12, 0.7),
      std(C.stone, 0.9, { texture: "cobblestone" }),
      { position: [0, 0.06, FRONT_Z + 0.4] },
      { receiveShadow: true },
    ),
    buildPorch(f),
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
  const roofH = 2.2;
  const roofTop = FLOOR_H * 3;
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

/** A brick chimney rising through the left roof pitch, with twin clay flues. */
function buildChimney(f: NodeFactory): SceneNode {
  const brickMat = std(C.brick, 0.9, { texture: "cobblestone", textureScale: [2, 3], flatShading: true });
  const capMat = std(C.stone, 0.85, { flatShading: true });
  const cx = -1.95;
  const cz = -0.5;
  return f.group("Chimney", [
    f.mesh("Stack", box(0.62, 3.1, 0.62), brickMat, { position: [cx, 9.0, cz] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Cap", box(0.82, 0.18, 0.82), capMat, { position: [cx, 10.64, cz] }, {
      castShadow: true,
    }),
    f.mesh("Flue L", cyl(0.1, 0.1, 0.26, 10), capMat, { position: [cx - 0.16, 10.86, cz] }, {
      castShadow: true,
    }),
    f.mesh("Flue R", cyl(0.1, 0.1, 0.26, 10), capMat, { position: [cx + 0.16, 10.86, cz] }, {
      castShadow: true,
    }),
  ]);
}

/**
 * Roof trim — a ridge cap along the peak, spire finials at each gable and a
 * scalloped "gingerbread" valance hanging under the front eave.
 */
function buildRoofTrim(f: NodeFactory): SceneNode {
  const roofH = 2.2;
  const roofTop = FLOOR_H * 3;
  const roofDepth = D + 0.6;
  const peakY = roofTop + roofH + 0.05;
  const ridgeMat = std(C.roofShingle, 0.8);
  const trimMat = std(C.cream, 0.7);

  const ridge = f.mesh(
    "Ridge Cap",
    box(0.2, 0.16, roofDepth + 0.1),
    ridgeMat,
    { position: [0, peakY - 0.12, 0] },
    { castShadow: true },
  );

  const finial = (name: string, z: number): SceneNode =>
    f.group(
      name,
      [
        f.mesh("Spike Base", cyl(0.05, 0.07, 0.34, 8), trimMat, { position: [0, 0.17, 0] }, {
          castShadow: true,
        }),
        f.mesh("Ball", sphere(0.1, 10, 8), ridgeMat, { position: [0, 0.42, 0] }, {
          castShadow: true,
        }),
        f.mesh("Spike", cone(0.07, 0.3, 8), trimMat, { position: [0, 0.66, 0] }, {
          castShadow: true,
        }),
      ],
      { position: [0, peakY, z] },
    );

  // Scalloped valance hanging under the front eave.
  const scallops: Transform[] = [];
  const span = W / 2 + 0.25;
  for (let x = -span; x <= span + 1e-3; x += 0.34) {
    scallops.push({
      position: [x, roofTop - 0.04, FRONT_Z + 0.08],
      rotation: [0, 0, 0],
      scale: [1, 1.4, 1],
    });
  }
  const valance = f.instanced("Eave Valance", sphere(0.12, 8, 6), trimMat, scallops, {
    castShadow: true,
  });

  return f.group("Roof Trim", [
    ridge,
    finial("Front Finial", FRONT_Z + 0.02),
    finial("Back Finial", BACK_Z - 0.02),
    valance,
  ]);
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
    buildDecor(f),
  ]);
}

/** Extra soft furnishings layered into the rooms — rug, tables, lamps, plants. */
function buildDecor(f: NodeFactory): SceneNode {
  const wood = std(C.walnut, 0.5, { texture: "wood" });
  const shadeMat: MaterialDef = { color: C.cream, emissive: C.lampGlow, roughness: 0.5 };

  const rug = f.mesh(
    "Living Rug",
    cyl(0.95, 0.95, 0.03, 24),
    std(C.accentLavender, 0.9, { texture: "tile-pink", textureScale: [2, 2] }),
    { position: [-2.2, FLOOR_H + 0.075, -0.1] },
    { receiveShadow: true },
  );

  const coffeeTable = f.group(
    "Coffee Table",
    [
      f.mesh("Top", cyl(0.34, 0.34, 0.05, 16), wood, { position: [0, 0.36, 0] }, {
        castShadow: true,
      }),
      f.mesh("Pedestal", cyl(0.05, 0.07, 0.34, 8), wood, { position: [0, 0.18, 0] }, {
        castShadow: true,
      }),
      f.mesh("Foot", cyl(0.18, 0.2, 0.04, 12), wood, { position: [0, 0.02, 0] }, {
        castShadow: true,
      }),
    ],
    { position: [-2.2, FLOOR_H + 0.06, -0.15] },
  );

  const floorLamp = f.group(
    "Floor Lamp",
    [
      f.mesh("Lamp Base", cyl(0.12, 0.15, 0.06, 12), wood, { position: [0, 0.03, 0] }, {
        castShadow: true,
      }),
      f.mesh("Lamp Pole", cyl(0.025, 0.03, 1.3, 8), wood, { position: [0, 0.7, 0] }, {
        castShadow: true,
      }),
      f.mesh("Lamp Shade", cone(0.22, 0.3, 14), shadeMat, { position: [0, 1.45, 0] }, {
        castShadow: true,
      }),
    ],
    { position: [-3.0, FLOOR_H + 0.06, -1.7] },
  );

  const pendant = f.group(
    "Pendant Light",
    [
      f.mesh("Cord", cyl(0.012, 0.012, 0.5, 6), wood, { position: [0, FLOOR_H * 2 - 0.25, 0] }),
      f.mesh("Shade", cone(0.2, 0.22, 14), { color: C.white, emissive: C.lampGlow, roughness: 0.5 }, {
        position: [0, FLOOR_H * 2 - 0.6, 0],
      }, { castShadow: true }),
      f.mesh(
        "Bulb",
        sphere(0.07, 8, 6),
        { color: C.lampGlow, emissive: C.lampGlow, roughness: 0.3 },
        { position: [0, FLOOR_H * 2 - 0.68, 0] },
      ),
    ],
    { position: [0.3, 0, -0.6] },
  );

  const indoorPlant = f.group(
    "Indoor Plant",
    [
      f.mesh("Plant Pot", cyl(0.16, 0.12, 0.28, 12), std(C.terracotta, 0.8, { flatShading: true }), {
        position: [0, 0.14, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(
        "Plant Foliage",
        sphere(0.28, 10, 8),
        std(C.foliage, 0.85, { flatShading: true }),
        { position: [0, 0.5, 0], scale: [1, 1.15, 1] },
        { castShadow: true },
      ),
    ],
    { position: [-3.0, 0.06, 1.5] },
  );

  const wallCabinet = f.mesh(
    "Wall Cabinet",
    box(1.2, 0.6, 0.3),
    std(C.white, 0.6),
    { position: [-2.6, 1.7, -2.2] },
    { castShadow: true, receiveShadow: true },
  );

  return f.group("Decor", [rug, coffeeTable, floorLamp, pendant, indoorPlant, wallCabinet]);
}

/* ───────────────────────── document ───────────────────────── */

/**
 * Build the default dollhouse document — a pink Victorian house in the centre
 * of a fenced yard with a cobblestone path leading to an arched front door.
 * Deterministic: every call produces the same ids and randomised positions.
 */
export function buildDollhouseDocument(): DollhouseDocument {
  const f = new NodeFactory("dh");
  const garden = f.group("Garden", [
    buildLawn(f),
    buildCobblePath(f),
    buildHedges(f),
    buildFlowerBeds(f),
    buildTrees(f),
    buildGardenBench(f),
    buildBirdBath(f),
    buildLampPosts(f),
    buildPlanters(f),
    buildFence(f),
  ]);
  const house = f.group("House", [
    buildFloors(f),
    buildBackWall(f),
    buildFrontWall(f),
    buildSideWalls(f),
    buildRoomDividers(f),
    buildStairs(f),
    buildRoof(f),
    buildChimney(f),
    buildRoofTrim(f),
    buildBalconyRail(f),
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
