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

/** Courtyard focal points — shared so the tree scatter leaves clearings here. */
const POND_POS: readonly [number, number] = [-5.2, 7.5];
const BENCH_POS: readonly [number, number] = [4.8, 6.5];

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
  stoneLight: "#b6a89a",
  bark: "#5a3a26",
  foliage: "#3d6e3a",
  fence: "#caa97a",
  doorWood: "#7a4a2e",
  // Enhancement palette — courtyard dressing and house exterior detail.
  shrub: "#4d7f46",
  soil: "#4a3526",
  petalPink: "#f59ab8",
  petalWhite: "#fbf6ee",
  petalRed: "#e26079",
  petalYellow: "#f6d36b",
  petalLavender: "#c3aee0",
  brick: "#b5654d",
  brickCap: "#7d4536",
  lampMetal: "#34302b",
  lampGlow: "#ffe7a6",
  pondWater: "#8fbcd4",
  brass: "#d9b25e",
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
  radialSegments = 12,
): GeometryDef => ({ type: "cylinder", radiusTop, radiusBottom, height, radialSegments });
const cone = (radius: number, height: number, radialSegments = 12): GeometryDef => ({
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
    // Keep clearings around the pond and bench so they read as focal points.
    if (Math.hypot(x - POND_POS[0], z - POND_POS[1]) < 2.6) continue;
    if (Math.hypot(x - BENCH_POS[0], z - BENCH_POS[1]) < 1.7) continue;
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

/* ───────────────── courtyard dressing (enhancement pass) ───────────────── */

/** A single stylised flower — stem, leaf, bloom, and a contrasting center. */
function buildFlower(
  f: NodeFactory,
  x: number,
  z: number,
  petal: string,
  height: number,
): SceneNode {
  return f.group(
    "Flower",
    [
      f.mesh(
        "Stem",
        cylinder(0.014, 0.022, height, 5),
        std(C.foliage, 0.8, { flatShading: true }),
        { position: [0, height / 2, 0] },
        { castShadow: true },
      ),
      f.mesh(
        "Leaf",
        sphere(0.07, 6, 5),
        std(C.foliage, 0.85, { flatShading: true }),
        { position: [0.06, height * 0.55, 0], scale: [1.4, 0.3, 0.7] },
      ),
      f.mesh(
        "Bloom",
        sphere(0.1, 9, 7),
        std(petal, 0.55, { flatShading: true }),
        { position: [0, height + 0.05, 0], scale: [1, 0.7, 1] },
        { castShadow: true },
      ),
      f.mesh(
        "Bloom Center",
        sphere(0.05, 7, 6),
        std(C.petalYellow, 0.5),
        { position: [0, height + 0.09, 0] },
      ),
    ],
    { position: [x, 0, z] },
  );
}

/** A planting bed — a soil slab studded with a deterministic spread of flowers. */
function buildFlowerBed(
  f: NodeFactory,
  cx: number,
  cz: number,
  width: number,
  seed: number,
): SceneNode {
  const rng = mulberry32(seed);
  const depth = 0.5;
  const petals = [C.petalPink, C.petalWhite, C.petalRed, C.petalLavender, C.petalYellow];
  const parts: SceneNode[] = [
    f.mesh(
      "Soil",
      box(width, 0.12, depth),
      std(C.soil, 0.95, { flatShading: true }),
      { position: [cx, 0.06, cz] },
      { receiveShadow: true },
    ),
  ];
  const count = Math.max(4, Math.round(width / 0.34));
  for (let i = 0; i < count; i++) {
    const fx = cx + ((i + 0.5) / count - 0.5) * (width - 0.24) + (rng() - 0.5) * 0.1;
    const fz = cz + (rng() - 0.5) * (depth - 0.22);
    const petal = petals[i % petals.length] ?? C.petalPink;
    parts.push(buildFlower(f, fx, fz, petal, 0.3 + rng() * 0.16));
  }
  return f.group("Flower Bed", parts);
}

/** Flower beds flanking the entry porch plus a small bed out by the bench. */
function buildFlowers(f: NodeFactory): SceneNode {
  return f.group("Flowers", [
    buildFlowerBed(f, -2.2, FRONT_Z + 0.35, 1.8, 0xf10117),
    buildFlowerBed(f, 2.2, FRONT_Z + 0.35, 1.8, 0xf10b32),
    buildFlowerBed(f, 3.1, 7.6, 1.5, 0xf10c4d),
  ]);
}

/** A rounded shrub — overlapping flattened foliage blobs for a clipped look. */
function buildShrub(f: NodeFactory, x: number, z: number, scale: number): SceneNode {
  const leaf = std(C.shrub, 0.9, { flatShading: true });
  const blob = (radius: number, px: number, py: number, pz: number): SceneNode =>
    f.mesh(
      "Foliage",
      sphere(radius, 9, 7),
      leaf,
      { position: [px, py, pz], scale: [1, 0.82, 1] },
      { castShadow: true, receiveShadow: true },
    );
  return f.group(
    "Shrub",
    [
      blob(0.42, 0, 0.34, 0),
      blob(0.3, 0.26, 0.3, 0.1),
      blob(0.28, -0.24, 0.29, -0.08),
      blob(0.24, 0.04, 0.56, -0.04),
    ],
    { position: [x, 0, z], scale: [scale, scale, scale] },
  );
}

/** Clipped shrubs hugging the house corners and lining the path. */
function buildShrubs(f: NodeFactory): SceneNode {
  const spots: Array<[number, number, number]> = [
    [-W / 2 + 0.05, FRONT_Z + 0.45, 1.05],
    [W / 2 - 0.05, FRONT_Z + 0.45, 1.05],
    [-1.95, FRONT_Z + 3.2, 0.85],
    [1.95, FRONT_Z + 5.0, 0.9],
    [-1.95, FRONT_Z + 7.4, 0.8],
    [1.95, FRONT_Z + 9.0, 0.85],
  ];
  return f.group(
    "Shrubs",
    spots.map(([x, z, s]) => buildShrub(f, x, z, s)),
  );
}

/** A slatted wooden garden bench, oriented by `rotationY`. */
function buildGardenBench(
  f: NodeFactory,
  x: number,
  z: number,
  rotationY: number,
): SceneNode {
  const wood = std(C.fence, 0.7, { texture: "wood", flatShading: true });
  const leg = (px: number, pz: number): SceneNode =>
    f.mesh("Leg", box(0.08, 0.42, 0.08), wood, { position: [px, 0.21, pz] }, { castShadow: true });
  const slat = (py: number): SceneNode =>
    f.mesh("Back Slat", box(1.36, 0.1, 0.04), wood, { position: [0, py, -0.19] }, { castShadow: true });
  return f.group(
    "Garden Bench",
    [
      f.mesh(
        "Seat",
        box(1.4, 0.08, 0.44),
        wood,
        { position: [0, 0.44, 0] },
        { castShadow: true, receiveShadow: true },
      ),
      slat(0.6),
      slat(0.78),
      f.mesh("Backrest Post L", box(0.08, 0.5, 0.08), wood, { position: [-0.64, 0.65, -0.2] }, { castShadow: true }),
      f.mesh("Backrest Post R", box(0.08, 0.5, 0.08), wood, { position: [0.64, 0.65, -0.2] }, { castShadow: true }),
      leg(-0.6, 0.16),
      leg(0.6, 0.16),
      leg(-0.6, -0.16),
      leg(0.6, -0.16),
    ],
    { position: [x, 0, z], rotation: [0, rotationY, 0] },
  );
}

/** A wrought-iron lamp post with a softly glowing lantern head. */
function buildLampPost(f: NodeFactory, x: number, z: number): SceneNode {
  const metal = std(C.lampMetal, 0.4, { metalness: 0.6 });
  const glass: MaterialDef = {
    color: C.lampGlow,
    emissive: C.lampGlow,
    roughness: 0.3,
    transparent: true,
    opacity: 0.9,
  };
  return f.group(
    "Lamp Post",
    [
      f.mesh("Base", cylinder(0.12, 0.2, 0.22, 10), metal, { position: [0, 0.11, 0] }, { castShadow: true }),
      f.mesh("Pole", cylinder(0.055, 0.07, 2.4, 8), metal, { position: [0, 1.4, 0] }, { castShadow: true }),
      f.mesh("Lantern Housing", box(0.3, 0.42, 0.3), metal, { position: [0, 2.78, 0] }, { castShadow: true }),
      f.mesh("Lantern Glass", box(0.2, 0.3, 0.2), glass, { position: [0, 2.78, 0] }),
      f.mesh(
        "Lantern Cap",
        cone(0.26, 0.2, 4),
        metal,
        { position: [0, 3.08, 0], rotation: [0, Math.PI / 4, 0] },
        { castShadow: true },
      ),
    ],
    { position: [x, 0, z] },
  );
}

/** A small ornamental pond — stone rim, still water, and a ring of boulders. */
function buildPond(f: NodeFactory, x: number, z: number): SceneNode {
  const rng = mulberry32(0x90d0a1);
  const rocks: SceneNode[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.4;
    const r = 1.55 + rng() * 0.1;
    const s = 0.18 + rng() * 0.16;
    rocks.push(
      f.mesh(
        "Rock",
        sphere(s, 7, 6),
        std(C.stone, 0.95, { texture: "cobblestone", flatShading: true }),
        { position: [Math.cos(a) * r, s * 0.6, Math.sin(a) * r], scale: [1, 0.7, 1] },
        { castShadow: true, receiveShadow: true },
      ),
    );
  }
  return f.group(
    "Pond",
    [
      f.mesh(
        "Stone Rim",
        cylinder(1.5, 1.62, 0.2, 20),
        std(C.stoneLight, 0.9, { texture: "cobblestone", flatShading: true }),
        { position: [0, 0.1, 0] },
        { castShadow: true, receiveShadow: true },
      ),
      f.mesh(
        "Water",
        cylinder(1.34, 1.34, 0.14, 20),
        { color: C.pondWater, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.78 },
        { position: [0, 0.14, 0] },
      ),
      ...rocks,
    ],
    { position: [x, 0, z] },
  );
}

/** The picket gate filling the path opening in the front fence, plus a mailbox. */
function buildGardenGate(f: NodeFactory): SceneNode {
  const zMax = 14;
  const wood = std(C.fence, 0.8, { texture: "bark", flatShading: true });
  const gatePost = (px: number): SceneNode =>
    f.group(
      "Gate Post",
      [
        f.mesh("Post", box(0.18, 1.5, 0.18), wood, { position: [0, 0.75, 0] }, { castShadow: true }),
        f.mesh(
          "Post Cap",
          cone(0.16, 0.2, 4),
          wood,
          { position: [0, 1.6, 0], rotation: [0, Math.PI / 4, 0] },
          { castShadow: true },
        ),
      ],
      { position: [px, 0, zMax] },
    );

  // A single picket leaf, hinged at the left post and swung open into the yard.
  const leafWidth = 2.0;
  const picketCount = 7;
  const pickets: SceneNode[] = [];
  for (let i = 0; i < picketCount; i++) {
    const px = 0.16 + (i / (picketCount - 1)) * (leafWidth - 0.32);
    pickets.push(
      f.mesh("Picket", box(0.09, 1.0, 0.05), wood, { position: [px, 0.55, 0] }, { castShadow: true }),
    );
    pickets.push(
      f.mesh(
        "Picket Tip",
        cone(0.07, 0.12, 4),
        wood,
        { position: [px, 1.11, 0], rotation: [0, Math.PI / 4, 0] },
        { castShadow: true },
      ),
    );
  }
  const leaf = f.group(
    "Gate Leaf",
    [
      f.mesh("Bottom Rail", box(leafWidth, 0.1, 0.06), wood, { position: [leafWidth / 2, 0.32, 0] }, { castShadow: true }),
      f.mesh("Top Rail", box(leafWidth, 0.1, 0.06), wood, { position: [leafWidth / 2, 0.92, 0] }, { castShadow: true }),
      ...pickets,
    ],
    { position: [-1.05, 0, zMax], rotation: [0, 0.55, 0] },
  );

  const mailbox = f.group(
    "Mailbox",
    [
      f.mesh("Mailbox Post", box(0.08, 1.0, 0.08), wood, { position: [0, 0.5, 0] }, { castShadow: true }),
      f.mesh(
        "Mailbox Body",
        box(0.22, 0.2, 0.34),
        std(C.accentMint, 0.6),
        { position: [0, 1.02, 0] },
        { castShadow: true },
      ),
      f.mesh(
        "Mailbox Roof",
        box(0.26, 0.05, 0.38),
        std(C.trim, 0.6),
        { position: [0, 1.14, 0] },
        { castShadow: true },
      ),
    ],
    { position: [1.7, 0, zMax - 0.5] },
  );

  return f.group("Garden Gate", [gatePost(-1.05), gatePost(1.05), leaf, mailbox]);
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

  // A small pyramidal cap finishes each post — stamped as one instanced mesh.
  const postCaps: Transform[] = posts.map((p): Transform => ({
    position: [p.position[0], postHeight + 0.07, p.position[2]],
    rotation: [0, Math.PI / 4, 0],
    scale: [1, 1, 1],
  }));

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
    f.instanced(
      "Post Caps",
      cone(0.095, 0.14, 4),
      std(C.fence, 0.8, { texture: "bark", flatShading: true }),
      postCaps,
      { castShadow: true },
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
  const shutter = (name: string, sx: number): SceneNode =>
    f.mesh(name, box(0.16, 0.92, 0.04), std(C.trim, 0.7), { position: [sx, 0, 0.015] }, {
      castShadow: true,
    });
  const bloom = (bx: number, color: string): SceneNode =>
    f.mesh("Window Bloom", sphere(0.07, 7, 6), std(color, 0.55, { flatShading: true }), {
      position: [bx, -0.46, 0.12],
    });
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
      shutter("Shutter L", -0.5),
      shutter("Shutter R", 0.5),
      f.mesh("Sill", box(0.98, 0.06, 0.12), std(C.white, 0.7), { position: [0, -0.5, 0.05] }, {
        castShadow: true,
      }),
      f.mesh(
        "Flower Box",
        box(0.82, 0.16, 0.16),
        std(C.walnut, 0.6, { texture: "wood" }),
        { position: [0, -0.58, 0.09] },
        { castShadow: true },
      ),
      bloom(-0.26, C.petalRed),
      bloom(-0.09, C.petalWhite),
      bloom(0.09, C.petalPink),
      bloom(0.26, C.petalYellow),
    ],
    { position: [x, y, z] },
  );
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
    // The front door — a panelled leaf standing open behind the arch.
    f.group(
      "Front Door",
      [
        f.mesh(
          "Door Panel",
          box(0.65, 2.15, 0.05),
          std(C.doorWood, 0.7, { texture: "wood" }),
          {},
          { castShadow: true, receiveShadow: true },
        ),
        f.mesh("Door Rail Top", box(0.56, 0.12, 0.07), std(C.doorWood, 0.55), {
          position: [0, 0.62, 0.01],
        }, { castShadow: true }),
        f.mesh("Door Rail Bottom", box(0.56, 0.12, 0.07), std(C.doorWood, 0.55), {
          position: [0, -0.62, 0.01],
        }, { castShadow: true }),
        f.mesh(
          "Door Knob",
          sphere(0.05, 10, 8),
          { color: C.brass, roughness: 0.3, metalness: 0.7 },
          { position: [0.24, 0, 0.06] },
          { castShadow: true },
        ),
      ],
      { position: [-0.5, 1.08, FRONT_Z - WALL_T / 2 - 0.05], rotation: [0, -0.5, 0] },
    ),
    // Front porch slab with a single step down to the path.
    f.mesh(
      "Front Porch",
      box(2.6, 0.12, 0.7),
      std(C.stone, 0.9, { texture: "cobblestone" }),
      { position: [0, 0.06, FRONT_Z + 0.4] },
      { receiveShadow: true },
    ),
    f.mesh(
      "Porch Step",
      box(1.8, 0.1, 0.42),
      std(C.stone, 0.9, { texture: "cobblestone" }),
      { position: [0, 0.04, FRONT_Z + 0.92] },
      { castShadow: true, receiveShadow: true },
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

  // A capped ridge beam closes the seam where the two pitches meet, with a
  // turned ball finial at each gable end.
  const ridgeBeam = f.mesh(
    "Ridge Cap",
    box(0.22, 0.18, roofDepth + 0.12),
    std(C.roofShingle, 0.8, { flatShading: true }),
    { position: [0, roofH, 0] },
    { castShadow: true },
  );
  const finial = (name: string, z: number): SceneNode =>
    f.group(
      name,
      [
        f.mesh("Spire", box(0.07, 0.34, 0.07), std(C.trim, 0.5), { position: [0, 0.17, 0] }, {
          castShadow: true,
        }),
        f.mesh(
          "Ball",
          sphere(0.12, 12, 9),
          std(C.roofShingle, 0.4, { metalness: 0.2 }),
          { position: [0, 0.42, 0] },
          { castShadow: true },
        ),
      ],
      { position: [0, roofH, z] },
    );

  return f.group(
    "Roof",
    [
      ...pitches,
      backGable,
      frontGable,
      ridgeBeam,
      finial("Front Finial", roofDepth / 2),
      finial("Back Finial", -roofDepth / 2),
    ],
    { position: [0, roofTop, 0] },
  );
}

/* ───────────────────────── chimney ───────────────────────── */

/** A brick chimney rising through the right roof pitch, topped with flue pots. */
function buildChimney(f: NodeFactory): SceneNode {
  const baseY = FLOOR_H * 3; // the roof springs from here
  const stackH = 2.7;
  const x = 1.85;
  const z = -0.7;
  const brick = std(C.brick, 0.92, { flatShading: true });
  return f.group("Chimney", [
    f.mesh(
      "Stack",
      box(0.62, stackH, 0.62),
      brick,
      { position: [x, baseY + stackH / 2, z] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh(
      "Cap",
      box(0.8, 0.16, 0.8),
      std(C.brickCap, 0.9, { flatShading: true }),
      { position: [x, baseY + stackH + 0.05, z] },
      { castShadow: true },
    ),
    f.mesh("Flue Pot L", cylinder(0.1, 0.12, 0.34, 8), std(C.brickCap, 0.85), {
      position: [x - 0.15, baseY + stackH + 0.28, z],
    }, { castShadow: true }),
    f.mesh("Flue Pot R", cylinder(0.1, 0.12, 0.34, 8), std(C.brickCap, 0.85), {
      position: [x + 0.15, baseY + stackH + 0.28, z],
    }, { castShadow: true }),
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
  ]);
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
    buildShrubs(f),
    buildFlowers(f),
    buildTrees(f),
    buildPond(f, POND_POS[0], POND_POS[1]),
    buildGardenBench(f, BENCH_POS[0], BENCH_POS[1], Math.PI),
    buildLampPost(f, 1.8, FRONT_Z + 0.75),
    buildFence(f),
    buildGardenGate(f),
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
