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

/** Third-pass courtyard props — vegetable plot, gnome, mailbox and bird feeder. */
const VEGGIE_GARDEN_POS: [number, number, number] = [4.6, 0, 11.4];
const GARDEN_GNOME_POS: [number, number, number] = [-2.95, 0, 6.0];
const MAILBOX_POS: [number, number, number] = [1.65, 0, 13.55];
const BIRD_FEEDER_POS: [number, number, number] = [4.7, 0, 3.4];
const STEPPING_STONE_Z = 6.8;

/** Fourth-pass courtyard props — sundial and a cottage birdhouse on a pole. */
const SUNDIAL_POS: [number, number, number] = [3.4, 0, 9.4];
const BIRDHOUSE_POS: [number, number, number] = [5.6, 0, 8.7];

/**
 * Fifth-pass courtyard props — backyard living quarters. Garden shed and the
 * stacked firewood lean against each other on the back-left of the yard; an
 * A-frame swing sits on the back right; a clothesline strings sheets between
 * two T-posts on the western side of the house.
 */
const SHED_POS: [number, number, number] = [-7.5, 0, -5.5];
const FIREWOOD_POS: [number, number, number] = [-5.8, 0, -5.2];
const SWING_POS: [number, number, number] = [6.8, 0, -5.5];
const CLOTHESLINE_POS: [number, number, number] = [-8.8, 0, -0.6];

/**
 * Fifth-pass scene extension — a back-meadow plane behind the fenced yard
 * with a low rolling hill, a meandering brook with a wooden footbridge,
 * scattered wildflowers and a small grove of meadow trees. The meadow
 * overlaps the main lawn by ~7 units so the ground layer has no holes
 * along the join.
 */
const MEADOW_POS: [number, number, number] = [0, -0.005, -25];
const MEADOW_W = 50;
const MEADOW_D = 30;
const MEADOW_HILL_POS: [number, number, number] = [-8, 0, -30];
const MEADOW_BROOK_Z = -20;
const FOOTBRIDGE_POS: [number, number, number] = [3, 0, MEADOW_BROOK_Z];

/**
 * Sixth-pass courtyard props — autumn / outdoor-living touches. A scarecrow
 * planted just north of the vegetable garden, a small pumpkin patch beside
 * it in the NE yard corner, a parasol-shaded patio set on the east lawn and
 * a coiled garden hose on a reel mounted to the east side wall of the house.
 */
const SCARECROW_POS: [number, number, number] = [4.6, 0, 12.5];
const PUMPKIN_PATCH_POS: [number, number, number] = [6.0, 0, 12.6];
const PATIO_SET_POS: [number, number, number] = [8.3, 0, 8.5];
const HOSE_REEL_POS: [number, number, number] = [W / 2 + 0.05, 0, -1.8];

/**
 * Sixth-pass scene extension — a side orchard ground plane east of the lawn.
 * It overlaps the lawn by ~1 unit along the join so the ground layer has no
 * holes. The orchard carries a dry-stone retaining wall along the lawn join,
 * a small grove of fruiting apple trees with fallen apples on the grass, an
 * old wooden hay cart and a stone water well with a peaked shingle roof.
 */
const ORCHARD_POS: [number, number, number] = [33, -0.003, 5];
const ORCHARD_W = 18;
const ORCHARD_D = 28;
/** The stone wall lives just inside the orchard's west edge, marking the join. */
const ORCHARD_WALL_X = 25.5;
const HAY_CART_POS: [number, number, number] = [30.5, 0, 11];
const OLD_WELL_POS: [number, number, number] = [37.5, 0, -3];

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
  // Third enhancement pass — terracotta urns, mailbox, gnome and downspouts.
  terracotta: "#c3674b",
  mailboxRed: "#c84a3f",
  gnomeBlue: "#456faa",
  doormatJute: "#8a6b3d",
  copperPipe: "#8a6e4f",
  // Fourth enhancement pass — sundial, garden string lights and chimney ivy.
  bronze: "#a5683c",
  ivyLeaf: "#3a6334",
  ivyDark: "#27482a",
  birdhouseRoof: "#a23f3f",
  // Fifth enhancement pass — shed, firewood, swing, clothesline, gutters, and
  // the back meadow (hill, brook, footbridge, wildflowers).
  shedWall: "#7c5a3a",
  shedRoof: "#3f3a36",
  shedTrim: "#dbc89b",
  logBark: "#6e4a2c",
  logFlesh: "#d4a273",
  ropeJute: "#cbb487",
  laundryBlue: "#7fb7d6",
  laundryPink: "#f0a8c2",
  laundryWhite: "#f7f4ec",
  meadowGrass: "#88b06a",
  meadowGrassDark: "#5d8a48",
  brookWater: "#7ec1d8",
  brookBed: "#3a3a3a",
  hillEarth: "#6d8848",
  gutterCopper: "#b3895a",
  wildflowerBlue: "#7891d4",
  wildflowerOrange: "#e69a4a",
  // Sixth enhancement pass — scarecrow, pumpkins, patio set, hanging baskets,
  // a door wreath, a wall hose reel and the side-orchard scene extension
  // (apple trees, fallen apples, hay cart, dry-stone wall and an old well).
  strawHay: "#d8b248",
  strawHayDark: "#a87f2c",
  pumpkinOrange: "#dc7322",
  pumpkinDark: "#b85618",
  pumpkinStem: "#6e8b41",
  scarecrowShirt: "#a83e30",
  scarecrowPants: "#3b4a6a",
  patioCream: "#f3ead4",
  parasolPink: "#ef89a8",
  basketTerracotta: "#b46342",
  wreathBerry: "#b53a3a",
  hoseGreen: "#2c6741",
  brass: "#a87a3c",
  orchardGrass: "#90b76a",
  appleRed: "#c9322e",
  appleStem: "#5e3c1f",
  appleFoliage: "#4f7a3f",
  dryStone: "#9d9286",
  dryStoneDark: "#6a635a",
  hayCartWood: "#7c5536",
  wellRoof: "#5c3f2c",
  wellWater: "#3a5a72",
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

/* ─────────────── third-pass courtyard enhancements ─────────────── */

/**
 * A small raised vegetable plot — a low timber frame filled with soil, planted
 * with rows of tomato stakes hung with ripe fruit and a few cabbage heads.
 */
function buildVegetableGarden(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.walnut, 0.85, { texture: "wood" });
  const bedW = 1.8;
  const bedD = 1.2;
  const railH = 0.22;
  const parts: SceneNode[] = [
    f.mesh("Frame Front", box(bedW + 0.16, railH, 0.08), wood, {
      position: [0, railH / 2, bedD / 2 + 0.04],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Frame Back", box(bedW + 0.16, railH, 0.08), wood, {
      position: [0, railH / 2, -bedD / 2 - 0.04],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Frame Left", box(0.08, railH, bedD), wood, {
      position: [-bedW / 2 - 0.04, railH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Frame Right", box(0.08, railH, bedD), wood, {
      position: [bedW / 2 + 0.04, railH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Soil", box(bedW, railH - 0.04, bedD), std(C.soil, 0.95, { flatShading: true }), {
      position: [0, (railH - 0.04) / 2 + 0.02, 0],
    }, { receiveShadow: true }),
  ];
  // Two rows of tomato stakes laced with ripe fruit.
  const stakeMat = std(C.foliage, 0.85, { flatShading: true });
  const tomatoMat = std(C.mailboxRed, 0.55, { flatShading: true });
  for (const rz of [-0.32, 0.32]) {
    for (let i = 0; i < 3; i++) {
      const sx = -0.6 + i * 0.6;
      parts.push(
        f.mesh("Tomato Stake", cylinder(0.018, 0.024, 0.7, 5), stakeMat, {
          position: [sx, 0.35 + 0.02, rz],
        }, { castShadow: true }),
      );
      // Two fruits per stake.
      for (const fy of [0.28, 0.5]) {
        parts.push(
          f.mesh("Tomato", sphere(0.06, 8, 6), tomatoMat, {
            position: [sx + (rz < 0 ? 0.05 : -0.05), fy, rz + 0.02],
          }, { castShadow: true }),
        );
      }
    }
  }
  // A short row of cabbages along the front edge.
  for (let i = 0; i < 4; i++) {
    const cx = -bedW / 2 + 0.27 + i * 0.42;
    parts.push(
      f.mesh(
        "Cabbage",
        sphere(0.14, 10, 7),
        std(C.hedge, 0.8, { flatShading: true }),
        { position: [cx, 0.22, 0.08], scale: [1, 0.7, 1] },
        { castShadow: true },
      ),
    );
  }
  return f.group("Vegetable Garden", parts, { position: pos });
}

/**
 * A whimsical garden gnome — pointed cap, round body, stub feet — small enough
 * to peek out from the lawn near the bench without dominating the courtyard.
 */
function buildGardenGnome(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const skin = std("#f0c8a4", 0.85);
  const beard = std(C.white, 0.9);
  const tunic = std(C.gnomeBlue, 0.85);
  const boot = std(C.walnut, 0.8);
  return f.group("Garden Gnome", [
    f.mesh("Boot L", box(0.07, 0.07, 0.09), boot, { position: [-0.05, 0.035, 0] }, { castShadow: true }),
    f.mesh("Boot R", box(0.07, 0.07, 0.09), boot, { position: [0.05, 0.035, 0] }, { castShadow: true }),
    f.mesh(
      "Body",
      cone(0.16, 0.34, 12),
      tunic,
      { position: [0, 0.24, 0] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh("Head", sphere(0.12, 12, 9), skin, { position: [0, 0.5, 0] }, { castShadow: true }),
    f.mesh(
      "Beard",
      cone(0.1, 0.22, 10),
      beard,
      { position: [0, 0.42, 0.04], rotation: [Math.PI, 0, 0] },
      { castShadow: true },
    ),
    f.mesh("Nose", sphere(0.028, 6, 5), std("#d49678", 0.85), {
      position: [0, 0.5, 0.115],
    }),
    f.mesh(
      "Cap",
      cone(0.16, 0.4, 12),
      std(C.mailboxRed, 0.75, { flatShading: true }),
      { position: [0, 0.78, 0] },
      { castShadow: true },
    ),
    f.mesh("Cap Tip", sphere(0.04, 8, 6), std(C.flowerYellow, 0.6), {
      position: [0, 1.0, 0],
    }),
  ], { position: pos });
}

/** A trad red-flag mailbox on a slim post, planted just inside the garden gate. */
function buildMailbox(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const post = std(C.walnut, 0.8, { texture: "wood" });
  const body = std(C.mailboxRed, 0.65, { flatShading: true });
  const metal = std(C.ironGrey, 0.5, { metalness: 0.4 });
  const flag = std(C.mailboxRed, 0.55);
  const boxL = 0.42;
  const boxH = 0.24;
  const boxD = 0.22;
  return f.group("Mailbox", [
    f.mesh("Post", box(0.08, 1.1, 0.08), post, { position: [0, 0.55, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    // Cross brace under the box, for the period look.
    f.mesh("Plinth", box(0.32, 0.05, 0.18), post, { position: [0, 1.12, 0] }, {
      castShadow: true,
    }),
    // The box itself — flat walls plus a half-cylinder lid suggested by a top slab.
    f.mesh("Box", box(boxL, boxH, boxD), body, { position: [0, 1.28, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh(
      "Box Lid",
      cylinder(boxD / 2, boxD / 2, boxL, 12),
      body,
      { position: [0, 1.41, 0], rotation: [0, 0, Math.PI / 2] },
      { castShadow: true },
    ),
    // Front door plate and knob.
    f.mesh("Front Plate", box(boxL - 0.04, boxH - 0.05, 0.015), std(C.brickDark, 0.8), {
      position: [0, 1.28, boxD / 2 + 0.008],
    }),
    f.mesh("Knob", sphere(0.018, 8, 6), metal, {
      position: [boxL / 2 - 0.06, 1.28, boxD / 2 + 0.022],
    }),
    // Raised flag on the side of the box.
    f.mesh("Flag Pole", cylinder(0.012, 0.012, 0.18, 6), metal, {
      position: [-boxL / 2 - 0.02, 1.36, 0],
    }, { castShadow: true }),
    f.mesh("Flag", box(0.18, 0.1, 0.01), flag, {
      position: [-boxL / 2 - 0.11, 1.42, 0],
    }, { castShadow: true }),
  ], { position: pos, rotation: [0, -Math.PI / 12, 0] });
}

/**
 * A wrought-iron shepherd's hook bearing a small bird feeder — a hexagonal
 * seed hopper under a pitched roof, with a perch ring for visiting finches.
 */
function buildBirdFeeder(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const iron = std(C.ironGrey, 0.45, { metalness: 0.55 });
  const wood = std(C.walnut, 0.75, { texture: "wood" });
  const roofMat = std(C.roofShingle, 0.8, { flatShading: true });
  const seed = std(C.flowerYellow, 0.6);
  const parts: SceneNode[] = [
    f.mesh("Hook Base", cylinder(0.08, 0.12, 0.12, 10), iron, { position: [0, 0.06, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Hook Pole", cylinder(0.025, 0.03, 1.7, 8), iron, { position: [0, 0.97, 0] }, {
      castShadow: true,
    }),
    // The hook arches forward over the feeder.
    f.mesh("Hook Arm", box(0.45, 0.03, 0.03), iron, {
      position: [0.22, 1.78, 0],
    }, { castShadow: true }),
    f.mesh("Hook Drop", cylinder(0.015, 0.015, 0.12, 6), iron, {
      position: [0.42, 1.72, 0],
    }, { castShadow: true }),
  ];
  // Feeder body, hanging under the hook arm.
  const feeder: SceneNode[] = [
    f.mesh("Roof", cone(0.22, 0.16, 6), roofMat, { position: [0, 0.12, 0] }, {
      castShadow: true,
    }),
    f.mesh("Hopper", cylinder(0.13, 0.13, 0.22, 6), wood, { position: [0, -0.02, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Tray", cylinder(0.18, 0.18, 0.03, 8), wood, { position: [0, -0.15, 0] }, {
      castShadow: true,
    }),
    f.mesh("Perch Ring", cylinder(0.19, 0.19, 0.012, 12), iron, {
      position: [0, -0.13, 0],
    }),
    // A scatter of seed visible through the hopper.
    f.mesh("Seed Mound", sphere(0.09, 8, 6), seed, {
      position: [0, -0.12, 0], scale: [1, 0.4, 1],
    }),
  ];
  parts.push(f.group("Feeder", feeder, { position: [0.42, 1.5, 0] }));
  return f.group("Bird Feeder", parts, { position: pos });
}

/**
 * A staggered file of flat round stones leading off the cobble path to the
 * bird bath — invites a casual stroll across the lawn without trampling it.
 */
function buildSteppingStones(f: NodeFactory): SceneNode {
  const rng = mulberry32(0x57e991e);
  const startX = 1.0;
  const endX = 3.4;
  const n = 5;
  const stones: SceneNode[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = startX + (endX - startX) * t;
    const z = STEPPING_STONE_Z + Math.sin(t * Math.PI) * 0.3 + (rng() - 0.5) * 0.08;
    const r = 0.22 + rng() * 0.05;
    stones.push(
      f.mesh(
        "Stepping Stone",
        cylinder(r, r * 0.95, 0.05, 10),
        std(C.stone, 0.92, { texture: "cobblestone", flatShading: true }),
        { position: [x, 0.025, z], rotation: [0, rng() * Math.PI, 0] },
        { receiveShadow: true },
      ),
    );
  }
  return f.group("Stepping Stones", stones);
}

/* ─────────────── fourth-pass courtyard enhancements ─────────────── */

/**
 * A stone-pedestal sundial with a bronze gnomon — twelve hour marks scribed
 * around the dial face and a tilted blade casting the sun's shadow.
 */
function buildSundial(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const bronze = std(C.bronze, 0.35, { metalness: 0.65 });
  const marks: SceneNode[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    marks.push(
      f.mesh(
        "Hour Mark",
        box(0.026, 0.012, 0.06),
        std(C.brickDark, 0.7),
        {
          position: [Math.cos(a) * 0.28, 0.93, Math.sin(a) * 0.28],
          rotation: [0, -a, 0],
        },
      ),
    );
  }
  // Gnomon blade — a thin right-triangle wedge tilted forward to throw a shadow.
  const tilt = Math.atan2(0.34, 0.4);
  return f.group(
    "Sundial",
    [
      f.mesh("Base", cylinder(0.4, 0.48, 0.12, 14), stone, { position: [0, 0.06, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh("Column", cylinder(0.18, 0.22, 0.72, 12), stone, { position: [0, 0.48, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      f.mesh("Dial", cylinder(0.34, 0.34, 0.04, 20), stone, { position: [0, 0.9, 0] }, {
        castShadow: true,
        receiveShadow: true,
      }),
      ...marks,
      f.mesh(
        "Gnomon",
        box(0.02, 0.4, 0.32),
        bronze,
        { position: [0, 1.06, 0.04], rotation: [-tilt, 0, 0] },
        { castShadow: true },
      ),
      f.mesh("Gnomon Knob", sphere(0.04, 10, 8), bronze, {
        position: [0, 1.22, 0.12],
      }, { castShadow: true }),
    ],
    { position: pos },
  );
}

/**
 * Solar-style stake lights flanking the cobble path — slim posts with small
 * emissive bulbs perched on top, leaving a gap at the rose arch so the path
 * reads as a continuous lit corridor.
 */
function buildPathLights(f: NodeFactory): SceneNode {
  const metal = std(C.lampMetal, 0.55, { metalness: 0.45 });
  const glow: MaterialDef = {
    color: C.lampGlow,
    roughness: 0.32,
    emissive: C.lampGlow,
    transparent: true,
    opacity: 0.92,
  };
  const lights: SceneNode[] = [];
  const zPositions = [2.5, 4.0, 5.6, 9.1, 10.6].map((d) => FRONT_Z + d);
  let idx = 0;
  for (const z of zPositions) {
    for (const side of [-1, 1] as const) {
      idx++;
      lights.push(
        f.group(
          `Path Light ${idx}`,
          [
            f.mesh(
              "Stake",
              cylinder(0.022, 0.022, 0.46, 6),
              metal,
              { position: [0, 0.23, 0] },
              { castShadow: true },
            ),
            f.mesh("Bulb", sphere(0.07, 10, 7), glow, { position: [0, 0.5, 0] }),
            f.mesh(
              "Cap",
              cone(0.09, 0.07, 8),
              metal,
              { position: [0, 0.59, 0] },
              { castShadow: true },
            ),
          ],
          { position: [side * 1.62, 0, z] },
        ),
      );
    }
  }
  return f.group("Path Lights", lights);
}

/**
 * A cottage-style birdhouse on a slender wooden pole, with a pyramidal roof and
 * a circular entry hole — staked into the lawn near the bird feeder.
 */
function buildBirdhouse(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.walnut, 0.78, { texture: "wood" });
  const lightWood = std(C.fence, 0.8, { texture: "wood" });
  const roof = std(C.birdhouseRoof, 0.8, { flatShading: true });
  const dark = std(C.brickDark, 0.85);
  const poleH = 1.6;
  const houseY = poleH + 0.16;
  return f.group(
    "Birdhouse",
    [
      f.mesh(
        "Pole Base",
        cylinder(0.12, 0.16, 0.08, 10),
        std(C.stone, 0.92, { texture: "cobblestone", flatShading: true }),
        { position: [0, 0.04, 0] },
        { receiveShadow: true, castShadow: true },
      ),
      f.mesh(
        "Pole",
        cylinder(0.04, 0.05, poleH, 8),
        wood,
        { position: [0, poleH / 2 + 0.06, 0] },
        { castShadow: true },
      ),
      f.group(
        "House",
        [
          f.mesh(
            "Walls",
            box(0.34, 0.3, 0.34),
            lightWood,
            {},
            { castShadow: true, receiveShadow: true },
          ),
          // Pyramidal roof — a 4-sided cone rotated for square base alignment.
          f.mesh(
            "Roof",
            cone(0.3, 0.24, 4),
            roof,
            { position: [0, 0.27, 0], rotation: [0, Math.PI / 4, 0] },
            { castShadow: true },
          ),
          f.mesh(
            "Entry Hole",
            cylinder(0.05, 0.05, 0.02, 12),
            dark,
            { position: [0, 0.02, 0.17], rotation: [Math.PI / 2, 0, 0] },
          ),
          f.mesh(
            "Perch",
            cylinder(0.012, 0.012, 0.1, 6),
            wood,
            { position: [0, -0.04, 0.21], rotation: [Math.PI / 2, 0, 0] },
            { castShadow: true },
          ),
        ],
        { position: [0, houseY, 0] },
      ),
    ],
    { position: pos, rotation: [0, Math.PI / 9, 0] },
  );
}

/**
 * Festoon-style bulbs strung along the rose-arch crown — a row of small
 * emissive spheres draped over the arc, with the same glow as the lamp post.
 */
function buildRoseArchLights(f: NodeFactory, z: number): SceneNode {
  const postX = 1.05;
  const postH = 2.3;
  const archR = postX;
  const archY = postH;
  const glow: MaterialDef = {
    color: C.lampGlow,
    roughness: 0.3,
    emissive: C.lampGlow,
    transparent: true,
    opacity: 0.95,
  };
  const bulbs: Transform[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const th = (Math.PI * (i + 0.5)) / n;
    const cx = Math.cos(th) * (archR + 0.05);
    const cy = archY + Math.sin(th) * (archR + 0.05) - 0.06;
    bulbs.push({
      position: [cx, cy, 0.02],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
  }
  // A subtle wire suggested by a thin curved set of tiny boxes between bulbs.
  const wireMat = std(C.ironGrey, 0.6, { metalness: 0.4 });
  const wires: SceneNode[] = [];
  for (let i = 0; i < n - 1; i++) {
    const th0 = (Math.PI * (i + 0.5)) / n;
    const th1 = (Math.PI * (i + 1.5)) / n;
    const x0 = Math.cos(th0) * (archR + 0.05);
    const y0 = archY + Math.sin(th0) * (archR + 0.05) - 0.06;
    const x1 = Math.cos(th1) * (archR + 0.05);
    const y1 = archY + Math.sin(th1) * (archR + 0.05) - 0.06;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const rot = Math.atan2(y1 - y0, x1 - x0);
    wires.push(
      f.mesh(
        "Wire",
        box(len, 0.008, 0.008),
        wireMat,
        { position: [mx, my, 0.02], rotation: [0, 0, rot] },
      ),
    );
  }
  return f.group(
    "Rose Arch Lights",
    [
      f.instanced("String Bulbs", sphere(0.055, 8, 6), glow, bulbs, { castShadow: false }),
      f.group("String Wires", wires),
    ],
    { position: [0, 0, z] },
  );
}

/* ─────────────── third-pass house enhancements ─────────────── */

/**
 * A pair of copper downspouts hugging the front corners of the house —
 * vertical pipes carrying water from the eave to a small splash block at the
 * ground, finished with a swept elbow where they meet the wall.
 */
function buildDownspouts(f: NodeFactory): SceneNode {
  const copper = std(C.copperPipe, 0.5, { metalness: 0.45 });
  const splash = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const wallTop = FLOOR_H * 3 - 0.1;
  const pipe = (sideX: number): SceneNode => {
    const x = sideX * (W / 2 + 0.09);
    return f.group(`Downspout ${sideX < 0 ? "L" : "R"}`, [
      // Vertical drop along the front corner of the side wall.
      f.mesh(
        "Pipe",
        cylinder(0.05, 0.05, wallTop, 8),
        copper,
        { position: [x, wallTop / 2, FRONT_Z - 0.12] },
        { castShadow: true },
      ),
      // Top elbow where the pipe meets the gutter line.
      f.mesh(
        "Elbow",
        cylinder(0.05, 0.05, 0.32, 8),
        copper,
        {
          position: [x, wallTop + 0.06, FRONT_Z - 0.04],
          rotation: [Math.PI / 4, 0, 0],
        },
        { castShadow: true },
      ),
      // Bottom shoe nudging water away from the foundation.
      f.mesh(
        "Shoe",
        cylinder(0.05, 0.05, 0.22, 8),
        copper,
        {
          position: [x, 0.08, FRONT_Z + 0.0],
          rotation: [Math.PI / 3, 0, 0],
        },
        { castShadow: true },
      ),
      // Splash block on the ground under the shoe.
      f.mesh(
        "Splash Block",
        box(0.3, 0.05, 0.46),
        splash,
        { position: [x, 0.025, FRONT_Z + 0.18] },
        { receiveShadow: true },
      ),
    ]);
  };
  return f.group("Downspouts", [pipe(-1), pipe(1)]);
}

/**
 * A welcome mat and short stone step outside the front door — a low slab
 * extending the porch lip toward the cobble path, with a banded jute mat
 * on the porch above to wipe muddy boots.
 */
function buildDoorstepMat(f: NodeFactory): SceneNode {
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const mat = std(C.doormatJute, 0.95, { flatShading: true });
  const matBorder = std(C.walnut, 0.85, { flatShading: true });
  // Porch slab top sits at y ≈ 0.12; its front edge at z ≈ FRONT_Z + 0.75.
  const stepZ = FRONT_Z + 0.82;
  const matZ = FRONT_Z + 0.4;
  return f.group("Front Step", [
    // Short stone step nestled between the porch lip and the first cobble row.
    f.mesh("Step Slab", box(1.4, 0.07, 0.2), stone, {
      position: [0, 0.085, stepZ],
    }, { receiveShadow: true, castShadow: true }),
    // Woven jute mat sitting on the porch in front of the door.
    f.mesh("Mat Border", box(0.92, 0.012, 0.46), matBorder, {
      position: [0, 0.127, matZ],
    }, { receiveShadow: true }),
    f.mesh("Mat", box(0.84, 0.014, 0.38), mat, {
      position: [0, 0.13, matZ],
    }, { receiveShadow: true }),
  ]);
}

/**
 * A pair of terracotta urns flanking the door, each cradling a clipped
 * topiary ball — placed inside the canopy posts on the porch.
 */
function buildTopiaryUrns(f: NodeFactory): SceneNode {
  const urn = std(C.terracotta, 0.85, { flatShading: true });
  const leaf = std(C.hedge, 0.85, { flatShading: true });
  const ballMat = std(C.hedge, 0.8, { flatShading: true });
  const make = (sideX: number): SceneNode => {
    const x = sideX * 0.95;
    return f.group(`Topiary ${sideX < 0 ? "L" : "R"}`, [
      f.mesh("Urn Foot", cylinder(0.15, 0.18, 0.06, 12), urn, {
        position: [0, 0.03, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Urn Body", cylinder(0.2, 0.14, 0.34, 12), urn, {
        position: [0, 0.23, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Urn Rim", cylinder(0.22, 0.21, 0.05, 12), urn, {
        position: [0, 0.42, 0],
      }, { castShadow: true }),
      // Trunk rising out of the soil to support the ball.
      f.mesh("Trunk", cylinder(0.025, 0.028, 0.22, 6), std(C.bark, 0.85), {
        position: [0, 0.55, 0],
      }, { castShadow: true }),
      // Clipped boxwood ball.
      f.mesh("Topiary Ball", sphere(0.24, 14, 10), ballMat, {
        position: [0, 0.78, 0],
      }, { castShadow: true }),
      // A few sprigs of leafy fill softening the join at the rim.
      f.mesh("Leaf Tuft Front", sphere(0.09, 8, 6), leaf, {
        position: [0, 0.46, 0.14], scale: [1.1, 0.5, 1.1],
      }),
      f.mesh("Leaf Tuft Back", sphere(0.09, 8, 6), leaf, {
        position: [0, 0.46, -0.14], scale: [1.1, 0.5, 1.1],
      }),
    ], { position: [x, 0, FRONT_Z + 0.18] });
  };
  return f.group("Topiary Urns", [make(-1), make(1)]);
}

/* ─────────────── fourth-pass house enhancements ─────────────── */

/**
 * Climbing ivy clinging to the chimney's south and east faces — an instanced
 * scatter of small dark-green leaf clusters, denser at the base and thinning
 * out toward the crown for the windswept look.
 */
function buildChimneyIvy(f: NodeFactory): SceneNode {
  const ivy = std(C.ivyLeaf, 0.85, { flatShading: true });
  const cx = -2.0;
  const cz = 0.7;
  const yBottom = 8.2;
  const yTop = 11.1;
  const rng = mulberry32(0x190a55e);
  const instances: Transform[] = [];
  // South face (z = cz + 0.31). Density decays with height.
  for (let yy = yBottom; yy < yTop; yy += 0.16) {
    const heightT = (yy - yBottom) / (yTop - yBottom);
    const dropRate = 0.25 + heightT * 0.55;
    for (let xx = -0.28; xx <= 0.28; xx += 0.14) {
      if (rng() < dropRate) continue;
      instances.push({
        position: [
          cx + xx + (rng() - 0.5) * 0.08,
          yy + (rng() - 0.5) * 0.08,
          cz + 0.32 + rng() * 0.03,
        ],
        rotation: [0, rng() * Math.PI * 2, 0],
        scale: [0.75 + rng() * 0.55, 0.6 + rng() * 0.5, 0.75 + rng() * 0.55],
      });
    }
  }
  // East face (x = cx + 0.31). A second, sparser fall of leaves.
  for (let yy = yBottom; yy < yTop - 0.5; yy += 0.2) {
    const heightT = (yy - yBottom) / (yTop - yBottom);
    const dropRate = 0.4 + heightT * 0.5;
    for (let zz = -0.26; zz <= 0.26; zz += 0.16) {
      if (rng() < dropRate) continue;
      instances.push({
        position: [
          cx + 0.32 + rng() * 0.03,
          yy + (rng() - 0.5) * 0.08,
          cz + zz + (rng() - 0.5) * 0.07,
        ],
        rotation: [0, rng() * Math.PI * 2, 0],
        scale: [0.7 + rng() * 0.5, 0.6 + rng() * 0.4, 0.7 + rng() * 0.5],
      });
    }
  }
  return f.instanced("Chimney Ivy", sphere(0.085, 7, 5), ivy, instances, {
    castShadow: true,
    receiveShadow: true,
  });
}

/**
 * A small wrought-iron lightning rod planted on top of the chimney crown —
 * a tapered spire with a single decorative orb halfway up the shaft.
 */
function buildLightningRod(f: NodeFactory): SceneNode {
  const iron = std(C.ironGrey, 0.4, { metalness: 0.65 });
  const cx = -2.0;
  const cz = 0.7;
  const crownTop = 11.25;
  return f.group("Lightning Rod", [
    f.mesh("Rod Foot", cylinder(0.06, 0.08, 0.06, 10), iron, {
      position: [cx, crownTop + 0.03, cz],
    }, { castShadow: true }),
    f.mesh("Rod Shaft", cylinder(0.014, 0.02, 0.62, 8), iron, {
      position: [cx, crownTop + 0.37, cz],
    }, { castShadow: true }),
    f.mesh("Rod Orb", sphere(0.045, 10, 8), iron, {
      position: [cx, crownTop + 0.42, cz],
    }, { castShadow: true }),
    f.mesh("Rod Spire", cone(0.022, 0.18, 6), iron, {
      position: [cx, crownTop + 0.78, cz],
    }, { castShadow: true }),
  ]);
}

/* ─────────────── fifth-pass courtyard enhancements ─────────────── */

/**
 * A small wooden garden shed — board-and-batten walls, a pitched shingle
 * roof, a single plank door on the south face and a side window. Footprint
 * roughly 1.6 × 1.2 m, the eave ~1.6 m off the ground.
 */
function buildGardenShed(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wall = std(C.shedWall, 0.85, { texture: "wood", textureScale: [2, 1] });
  const roofMat = std(C.shedRoof, 0.9, { flatShading: true });
  const trim = std(C.shedTrim, 0.7);
  const door = std(C.doorWood, 0.7, { texture: "wood" });
  const w = 1.6;
  const d = 1.2;
  const wallH = 1.6;
  const peakH = 0.5;
  const eaveOver = 0.12;
  const parts: SceneNode[] = [
    // Walls.
    f.mesh("Wall N", box(w, wallH, 0.06), wall, {
      position: [0, wallH / 2, -d / 2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall E", box(0.06, wallH, d), wall, {
      position: [w / 2, wallH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall W", box(0.06, wallH, d), wall, {
      position: [-w / 2, wallH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // South wall split around the door — two narrow strips.
    f.mesh("Wall S L", box((w - 0.7) / 2, wallH, 0.06), wall, {
      position: [-w / 2 + (w - 0.7) / 4, wallH / 2, d / 2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall S R", box((w - 0.7) / 2, wallH, 0.06), wall, {
      position: [w / 2 - (w - 0.7) / 4, wallH / 2, d / 2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall S Top", box(0.7, wallH - 1.5, 0.06), wall, {
      position: [0, 1.5 + (wallH - 1.5) / 2, d / 2],
    }, { castShadow: true, receiveShadow: true }),
    // Door panel, slightly recessed.
    f.mesh("Shed Door", box(0.66, 1.45, 0.04), door, {
      position: [0, 0.725, d / 2 + 0.02],
    }, { castShadow: true }),
    f.mesh("Door Handle", sphere(0.035, 8, 6), std(C.bronze, 0.4, { metalness: 0.6 }), {
      position: [0.22, 0.78, d / 2 + 0.05],
    }, { castShadow: true }),
    // Side window with a single mullion cross.
    f.mesh("Window Frame", box(0.04, 0.36, 0.36), trim, {
      position: [w / 2 + 0.005, 1.1, 0],
    }, { castShadow: true }),
    f.mesh("Window Glass", plane(0.32, 0.32), {
      color: C.glass,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
    }, {
      position: [w / 2 + 0.026, 1.1, 0],
      rotation: [0, Math.PI / 2, 0],
    }),
    f.mesh("Window Mullion V", box(0.005, 0.32, 0.025), trim, {
      position: [w / 2 + 0.027, 1.1, 0],
    }),
    f.mesh("Window Mullion H", box(0.005, 0.025, 0.32), trim, {
      position: [w / 2 + 0.027, 1.1, 0],
    }),
    // Triangular gable infill on east and west walls.
    f.mesh("Gable E", {
      type: "buffer",
      attributes: {
        position: [
          -d / 2, 0, 0,
          d / 2, 0, 0,
          0, peakH, 0,
        ],
        normal: [1, 0, 0, 1, 0, 0, 1, 0, 0],
      },
    }, { ...wall, side: "double" }, {
      position: [w / 2 - 0.01, wallH, 0],
      rotation: [0, Math.PI / 2, 0],
    }, { castShadow: true }),
    f.mesh("Gable W", {
      type: "buffer",
      attributes: {
        position: [
          -d / 2, 0, 0,
          d / 2, 0, 0,
          0, peakH, 0,
        ],
        normal: [-1, 0, 0, -1, 0, 0, -1, 0, 0],
      },
    }, { ...wall, side: "double" }, {
      position: [-w / 2 + 0.01, wallH, 0],
      rotation: [0, -Math.PI / 2, 0],
    }, { castShadow: true }),
    // Two pitched roof slabs meeting along the ridge.
    f.mesh("Roof N", box(w + eaveOver * 2, 0.04, Math.hypot(d / 2, peakH) + eaveOver), roofMat, {
      position: [0, wallH + peakH / 2 - 0.02, -d / 4],
      rotation: [Math.atan2(peakH, d / 2), 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof S", box(w + eaveOver * 2, 0.04, Math.hypot(d / 2, peakH) + eaveOver), roofMat, {
      position: [0, wallH + peakH / 2 - 0.02, d / 4],
      rotation: [-Math.atan2(peakH, d / 2), 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Stone footing band where the walls meet the ground.
    f.mesh("Footing", box(w + 0.1, 0.08, d + 0.1), std(C.stone, 0.92, { texture: "cobblestone" }), {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
  ];
  return f.group("Garden Shed", parts, { position: pos, rotation: [0, -0.1, 0] });
}

/**
 * A neatly stacked pile of split firewood — short cylinders rotated end-on,
 * built up in three rows behind a low log retainer.
 */
function buildFirewoodPile(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const bark = std(C.logBark, 0.9, { texture: "bark", flatShading: true });
  const flesh = std(C.logFlesh, 0.85, { flatShading: true });
  const logLen = 0.34;
  const logR = 0.07;
  const rng = mulberry32(0xf17e057);
  // Two side retainer logs running along z.
  const parts: SceneNode[] = [
    f.mesh("Retainer L", cylinder(logR, logR, 1.1, 8), bark, {
      position: [-0.55, logR, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Retainer R", cylinder(logR, logR, 1.1, 8), bark, {
      position: [0.55, logR, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true, receiveShadow: true }),
  ];
  // Stacked split logs — three rows, ends facing along x.
  const rows = 4;
  const cols = 5;
  const colSpacing = 0.16;
  const rowSpacing = logR * 2 + 0.005;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xOff = (c - (cols - 1) / 2) * colSpacing + (r % 2 === 0 ? 0 : colSpacing / 2);
      // Skip a few logs on the top row for a lived-in look.
      if (r === rows - 1 && (c === 0 || c === cols - 1)) continue;
      const y = logR + 0.08 + r * rowSpacing;
      const tilt = (rng() - 0.5) * 0.18;
      parts.push(
        f.mesh("Log", cylinder(logR, logR, logLen, 6), bark, {
          position: [xOff, y, (rng() - 0.5) * 0.04],
          rotation: [Math.PI / 2 + tilt, rng() * Math.PI * 2, 0],
        }, { castShadow: true, receiveShadow: true }),
      );
      // Pale end-grain disc so the cut face reads on the stack.
      parts.push(
        f.mesh("Log End", cylinder(logR * 0.95, logR * 0.95, 0.012, 6), flesh, {
          position: [xOff, y, logLen / 2 + 0.008],
          rotation: [Math.PI / 2, 0, 0],
        }),
      );
    }
  }
  return f.group("Firewood Pile", parts, { position: pos, rotation: [0, Math.PI / 8, 0] });
}

/**
 * A free-standing A-frame garden swing — two angled leg pairs joined by a
 * top crossbar, with a wooden plank seat hung from twin jute ropes.
 */
function buildTreeSwing(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.walnut, 0.7, { texture: "wood" });
  const rope = std(C.ropeJute, 0.95, { flatShading: true });
  const beamY = 2.0;
  const beamHalf = 1.2;
  const legLen = Math.hypot(beamY, 0.7);
  const legAngle = Math.atan2(0.7, beamY);
  const ropeLen = 1.25;
  const seatY = beamY - ropeLen;
  const leg = (sideZ: number, sideX: number): SceneNode =>
    f.mesh("Leg", cylinder(0.06, 0.07, legLen, 8), wood, {
      position: [sideX * 0.35, beamY / 2, sideZ * 0.35],
      rotation: [sideZ * legAngle, 0, -sideX * legAngle],
    }, { castShadow: true, receiveShadow: true });
  return f.group("Garden Swing", [
    // Crossbar.
    f.mesh("Crossbar", cylinder(0.06, 0.06, beamHalf * 2, 8), wood, {
      position: [0, beamY, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    // Four A-frame legs.
    leg(1, 1),
    leg(1, -1),
    leg(-1, 1),
    leg(-1, -1),
    // Seat plank.
    f.mesh("Seat", box(0.78, 0.05, 0.24), wood, {
      position: [0, seatY, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Twin ropes.
    f.mesh("Rope L", cylinder(0.015, 0.015, ropeLen, 6), rope, {
      position: [-0.3, beamY - ropeLen / 2, 0],
    }, { castShadow: true }),
    f.mesh("Rope R", cylinder(0.015, 0.015, ropeLen, 6), rope, {
      position: [0.3, beamY - ropeLen / 2, 0],
    }, { castShadow: true }),
  ], { position: pos, rotation: [0, Math.PI / 2, 0] });
}

/**
 * A washing line strung between two T-shaped posts, with three pieces of
 * laundry pegged out on the line. Hangs along the +Z axis from the anchor pos.
 */
function buildClothesline(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.walnut, 0.8, { texture: "wood" });
  const rope = std(C.ropeJute, 0.95);
  const postH = 1.7;
  const span = 2.6;
  const post = (zOff: number): SceneNode =>
    f.group("Clothesline Post", [
      f.mesh("Post", cylinder(0.06, 0.07, postH, 8), wood, {
        position: [0, postH / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Crossarm", box(0.7, 0.06, 0.06), wood, {
        position: [0, postH - 0.04, 0],
      }, { castShadow: true }),
    ], { position: [0, 0, zOff] });
  // Two rope lines (front and back of the cross arm).
  const ropeLine = (xOff: number): SceneNode =>
    f.mesh("Line", cylinder(0.008, 0.008, span, 5), rope, {
      position: [xOff, postH - 0.06, 0],
      rotation: [Math.PI / 2, 0, 0],
    });
  // Three pieces of laundry pegged to the front line.
  const laundry = (zOff: number, w: number, h: number, color: string): SceneNode =>
    f.group("Laundry", [
      f.mesh("Sheet", box(w, h, 0.005), std(color, 0.9, { flatShading: true }), {
        position: [0, postH - 0.06 - h / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Peg L", box(0.04, 0.05, 0.02), std(C.walnut, 0.7), {
        position: [-w / 2 + 0.04, postH - 0.06, 0],
      }),
      f.mesh("Peg R", box(0.04, 0.05, 0.02), std(C.walnut, 0.7), {
        position: [w / 2 - 0.04, postH - 0.06, 0],
      }),
    ], { position: [-0.2, 0, zOff] });
  return f.group("Clothesline", [
    post(-span / 2),
    post(span / 2),
    ropeLine(-0.2),
    ropeLine(0.2),
    laundry(-0.85, 0.55, 0.7, C.laundryWhite),
    laundry(0, 0.7, 0.85, C.laundryBlue),
    laundry(0.85, 0.6, 0.55, C.laundryPink),
  ], { position: pos });
}

/* ─────────────── fifth-pass house enhancements ─────────────── */

/**
 * Copper half-round gutters running along the lower edge of each roof pitch,
 * positioned just below the eave so rainwater can flow into the existing
 * downspouts at the front corners.
 */
function buildRoofGutters(f: NodeFactory): SceneNode {
  const copper = std(C.gutterCopper, 0.5, { metalness: 0.4 });
  const roofDepth = D + 0.6;
  const eaveOut = W / 2 + 0.4;
  // Y at the eave (bottom of the roof pitch) computed in world space.
  const eaveY = ROOF_TOP + 0.04;
  const gutter = (sideX: 1 | -1): SceneNode => {
    const parts: SceneNode[] = [
      // Half-round trough sitting just below the eave, opening upward.
      f.mesh("Trough", cylinder(0.07, 0.07, roofDepth, 8), copper, {
        position: [sideX * eaveOut, eaveY, 0],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      // End caps so the trough reads as closed.
      f.mesh("Cap Front", cylinder(0.075, 0.075, 0.04, 8), copper, {
        position: [sideX * eaveOut, eaveY, roofDepth / 2],
        rotation: [Math.PI / 2, 0, 0],
      }),
      f.mesh("Cap Back", cylinder(0.075, 0.075, 0.04, 8), copper, {
        position: [sideX * eaveOut, eaveY, -roofDepth / 2],
        rotation: [Math.PI / 2, 0, 0],
      }),
    ];
    // Three little hangers strapping the trough to the eave board.
    for (const z of [-roofDepth / 2 + 0.4, 0, roofDepth / 2 - 0.4]) {
      parts.push(
        f.mesh("Hanger", box(0.04, 0.12, 0.025), copper, {
          position: [sideX * (eaveOut - 0.05), eaveY + 0.08, z],
        }, { castShadow: true }),
      );
    }
    return f.group(`Gutter ${sideX < 0 ? "L" : "R"}`, parts);
  };
  return f.group("Roof Gutters", [gutter(-1), gutter(1)]);
}

/**
 * Decorative white porch railings flanking the front step — two short balusters
 * topped by a rounded handrail, one on either side of the path.
 */
function buildPorchRailings(f: NodeFactory): SceneNode {
  const paint = std(C.white, 0.7);
  const railZ = FRONT_Z + 0.4;
  const make = (sideX: 1 | -1): SceneNode => {
    const x = sideX * 1.15;
    const balusters: SceneNode[] = [];
    for (let i = 0; i < 3; i++) {
      balusters.push(
        f.mesh("Baluster", cylinder(0.025, 0.025, 0.42, 6), paint, {
          position: [0, 0.31, -0.18 + i * 0.18],
        }, { castShadow: true }),
      );
    }
    return f.group(`Porch Rail ${sideX < 0 ? "L" : "R"}`, [
      f.mesh("Newel", box(0.1, 0.6, 0.1), paint, {
        position: [0, 0.3, -0.28],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Newel Cap", sphere(0.07, 10, 8), paint, {
        position: [0, 0.65, -0.28],
      }, { castShadow: true }),
      f.mesh("Newel F", box(0.1, 0.5, 0.1), paint, {
        position: [0, 0.25, 0.28],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Newel F Cap", sphere(0.06, 10, 8), paint, {
        position: [0, 0.55, 0.28],
      }, { castShadow: true }),
      f.mesh("Top Rail", box(0.06, 0.05, 0.62), paint, {
        position: [0, 0.55, 0],
      }, { castShadow: true }),
      f.mesh("Bottom Rail", box(0.06, 0.04, 0.62), paint, {
        position: [0, 0.18, 0],
      }, { castShadow: true }),
      ...balusters,
    ], { position: [x, 0, railZ] });
  };
  return f.group("Porch Railings", [make(-1), make(1)]);
}

/* ─────────────── fifth-pass meadow extension ─────────────── */

/**
 * A back-meadow ground plane that extends the scene beyond the rear fence.
 * Authored as a gently undulating field — the base plane sits at y≈0, with
 * a low rolling hill, a meandering brook, a wooden footbridge and a scatter
 * of wild flowers and meadow trees layered on top of it.
 *
 * The meadow plane's front edge (z = -10) overlaps the main lawn's back edge
 * (z = -17) by ~7 units, so the ground layer has no holes along the join.
 */
function buildBackMeadow(f: NodeFactory): SceneNode {
  return f.group("Back Meadow", [
    // The meadow ground plane itself — slightly darker / yellower than the lawn.
    f.mesh(
      "Meadow Ground",
      plane(MEADOW_W, MEADOW_D),
      std(C.meadowGrass, 0.95, { texture: "grass", textureScale: [12, 8] }),
      { position: MEADOW_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // A subtle darker patch hinting at the join with the lawn.
    f.mesh(
      "Meadow Apron",
      plane(MEADOW_W, 4),
      std(C.meadowGrassDark, 0.95, { texture: "grass", textureScale: [10, 1] }),
      { position: [0, -0.004, -13], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    buildMeadowHill(f, MEADOW_HILL_POS),
    buildMeadowBrook(f),
    buildFootbridge(f, FOOTBRIDGE_POS),
    buildWildflowers(f),
    buildMeadowTrees(f),
    buildMeadowFence(f),
  ]);
}

/**
 * A low rolling hill rising out of the meadow — a flattened sphere half-buried
 * at the anchor point, with a few small boulders perched on its flank.
 */
function buildMeadowHill(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const earth = std(C.hillEarth, 0.95, { flatShading: true });
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const rng = mulberry32(0xa11b057);
  const boulders: SceneNode[] = [];
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const rr = 2.6 + rng() * 1.4;
    boulders.push(
      f.mesh("Boulder", sphere(0.4 + rng() * 0.35, 9, 7), stone, {
        position: [Math.cos(a) * rr, 0.6 + rng() * 0.5, Math.sin(a) * rr],
        scale: [1, 0.7 + rng() * 0.3, 1],
        rotation: [rng() * 0.4, rng() * Math.PI, rng() * 0.4],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  return f.group("Meadow Hill", [
    f.mesh("Hill Mound", sphere(4.5, 18, 12), earth, {
      position: [0, 0.3, 0],
      scale: [1, 0.42, 1.1],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Hill Crown", sphere(2.6, 14, 10), std(C.meadowGrassDark, 0.95, { flatShading: true }), {
      position: [0, 1.4, 0],
      scale: [1, 0.5, 1],
    }, { castShadow: true, receiveShadow: true }),
    ...boulders,
  ], { position: pos });
}

/**
 * A meandering brook flowing east-to-west across the meadow at z=MEADOW_BROOK_Z.
 * Implemented as a long flat strip of water tucked into a stone-lined channel,
 * with a small cluster of reeds at one end where the water disappears.
 */
function buildMeadowBrook(f: NodeFactory): SceneNode {
  const water = {
    color: C.brookWater,
    roughness: 0.1,
    metalness: 0.25,
    transparent: true,
    opacity: 0.78,
  };
  const bed = std(C.brookBed, 0.95, { flatShading: true });
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const rng = mulberry32(0xb700c);
  const brookLen = 18;
  const brookW = 1.4;
  // Curved stones lining the banks.
  const bankStones: Transform[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      const x = -brookLen / 2 + t * brookLen + (rng() - 0.5) * 0.3;
      const z = side * (brookW / 2 + 0.05 + rng() * 0.08);
      bankStones.push({
        position: [x, 0.07 + rng() * 0.06, z],
        rotation: [0, rng() * Math.PI, 0],
        scale: [0.22 + rng() * 0.16, 0.16 + rng() * 0.1, 0.22 + rng() * 0.16],
      });
    }
  }
  return f.group("Meadow Brook", [
    // Stone-lined channel bed sits a few centimetres below ground level.
    f.mesh("Brook Bed", box(brookLen, 0.04, brookW + 0.3), bed, {
      position: [0, -0.01, 0],
    }, { receiveShadow: true }),
    // The water surface itself, slightly inset from the banks.
    f.mesh("Brook Water", box(brookLen, 0.06, brookW), water, {
      position: [0, 0.03, 0],
    }, { receiveShadow: true }),
    // Subtle current ripples — a thin highlight strip on the water.
    f.mesh("Brook Highlight", box(brookLen - 0.4, 0.005, brookW * 0.3), {
      color: C.laundryWhite,
      roughness: 0.05,
      transparent: true,
      opacity: 0.18,
    }, { position: [0, 0.062, 0] }),
    f.instanced("Brook Bank Stones", box(1, 1, 1), stone, bankStones, {
      castShadow: true,
      receiveShadow: true,
    }),
  ], { position: [0, 0, MEADOW_BROOK_Z] });
}

/**
 * A short wooden footbridge spanning the meadow brook — two stringers, a deck
 * of planks and a simple handrail of slender uprights and top rails.
 */
function buildFootbridge(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.walnut, 0.7, { texture: "wood" });
  const trim = std(C.fence, 0.8, { texture: "bark", flatShading: true });
  const bridgeLen = 2.2;
  const bridgeW = 1.2;
  const deckY = 0.2;
  const railH = 0.6;
  const parts: SceneNode[] = [
    // Two stringers under the deck.
    f.mesh("Stringer L", box(0.08, 0.12, bridgeLen), wood, {
      position: [-bridgeW / 2 + 0.1, deckY - 0.08, 0],
    }, { castShadow: true }),
    f.mesh("Stringer R", box(0.08, 0.12, bridgeLen), wood, {
      position: [bridgeW / 2 - 0.1, deckY - 0.08, 0],
    }, { castShadow: true }),
  ];
  // Deck planks running across the bridge.
  const planks = 11;
  const plankD = bridgeLen / planks;
  for (let i = 0; i < planks; i++) {
    parts.push(
      f.mesh("Deck Plank", box(bridgeW, 0.04, plankD * 0.94), wood, {
        position: [0, deckY, -bridgeLen / 2 + plankD * (i + 0.5)],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Handrail uprights and top rails.
  for (const side of [-1, 1] as const) {
    const x = side * bridgeW / 2;
    parts.push(
      f.mesh("Rail Post Front", box(0.06, railH, 0.06), trim, {
        position: [x, deckY + railH / 2, bridgeLen / 2 - 0.06],
      }, { castShadow: true }),
      f.mesh("Rail Post Back", box(0.06, railH, 0.06), trim, {
        position: [x, deckY + railH / 2, -bridgeLen / 2 + 0.06],
      }, { castShadow: true }),
      f.mesh("Top Rail", box(0.05, 0.05, bridgeLen - 0.18), trim, {
        position: [x, deckY + railH - 0.025, 0],
      }, { castShadow: true }),
    );
    // A pair of slimmer mid balusters per side.
    for (let i = 1; i <= 2; i++) {
      const zPos = -bridgeLen / 2 + (bridgeLen / 3) * i;
      parts.push(
        f.mesh("Baluster", box(0.03, railH - 0.05, 0.03), trim, {
          position: [x, deckY + (railH - 0.05) / 2, zPos],
        }, { castShadow: true }),
      );
    }
  }
  return f.group("Footbridge", parts, { position: pos, rotation: [0, Math.PI / 2, 0] });
}

/**
 * Scattered wildflowers across the meadow — small bloom puffs in blue, orange
 * and yellow on top of low green stems. Concentrated away from the hill, brook
 * and tree-keepout circles so the meadow feels lived-in but uncluttered.
 */
function buildWildflowers(f: NodeFactory): SceneNode {
  const rng = mulberry32(0xfeedb107);
  const palette = [
    { stem: C.meadowGrassDark, bloom: C.wildflowerBlue },
    { stem: C.meadowGrassDark, bloom: C.wildflowerOrange },
    { stem: C.meadowGrassDark, bloom: C.flowerYellow },
    { stem: C.meadowGrassDark, bloom: C.flowerWhite },
  ];
  const groups: Record<string, Transform[]> = {};
  for (const p of palette) groups[p.bloom] = [];
  const tryPlace = (count: number): void => {
    let attempts = 0;
    let placed = 0;
    while (placed < count && attempts < count * 6) {
      attempts++;
      const x = MEADOW_POS[0] + (rng() - 0.5) * (MEADOW_W - 4);
      const z = MEADOW_POS[2] + (rng() - 0.5) * (MEADOW_D - 4);
      // Avoid the brook channel.
      if (Math.abs(z - MEADOW_BROOK_Z) < 1.0) continue;
      // Avoid the hill base.
      if (Math.hypot(x - MEADOW_HILL_POS[0], z - MEADOW_HILL_POS[2]) < 4.0) continue;
      const choice = palette[Math.floor(rng() * palette.length)] ?? palette[0]!;
      const s = 0.7 + rng() * 0.5;
      groups[choice.bloom]!.push({
        position: [x, 0, z],
        rotation: [0, rng() * Math.PI, 0],
        scale: [s, s, s],
      });
      placed++;
    }
  };
  tryPlace(80);
  const result: SceneNode[] = [];
  for (const p of palette) {
    const list = groups[p.bloom]!;
    if (list.length === 0) continue;
    // Stem instance — one per color, instanced.
    result.push(
      f.instanced(`Stems ${p.bloom}`, cylinder(0.012, 0.018, 0.22, 4),
        std(p.stem, 0.85, { flatShading: true }),
        list.map((t) => ({ ...t, position: [t.position[0], 0.11, t.position[2]] })),
        { castShadow: false }),
    );
    // Bloom puff.
    result.push(
      f.instanced(`Wildflower ${p.bloom}`, sphere(0.05, 7, 5),
        std(p.bloom, 0.65, { flatShading: true }),
        list.map((t) => ({ ...t, position: [t.position[0], 0.24, t.position[2]] })),
        { castShadow: true }),
    );
  }
  return f.group("Wildflowers", result);
}

/**
 * A small grove of meadow trees — wider, fluffier than the conifers in the
 * front yard. Built from rounded foliage spheres on short trunks, placed
 * deterministically and routed around the hill, the brook and the footbridge.
 */
function buildMeadowTrees(f: NodeFactory): SceneNode {
  const trunkMat = std(C.bark, 0.95, { texture: "bark", flatShading: true });
  const foliage = std(C.meadowGrassDark, 0.85, { flatShading: true });
  const rng = mulberry32(0xab1ea11);
  const trees: SceneNode[] = [];
  let attempts = 0;
  const xMin = MEADOW_POS[0] - MEADOW_W / 2 + 2;
  const xMax = MEADOW_POS[0] + MEADOW_W / 2 - 2;
  const zMin = MEADOW_POS[2] - MEADOW_D / 2 + 2;
  const zMax = MEADOW_POS[2] + MEADOW_D / 2 - 2;
  const placed: { x: number; z: number }[] = [];
  while (trees.length < 12 && attempts < 200) {
    attempts++;
    const x = xMin + rng() * (xMax - xMin);
    const z = zMin + rng() * (zMax - zMin);
    // Stay out of the meadow brook channel.
    if (Math.abs(z - MEADOW_BROOK_Z) < 1.6) continue;
    // Stay off the hill itself.
    if (Math.hypot(x - MEADOW_HILL_POS[0], z - MEADOW_HILL_POS[2]) < 4.5) continue;
    // Min separation from other meadow trees.
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
    placed.push({ x, z });
    const s = 1.0 + rng() * 0.5;
    const trunkH = 0.7 + rng() * 0.25;
    trees.push(
      f.group(
        `Meadow Tree ${trees.length + 1}`,
        [
          f.mesh("Trunk", cylinder(0.1, 0.14, trunkH, 6), trunkMat, {
            position: [0, trunkH / 2, 0],
          }, { castShadow: true, receiveShadow: true }),
          f.mesh("Crown", sphere(0.95, 12, 9), foliage, {
            position: [0, trunkH + 0.7, 0],
          }, { castShadow: true, receiveShadow: true }),
          f.mesh("Crown Lobe L", sphere(0.55, 10, 8), foliage, {
            position: [-0.55, trunkH + 0.5, 0.1],
          }, { castShadow: true }),
          f.mesh("Crown Lobe R", sphere(0.55, 10, 8), foliage, {
            position: [0.55, trunkH + 0.55, -0.1],
          }, { castShadow: true }),
        ],
        { position: [x, 0, z], scale: [s, s, s] },
      ),
    );
  }
  return f.group("Meadow Trees", trees);
}

/**
 * A simple post-and-rail fence delineating the meadow's outer perimeter on
 * the back and far sides — a softer hint of property line than the picket
 * fence around the inner yard.
 */
function buildMeadowFence(f: NodeFactory): SceneNode {
  const wood = std(C.fence, 0.85, { texture: "bark", flatShading: true });
  const xMin = MEADOW_POS[0] - MEADOW_W / 2 + 4;
  const xMax = MEADOW_POS[0] + MEADOW_W / 2 - 4;
  const zBack = MEADOW_POS[2] - MEADOW_D / 2 + 1.5;
  const postSpacing = 2.4;
  const postH = 0.9;
  const posts: Transform[] = [];
  for (let x = xMin; x <= xMax + 1e-3; x += postSpacing) {
    posts.push({ position: [x, postH / 2, zBack], rotation: [0, 0, 0], scale: [1, 1, 1] });
  }
  return f.group("Meadow Fence", [
    f.instanced("Meadow Posts", box(0.08, postH, 0.08), wood, posts, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Meadow Top Rail", box(xMax - xMin, 0.05, 0.04), wood, {
      position: [(xMin + xMax) / 2, postH - 0.1, zBack],
    }, { castShadow: true }),
    f.mesh("Meadow Mid Rail", box(xMax - xMin, 0.05, 0.04), wood, {
      position: [(xMin + xMax) / 2, postH - 0.45, zBack],
    }, { castShadow: true }),
  ]);
}

/* ─────────────────── sixth-pass courtyard props ─────────────────── */

/**
 * A garden scarecrow standing just north of the vegetable garden — wooden T-pole
 * dressed in a stuffed plaid shirt and patched blue pants, a burlap-sack head
 * with stitched features and a battered straw hat with a brim. Crow on the
 * crossarm adds a touch of life.
 */
function buildScarecrow(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const pole = std(C.walnut, 0.85, { texture: "wood" });
  const shirt = std(C.scarecrowShirt, 0.85, { flatShading: true });
  const pants = std(C.scarecrowPants, 0.9, { flatShading: true });
  const head = std(C.strawHay, 0.95, { texture: "burlap", textureScale: [3, 3] });
  const hat = std(C.strawHayDark, 0.95, { texture: "burlap", textureScale: [2, 2] });
  const button = std(C.ironGrey, 0.4, { metalness: 0.6 });
  const crow = std("#1a1a1a", 0.7, { flatShading: true });
  const stitch = std(C.walnut, 0.95);
  const parts: SceneNode[] = [
    // Central support pole, planted in the ground.
    f.mesh("Pole", box(0.07, 1.9, 0.07), pole, { position: [0, 0.95, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    // Horizontal crossarm for the arms — set just below the shoulders.
    f.mesh("Crossarm", box(1.3, 0.06, 0.06), pole, { position: [0, 1.45, 0] }, {
      castShadow: true,
    }),
    // Lashing — a tight burlap rope wrap where pole and crossarm meet.
    f.mesh("Lashing", cylinder(0.07, 0.07, 0.1, 8), std(C.ropeJute, 0.95, { flatShading: true }), {
      position: [0, 1.45, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
    // Stuffed plaid shirt — boxy torso plus thinner sleeves out along the crossarm.
    f.mesh("Torso", box(0.46, 0.6, 0.26), shirt, { position: [0, 1.18, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Sleeve L", box(0.45, 0.16, 0.18), shirt, { position: [-0.42, 1.43, 0] }, {
      castShadow: true,
    }),
    f.mesh("Sleeve R", box(0.45, 0.16, 0.18), shirt, { position: [0.42, 1.43, 0] }, {
      castShadow: true,
    }),
    // Hands — twisted handfuls of straw poking from the cuffs.
    f.mesh("Hand L", sphere(0.09, 8, 6), head, { position: [-0.66, 1.42, 0], scale: [1, 0.7, 1] }, {
      castShadow: true,
    }),
    f.mesh("Hand R", sphere(0.09, 8, 6), head, { position: [0.66, 1.42, 0], scale: [1, 0.7, 1] }, {
      castShadow: true,
    }),
    // Patched pants below the shirt — also stuffed.
    f.mesh("Pants L", box(0.16, 0.42, 0.18), pants, { position: [-0.1, 0.66, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Pants R", box(0.16, 0.42, 0.18), pants, { position: [0.1, 0.66, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    // Boots peeking out at the foot of each leg.
    f.mesh("Boot L", box(0.16, 0.08, 0.22), std(C.walnut, 0.85), {
      position: [-0.1, 0.42, 0.04],
    }, { castShadow: true }),
    f.mesh("Boot R", box(0.16, 0.08, 0.22), std(C.walnut, 0.85), {
      position: [0.1, 0.42, 0.04],
    }, { castShadow: true }),
    // Burlap-sack head — rounded with a flat top under the hat.
    f.mesh("Head", sphere(0.18, 12, 9), head, { position: [0, 1.66, 0], scale: [1, 1.05, 1] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    // Stitched cross-eyes and a button mouth.
    f.mesh("Eye L", box(0.04, 0.012, 0.008), stitch, {
      position: [-0.06, 1.7, 0.16],
      rotation: [0, 0, Math.PI / 4],
    }),
    f.mesh("Eye L Cross", box(0.04, 0.012, 0.008), stitch, {
      position: [-0.06, 1.7, 0.16],
      rotation: [0, 0, -Math.PI / 4],
    }),
    f.mesh("Eye R", box(0.04, 0.012, 0.008), stitch, {
      position: [0.06, 1.7, 0.16],
      rotation: [0, 0, Math.PI / 4],
    }),
    f.mesh("Eye R Cross", box(0.04, 0.012, 0.008), stitch, {
      position: [0.06, 1.7, 0.16],
      rotation: [0, 0, -Math.PI / 4],
    }),
    f.mesh("Mouth Stitch", box(0.12, 0.012, 0.008), stitch, { position: [0, 1.6, 0.16] }),
    f.mesh("Mouth Up", box(0.012, 0.04, 0.008), stitch, { position: [-0.04, 1.62, 0.16] }),
    f.mesh("Mouth Up R", box(0.012, 0.04, 0.008), stitch, { position: [0.04, 1.62, 0.16] }),
    // Battered straw hat — brim disc + crown cone.
    f.mesh("Hat Brim", cylinder(0.34, 0.34, 0.03, 16), hat, { position: [0, 1.86, 0] }, {
      castShadow: true,
    }),
    f.mesh("Hat Crown", cone(0.18, 0.22, 12), hat, { position: [0, 1.97, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Hat Band", cylinder(0.185, 0.185, 0.04, 12),
      std(C.scarecrowShirt, 0.9, { flatShading: true }),
      { position: [0, 1.89, 0] }),
    // Shirt buttons down the front.
    f.mesh("Btn 1", sphere(0.022, 8, 6), button, { position: [0, 1.32, 0.135] }),
    f.mesh("Btn 2", sphere(0.022, 8, 6), button, { position: [0, 1.18, 0.135] }),
    f.mesh("Btn 3", sphere(0.022, 8, 6), button, { position: [0, 1.04, 0.135] }),
    // A small crow perched on the crossarm's right tip.
    f.group("Crow", [
      f.mesh("Body", sphere(0.07, 10, 7), crow, { position: [0, 0, 0], scale: [1, 0.95, 1.4] }, {
        castShadow: true,
      }),
      f.mesh("Head", sphere(0.045, 8, 6), crow, { position: [0, 0.05, 0.08] }, { castShadow: true }),
      f.mesh("Beak", cone(0.015, 0.05, 5),
        std(C.flowerYellow, 0.6),
        { position: [0, 0.05, 0.12], rotation: [Math.PI / 2, 0, 0] }),
      f.mesh("Tail", box(0.04, 0.02, 0.06), crow, { position: [0, -0.005, -0.08] }),
    ], { position: [0.62, 1.52, 0], rotation: [0, -Math.PI / 8, 0] }),
  ];
  return f.group("Scarecrow", parts, { position: pos, rotation: [0, -Math.PI / 14, 0] });
}

/**
 * A small pumpkin patch — five gourds of varied size and orientation grouped
 * on the lawn, joined by a winding green vine of foliage spheres. Stems and
 * subtle vertical ribbing (suggested by an inner sphere) sell the pumpkin
 * silhouette without a custom geometry.
 */
function buildPumpkinPatch(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const skin = std(C.pumpkinOrange, 0.85, { flatShading: true });
  const rib = std(C.pumpkinDark, 0.9, { flatShading: true });
  const stem = std(C.pumpkinStem, 0.9, { flatShading: true });
  const vine = std(C.pumpkinStem, 0.9, { flatShading: true });
  const leaf = std(C.appleFoliage, 0.85, { flatShading: true });
  // Five pumpkins arranged in a loose cluster.
  const layout = [
    { x: 0.0, z: 0.0, r: 0.3, sx: 1.1, ry: 0 },
    { x: 0.7, z: 0.25, r: 0.24, sx: 1.05, ry: 0.6 },
    { x: -0.55, z: 0.35, r: 0.22, sx: 1.08, ry: -0.4 },
    { x: 0.25, z: 0.85, r: 0.18, sx: 1.0, ry: 0.2 },
    { x: -0.3, z: -0.45, r: 0.16, sx: 1.0, ry: 1.1 },
  ];
  const parts: SceneNode[] = [];
  for (let i = 0; i < layout.length; i++) {
    const p = layout[i]!;
    const cy = p.r * 0.8;
    parts.push(
      f.group(`Pumpkin ${i + 1}`, [
        // Main body — slightly squashed sphere for the iconic shape.
        f.mesh("Skin", sphere(p.r, 14, 10), skin, {
          position: [0, 0, 0],
          scale: [p.sx, 0.78, p.sx],
        }, { castShadow: true, receiveShadow: true }),
        // Three darker ribs implied by thin slivers cutting through the body.
        f.mesh("Rib A", box(p.r * 0.06, p.r * 1.4, p.r * 2 * p.sx * 0.98), rib, {
          position: [0, 0, 0],
        }),
        f.mesh("Rib B", box(p.r * 2 * p.sx * 0.98, p.r * 1.4, p.r * 0.06), rib, {
          position: [0, 0, 0],
        }),
        f.mesh("Rib C", box(p.r * 0.06, p.r * 1.4, p.r * 2 * p.sx * 0.98), rib, {
          position: [0, 0, 0],
          rotation: [0, Math.PI / 3, 0],
        }),
        f.mesh("Rib D", box(p.r * 0.06, p.r * 1.4, p.r * 2 * p.sx * 0.98), rib, {
          position: [0, 0, 0],
          rotation: [0, -Math.PI / 3, 0],
        }),
        // Stubby green stem on top.
        f.mesh("Stem", cylinder(p.r * 0.15, p.r * 0.22, p.r * 0.5, 6), stem, {
          position: [0, p.r * 0.6, 0],
          rotation: [0.15, 0, 0.1],
        }, { castShadow: true }),
      ], { position: [p.x, cy, p.z], rotation: [0, p.ry, 0] }),
    );
  }
  // A few vine segments and a leaf wandering between pumpkins.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(
      f.mesh("Vine", cylinder(0.02, 0.022, 0.55, 5), vine, {
        position: [Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.5],
        rotation: [Math.PI / 2 + (i % 2 === 0 ? 0.15 : -0.15), a, 0],
      }, { castShadow: false }),
    );
  }
  // Two pumpkin leaves on the ground.
  parts.push(
    f.mesh("Leaf A", sphere(0.14, 8, 5), leaf, {
      position: [0.5, 0.04, -0.1],
      scale: [1.2, 0.2, 0.8],
      rotation: [0, 0.3, 0],
    }, { castShadow: false }),
    f.mesh("Leaf B", sphere(0.12, 8, 5), leaf, {
      position: [-0.4, 0.03, 0.6],
      scale: [1.1, 0.18, 0.9],
      rotation: [0, -0.6, 0],
    }, { castShadow: false }),
  );
  return f.group("Pumpkin Patch", parts, { position: pos });
}

/**
 * A round bistro patio set — pedestal table with a striped canvas parasol,
 * two slatted chairs facing across the table and a small ceramic teapot.
 * The parasol's pink-and-cream segments are six interleaved wedge boxes; not
 * a true cone, but the silhouette reads clearly from any orbit angle.
 */
function buildPatioSet(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const metal = std(C.patioCream, 0.6, { metalness: 0.1 });
  const wood = std(C.walnut, 0.75, { texture: "wood" });
  const parasolPink = std(C.parasolPink, 0.7);
  const parasolCream = std(C.patioCream, 0.7);
  const pot = std(C.white, 0.6);
  const tableY = 0.78;
  const tableR = 0.55;
  const parts: SceneNode[] = [
    // Pedestal base and column.
    f.mesh("Table Base", cylinder(0.22, 0.26, 0.05, 12), metal, { position: [0, 0.025, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.mesh("Table Column", cylinder(0.05, 0.055, tableY - 0.05, 10), metal, {
      position: [0, (tableY - 0.05) / 2 + 0.05, 0],
    }, { castShadow: true }),
    f.mesh("Table Top", cylinder(tableR, tableR, 0.05, 24), metal, {
      position: [0, tableY, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Parasol pole — runs through the table.
    f.mesh("Parasol Pole", cylinder(0.024, 0.028, 1.75, 8), wood, {
      position: [0, tableY + 0.85, 0],
    }, { castShadow: true }),
    // Parasol canopy — a single shallow cone for the silhouette, dressed
    // with eight alternating pink-and-cream ribbed wedges (thin boxes draped
    // along the slope) for the striped look.
    f.mesh("Parasol Canopy", cone(0.9, 0.45, 16), parasolCream, {
      position: [0, tableY + 1.5, 0],
    }, { castShadow: true }),
  ];
  const wedges = 8;
  const parasolR = 0.9;
  for (let i = 0; i < wedges; i += 2) {
    const a = (i / wedges) * Math.PI * 2;
    parts.push(
      f.mesh("Parasol Stripe", box(parasolR * 0.96, 0.005, 0.18), parasolPink, {
        position: [
          Math.cos(a) * parasolR * 0.5,
          tableY + 1.45,
          Math.sin(a) * parasolR * 0.5,
        ],
        rotation: [0, a + Math.PI / 2, -0.45],
      }),
    );
  }
  // Parasol crown — a small ball cap at the very top.
  parts.push(
    f.mesh("Parasol Finial", sphere(0.05, 10, 7),
      std(C.brass, 0.4, { metalness: 0.6 }),
      { position: [0, tableY + 1.78, 0] }),
  );
  // Decorative teapot on the table.
  parts.push(
    f.group("Teapot", [
      f.mesh("Pot Body", sphere(0.1, 12, 9), pot, {
        position: [0, 0.07, 0],
        scale: [1.1, 0.85, 1.1],
      }, { castShadow: true }),
      f.mesh("Pot Lid", sphere(0.06, 10, 7), pot, {
        position: [0, 0.16, 0],
        scale: [1, 0.5, 1],
      }, { castShadow: true }),
      f.mesh("Pot Knob", sphere(0.022, 8, 6), pot, { position: [0, 0.2, 0] }),
      f.mesh("Pot Spout", cylinder(0.018, 0.03, 0.12, 6), pot, {
        position: [0.12, 0.1, 0],
        rotation: [0, 0, -Math.PI / 3],
      }),
      f.mesh("Pot Handle", cylinder(0.012, 0.012, 0.13, 6), pot, {
        position: [-0.105, 0.1, 0],
        rotation: [0, 0, Math.PI / 4],
      }),
    ], { position: [-0.25, tableY + 0.03, -0.1] }),
  );
  // Two chairs flanking the table.
  const chair = (cx: number, cz: number, ry: number): SceneNode => {
    const seatY = 0.42;
    return f.group("Chair", [
      // Four splayed legs.
      f.mesh("Leg FL", cylinder(0.022, 0.022, seatY, 6), metal, {
        position: [-0.18, seatY / 2, 0.18],
      }, { castShadow: true }),
      f.mesh("Leg FR", cylinder(0.022, 0.022, seatY, 6), metal, {
        position: [0.18, seatY / 2, 0.18],
      }, { castShadow: true }),
      f.mesh("Leg BL", cylinder(0.022, 0.022, seatY, 6), metal, {
        position: [-0.18, seatY / 2, -0.18],
      }, { castShadow: true }),
      f.mesh("Leg BR", cylinder(0.022, 0.022, seatY, 6), metal, {
        position: [0.18, seatY / 2, -0.18],
      }, { castShadow: true }),
      // Round seat plate.
      f.mesh("Seat", cylinder(0.22, 0.22, 0.04, 16), metal, {
        position: [0, seatY, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Curved backrest — three slats on a U-frame.
      f.mesh("Back Rail Top", cylinder(0.02, 0.02, 0.45, 6), metal, {
        position: [0, seatY + 0.36, -0.21],
        rotation: [0, 0, Math.PI / 2],
      }, { castShadow: true }),
      f.mesh("Back Post L", cylinder(0.022, 0.022, 0.4, 6), metal, {
        position: [-0.2, seatY + 0.2, -0.21],
      }, { castShadow: true }),
      f.mesh("Back Post R", cylinder(0.022, 0.022, 0.4, 6), metal, {
        position: [0.2, seatY + 0.2, -0.21],
      }, { castShadow: true }),
      f.mesh("Back Slat A", box(0.35, 0.04, 0.02), metal, {
        position: [0, seatY + 0.14, -0.21],
      }, { castShadow: true }),
      f.mesh("Back Slat B", box(0.35, 0.04, 0.02), metal, {
        position: [0, seatY + 0.25, -0.21],
      }, { castShadow: true }),
      // Soft seat cushion.
      f.mesh("Cushion", cylinder(0.2, 0.2, 0.045, 16),
        std(C.parasolPink, 0.85),
        { position: [0, seatY + 0.045, 0] }, { castShadow: true }),
    ], { position: [cx, 0, cz], rotation: [0, ry, 0] });
  };
  parts.push(chair(0.85, 0, -Math.PI / 2));
  parts.push(chair(-0.85, 0, Math.PI / 2));
  return f.group("Patio Set", parts, { position: pos, rotation: [0, Math.PI / 12, 0] });
}

/**
 * A pair of cascading flower baskets hanging from the porch canopy brackets,
 * one under each canopy post. Each basket is a terracotta planter on three
 * chains, with a cluster of trailing pink, yellow and white blooms.
 */
function buildHangingBaskets(f: NodeFactory): SceneNode {
  const basketMat = std(C.basketTerracotta, 0.95, { flatShading: true });
  const rim = std(C.brickDark, 0.9, { flatShading: true });
  const chain = std(C.ironGrey, 0.4, { metalness: 0.6 });
  const soil = std(C.soil, 0.95, { flatShading: true });
  const leaf = std(C.appleFoliage, 0.85, { flatShading: true });
  const blooms = [
    std(C.parasolPink, 0.7),
    std(C.flowerYellow, 0.6),
    std(C.flowerWhite, 0.7),
  ];
  // The canopy posts sit at x = ±1.18, z = FRONT_Z + 0.65, with the canopy at y ≈ 2.95.
  const anchorY = 2.65;
  const basketY = 1.9;
  const basketR = 0.22;
  const buildOne = (sideX: number): SceneNode => {
    const parts: SceneNode[] = [
      // Tapered terracotta planter.
      f.mesh("Planter", cylinder(basketR, basketR * 0.7, 0.22, 14), basketMat, {
        position: [0, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Thin rolled rim on top.
      f.mesh("Rim", cylinder(basketR + 0.015, basketR + 0.015, 0.025, 16), rim, {
        position: [0, 0.115, 0],
      }, { castShadow: true }),
      // Soil cap inside the rim.
      f.mesh("Soil", cylinder(basketR - 0.01, basketR - 0.01, 0.025, 14), soil, {
        position: [0, 0.105, 0],
      }),
    ];
    // Three suspension chains from rim out to a common ring under the anchor.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const cx = Math.cos(a) * basketR;
      const cz = Math.sin(a) * basketR;
      const dy = anchorY - basketY;
      parts.push(
        f.mesh("Chain", cylinder(0.008, 0.008, dy, 4), chain, {
          position: [cx / 2, dy / 2 + 0.11, cz / 2],
          // Tilt the chain so its top converges near the anchor.
          rotation: [Math.atan2(cz, dy), 0, -Math.atan2(cx, dy)],
        }),
      );
    }
    // Anchor ring under the canopy bracket.
    parts.push(
      f.mesh("Anchor Ring", cylinder(0.04, 0.04, 0.012, 8), chain, {
        position: [0, anchorY - basketY + 0.12, 0],
      }),
    );
    // Cascading flowers — instanced colored spheres across the rim circumference.
    const flowerInstances: { mat: MaterialDef; transforms: Transform[] }[] = blooms.map((m) => ({
      mat: m,
      transforms: [],
    }));
    const rng = mulberry32(0xba53e7 + Math.round(sideX * 100));
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const a = t * Math.PI * 2 + rng() * 0.3;
      const r = basketR * (0.7 + rng() * 0.5);
      const drop = -rng() * 0.35;
      const choice = Math.floor(rng() * blooms.length);
      flowerInstances[choice]!.transforms.push({
        position: [Math.cos(a) * r, 0.08 + drop, Math.sin(a) * r],
        rotation: [0, rng() * Math.PI, 0],
        scale: [1, 1, 1],
      });
    }
    flowerInstances.forEach((g, idx) => {
      if (g.transforms.length === 0) return;
      parts.push(
        f.instanced(`Blooms ${idx}`, sphere(0.05, 8, 6), g.mat, g.transforms, {
          castShadow: true,
        }),
      );
    });
    // A few trailing leaves cascading over the rim.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      parts.push(
        f.mesh("Trail Leaf", sphere(0.07, 8, 5), leaf, {
          position: [Math.cos(a) * basketR * 0.95, -0.05, Math.sin(a) * basketR * 0.95],
          scale: [1.3, 0.3, 0.6],
          rotation: [0, a, 0.3],
        }),
      );
    }
    return f.group("Hanging Basket", parts, { position: [sideX, basketY, FRONT_Z + 0.65] });
  };
  return f.group("Hanging Baskets", [buildOne(-1.18), buildOne(1.18)]);
}

/**
 * A pine-needle wreath on the front door — a ring of small foliage spheres
 * with a scatter of red berries, finished with a pink ribbon bow. The wreath
 * sits centred on the upper half of the arched front door.
 */
function buildDoorWreath(f: NodeFactory): SceneNode {
  const foliage = std(C.appleFoliage, 0.95, { flatShading: true });
  const foliageDark = std(C.ivyDark, 0.95, { flatShading: true });
  const berry = std(C.wreathBerry, 0.65, { flatShading: true });
  const ribbon = std(C.parasolPink, 0.7);
  // Hang on the front wall just above the arched doorway, fitting in the
  // narrow gap between the door trim (y≈2.32) and the porch canopy's
  // underside (y≈2.67).
  const z = FRONT_Z + WALL_T / 2 + 0.012;
  const ringR = 0.16;
  const parts: SceneNode[] = [];
  const segs = 22;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const r = ringR + (i % 2 === 0 ? 0 : -0.018);
    const size = 0.042 + (i % 3 === 0 ? 0.012 : 0);
    parts.push(
      f.mesh("Foliage", sphere(size, 7, 5), i % 4 === 0 ? foliageDark : foliage, {
        position: [Math.cos(a) * r, Math.sin(a) * r, 0],
      }, { castShadow: false }),
    );
  }
  // Berry clusters at the three- and nine-o'clock and bottom-right.
  for (const a of [0.6, -0.6, 2.2, -2.4, 1.7]) {
    parts.push(
      f.mesh("Berry", sphere(0.022, 6, 5), berry, {
        position: [Math.cos(a) * (ringR + 0.008), Math.sin(a) * (ringR + 0.008), 0.018],
      }),
    );
  }
  // Ribbon at the top — two loops + two tails.
  parts.push(
    f.mesh("Bow Loop L", sphere(0.045, 8, 6), ribbon, {
      position: [-0.045, ringR + 0.025, 0.012],
      scale: [1.1, 0.7, 0.5],
      rotation: [0, 0, 0.4],
    }, { castShadow: true }),
    f.mesh("Bow Loop R", sphere(0.045, 8, 6), ribbon, {
      position: [0.045, ringR + 0.025, 0.012],
      scale: [1.1, 0.7, 0.5],
      rotation: [0, 0, -0.4],
    }, { castShadow: true }),
    f.mesh("Bow Knot", sphere(0.022, 8, 6), ribbon, {
      position: [0, ringR + 0.025, 0.018],
    }),
    f.mesh("Bow Tail L", box(0.028, 0.11, 0.008), ribbon, {
      position: [-0.03, ringR - 0.05, 0.012],
      rotation: [0, 0, 0.25],
    }),
    f.mesh("Bow Tail R", box(0.028, 0.11, 0.008), ribbon, {
      position: [0.03, ringR - 0.05, 0.012],
      rotation: [0, 0, -0.25],
    }),
  );
  return f.group("Door Wreath", parts, { position: [0, 2.5, z] });
}

/**
 * A coiled garden hose mounted on a wall reel on the east side wall of the
 * house, plus a brass spigot below it. The hose is suggested by three nested
 * tori (cylinders edge-on as flattened rings) and a free-tail loop dropping
 * to the ground.
 */
function buildGardenHoseReel(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const bracket = std(C.ironGrey, 0.5, { metalness: 0.6, flatShading: true });
  const drum = std(C.scarecrowPants, 0.85, { flatShading: true });
  const hose = std(C.hoseGreen, 0.85, { flatShading: true });
  const brass = std(C.brass, 0.4, { metalness: 0.7 });
  const parts: SceneNode[] = [
    // Wall bracket plate.
    f.mesh("Bracket", box(0.06, 0.4, 0.5), bracket, { position: [0, 1.1, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    // Reel drum — cylinder turned out from the wall.
    f.mesh("Drum", cylinder(0.08, 0.08, 0.3, 14), drum, {
      position: [0.18, 1.1, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true, receiveShadow: true }),
    // Reel rims at either end of the drum.
    f.mesh("Drum Rim L", cylinder(0.18, 0.18, 0.025, 18), bracket, {
      position: [0.04, 1.1, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    f.mesh("Drum Rim R", cylinder(0.18, 0.18, 0.025, 18), bracket, {
      position: [0.32, 1.1, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    // A crank handle sticking off the right rim.
    f.mesh("Crank", cylinder(0.012, 0.012, 0.16, 6), bracket, {
      position: [0.34, 1.14, 0.13],
    }),
    f.mesh("Crank Grip", sphere(0.025, 8, 6), drum, { position: [0.34, 1.22, 0.13] }),
  ];
  // Coiled hose — a fat sleeve of hose wrapping the drum, with three darker
  // groove rings cut around it to suggest the individual wraps.
  parts.push(
    f.mesh("Hose Wrap", cylinder(0.16, 0.16, 0.28, 18), hose, {
      position: [0.18, 1.1, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true, receiveShadow: true }),
  );
  for (let r = 0; r < 4; r++) {
    const groove = std(C.ivyDark, 0.95, { flatShading: true });
    const x = 0.18 + (r - 1.5) * 0.07;
    parts.push(
      f.mesh("Hose Groove", cylinder(0.162, 0.162, 0.012, 18), groove, {
        position: [x, 1.1, 0],
        rotation: [0, 0, Math.PI / 2],
      }),
    );
  }
  // Outer hose tail dropping to the ground in a relaxed S-curve.
  parts.push(
    f.mesh("Hose Drop A", cylinder(0.022, 0.022, 0.7, 6), hose, {
      position: [0.22, 0.7, 0.05],
      rotation: [0.15, 0, 0.1],
    }, { castShadow: true }),
    f.mesh("Hose Drop B", cylinder(0.022, 0.022, 0.55, 6), hose, {
      position: [0.3, 0.25, 0.08],
      rotation: [Math.PI / 2.2, 0, 0.2],
    }, { castShadow: true }),
    f.mesh("Hose Nozzle", cylinder(0.025, 0.034, 0.1, 8), brass, {
      position: [0.45, 0.06, 0.16],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  );
  // Brass garden spigot below the reel.
  parts.push(
    f.mesh("Spigot Pipe", cylinder(0.022, 0.022, 0.18, 6), brass, {
      position: [0, 0.7, 0.06],
      rotation: [Math.PI / 2, 0, 0],
    }),
    f.mesh("Spigot Bonnet", cylinder(0.04, 0.04, 0.07, 8), brass, {
      position: [0, 0.7, 0.18],
      rotation: [Math.PI / 2, 0, 0],
    }),
    f.mesh("Spigot Handle", box(0.13, 0.014, 0.02), brass, {
      position: [0, 0.72, 0.22],
    }),
    f.mesh("Spigot Handle Cap", sphere(0.018, 8, 6), brass, {
      position: [0, 0.72, 0.22],
    }),
  );
  return f.group("Hose Reel", parts, { position: pos });
}

/* ─────────────────── sixth-pass scene extension ─────────────────── */

/**
 * The side orchard — a new ground plane east of the lawn that overlaps the
 * lawn by ~1 unit along the join. Carries a fruiting apple grove, a scatter
 * of fallen apples, a dry-stone retaining wall, an old wooden hay cart and
 * a stone water well with a peaked shingle roof.
 */
function buildSideOrchard(f: NodeFactory): SceneNode {
  return f.group("Side Orchard", [
    // Orchard ground plane — slightly fresher green than the main lawn.
    f.mesh(
      "Orchard Ground",
      plane(ORCHARD_W, ORCHARD_D),
      std(C.orchardGrass, 0.95, { texture: "grass", textureScale: [9, 12] }),
      { position: ORCHARD_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // A darker apron exactly along the lawn join — feathers the seam so the
    // overlap doesn't read as a hard line in raking sun.
    f.mesh(
      "Orchard Apron",
      plane(2.5, ORCHARD_D),
      std(C.grassDark, 0.95, { texture: "grass", textureScale: [1, 8] }),
      { position: [25, -0.002, ORCHARD_POS[2]], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    buildOrchardMounds(f),
    buildOrchardWall(f),
    buildAppleTrees(f),
    buildFallenApples(f),
    buildHayCart(f, HAY_CART_POS),
    buildOldWell(f, OLD_WELL_POS),
  ]);
}

/**
 * Two low, gently sloping earth mounds tucked into the orchard — flattened
 * spheres half-buried in the ground that give the otherwise-flat plane
 * realistic landform without disturbing the apple tree placement.
 */
function buildOrchardMounds(f: NodeFactory): SceneNode {
  const earth = std(C.hillEarth, 0.95, { flatShading: true });
  const grassCap = std(C.orchardGrass, 0.95, { flatShading: true });
  return f.group("Orchard Mounds", [
    f.mesh("Mound A Base", sphere(2.6, 16, 10), earth, {
      position: [35, 0.05, -7],
      scale: [1, 0.18, 1.2],
    }, { receiveShadow: true }),
    f.mesh("Mound A Crown", sphere(2.0, 14, 9), grassCap, {
      position: [35, 0.12, -7],
      scale: [1, 0.18, 1.1],
    }, { receiveShadow: true }),
    f.mesh("Mound B Base", sphere(2.2, 14, 9), earth, {
      position: [39, 0.04, 14],
      scale: [1, 0.16, 1.0],
    }, { receiveShadow: true }),
    f.mesh("Mound B Crown", sphere(1.7, 12, 8), grassCap, {
      position: [39, 0.1, 14],
      scale: [1, 0.18, 1.0],
    }, { receiveShadow: true }),
  ]);
}

/**
 * A dry-stone retaining wall along the orchard's west edge — boxy field
 * stones stacked two courses high, with a wider capstone course on top.
 * A 1.4-unit gap in the middle lets a doll walk between the lawn and the
 * orchard.
 */
function buildOrchardWall(f: NodeFactory): SceneNode {
  const stone = std(C.dryStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.dryStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const capstone = std(C.dryStoneDark, 0.92, { flatShading: true });
  const rng = mulberry32(0xd4d51078);
  const zMin = ORCHARD_POS[2] - ORCHARD_D / 2 + 1;
  const zMax = ORCHARD_POS[2] + ORCHARD_D / 2 - 1;
  const gapHalf = 0.7;
  const gapZ = ORCHARD_POS[2];
  // Two courses of irregular stones.
  const stones: Transform[] = [];
  const stonesDark: Transform[] = [];
  const courseHeights = [0.18, 0.45];
  for (const y of courseHeights) {
    let z = zMin;
    while (z < zMax) {
      const w = 0.45 + rng() * 0.35;
      // Skip the gap.
      if (Math.abs(z - gapZ) < gapHalf || Math.abs(z + w - gapZ) < gapHalf) {
        z += w;
        continue;
      }
      const inst: Transform = {
        position: [ORCHARD_WALL_X + (rng() - 0.5) * 0.08, y, z + w / 2],
        rotation: [0, rng() * 0.3 - 0.15, 0],
        scale: [w, 0.26, 0.42 + rng() * 0.18],
      };
      (rng() < 0.35 ? stonesDark : stones).push(inst);
      z += w * 0.97;
    }
  }
  // Wider capstone course.
  const caps: Transform[] = [];
  let cz = zMin;
  while (cz < zMax) {
    const w = 0.55 + rng() * 0.3;
    if (Math.abs(cz - gapZ) < gapHalf || Math.abs(cz + w - gapZ) < gapHalf) {
      cz += w;
      continue;
    }
    caps.push({
      position: [ORCHARD_WALL_X, 0.62, cz + w / 2],
      rotation: [0, rng() * 0.18 - 0.09, 0],
      scale: [w, 0.1, 0.6],
    });
    cz += w * 0.99;
  }
  return f.group("Orchard Wall", [
    f.instanced("Wall Stones", box(1, 1, 1), stone, stones, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.instanced("Wall Stones Dark", box(1, 1, 1), stoneDark, stonesDark, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.instanced("Wall Capstones", box(1, 1, 1), capstone, caps, {
      castShadow: true,
      receiveShadow: true,
    }),
  ]);
}

/**
 * A small grove of fruiting apple trees — wider, fluffier than the conifers
 * in the front yard. Each tree has a short cylindrical trunk and two
 * overlapping rounded foliage spheres dotted with red apples. Placed
 * deterministically across the orchard, avoiding the mounds, the wall gap,
 * the cart and the well.
 */
function buildAppleTrees(f: NodeFactory): SceneNode {
  const trunkMat = std(C.bark, 0.95, { texture: "bark", flatShading: true });
  const foliage = std(C.appleFoliage, 0.85, { flatShading: true });
  const foliageLight = std(C.foliage, 0.85, { flatShading: true });
  const apple = std(C.appleRed, 0.55, { flatShading: true });
  // Deterministic positions inside the orchard plane.
  const layouts: { x: number; z: number; s: number }[] = [
    { x: 28, z: -6, s: 1.0 },
    { x: 31, z: 2, s: 1.15 },
    { x: 36, z: -5, s: 0.95 },
    { x: 33, z: 8, s: 1.1 },
    { x: 38, z: 6, s: 1.0 },
    { x: 40, z: -2, s: 1.05 },
    { x: 27, z: 14, s: 0.9 },
    { x: 36, z: 16, s: 1.0 },
  ];
  const trees: SceneNode[] = [];
  // Apple instances are batched per-tree.
  for (let i = 0; i < layouts.length; i++) {
    const lay = layouts[i]!;
    const rng = mulberry32(0xa00d + i * 17);
    const parts: SceneNode[] = [
      f.mesh("Trunk", cylinder(0.18, 0.24, 1.1, 8), trunkMat, {
        position: [0, 0.55, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Lower Limbs", sphere(0.45, 8, 6), trunkMat, {
        position: [0, 1.05, 0],
      }),
      // Two overlapping foliage canopies.
      f.mesh("Canopy A", sphere(1.05, 14, 10), foliage, {
        position: [0, 1.6, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Canopy B", sphere(0.85, 12, 9), foliageLight, {
        position: [0.4, 1.95, -0.2],
      }, { castShadow: true }),
      f.mesh("Canopy C", sphere(0.78, 12, 9), foliage, {
        position: [-0.4, 1.85, 0.3],
      }, { castShadow: true }),
    ];
    // Scatter ~14 apples on the canopy surface.
    const apples: Transform[] = [];
    for (let a = 0; a < 14; a++) {
      const phi = rng() * Math.PI * 2;
      const theta = (rng() * 0.7 + 0.1) * Math.PI;
      const cr = 1.0 + rng() * 0.1;
      apples.push({
        position: [
          Math.sin(theta) * Math.cos(phi) * cr,
          1.6 + Math.cos(theta) * cr,
          Math.sin(theta) * Math.sin(phi) * cr,
        ],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      });
    }
    parts.push(
      f.instanced("Apples", sphere(0.07, 8, 6), apple, apples, { castShadow: true }),
    );
    trees.push(
      f.group(`Apple Tree ${i + 1}`, parts, {
        position: [lay.x, 0, lay.z],
        scale: [lay.s, lay.s, lay.s],
        rotation: [0, (i * 0.7) % (Math.PI * 2), 0],
      }),
    );
  }
  return f.group("Apple Grove", trees);
}

/**
 * A loose scatter of fallen apples across the orchard grass — instanced red
 * spheres deterministically placed away from the trees' trunks but bunched
 * near them, where windfall actually lands.
 */
function buildFallenApples(f: NodeFactory): SceneNode {
  const apple = std(C.appleRed, 0.55, { flatShading: true });
  const rng = mulberry32(0xfa11e7);
  const instances: Transform[] = [];
  const centres: [number, number][] = [
    [28, -6], [31, 2], [36, -5], [33, 8], [38, 6], [40, -2], [27, 14], [36, 16],
  ];
  for (const [cx, cz] of centres) {
    const n = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.6 + rng() * 1.0;
      instances.push({
        position: [cx + Math.cos(a) * r, 0.06, cz + Math.sin(a) * r],
        rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
        scale: [1, 1, 1],
      });
    }
  }
  return f.instanced("Fallen Apples", sphere(0.07, 7, 6), apple, instances, {
    castShadow: true,
    receiveShadow: true,
  });
}

/**
 * A weathered wooden hay cart with two large spoked wheels — flat bed,
 * sloped end-boards and a heap of straw spilling over the back. Sits on the
 * orchard with one shaft tilted gently down to the ground.
 */
function buildHayCart(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.hayCartWood, 0.85, { texture: "wood" });
  const ironBand = std(C.ironGrey, 0.5, { metalness: 0.5, flatShading: true });
  const hay = std(C.strawHay, 0.95, { flatShading: true });
  const hayDark = std(C.strawHayDark, 0.95, { flatShading: true });
  // Cart bed sits low; wheel radius defines height.
  const wheelR = 0.55;
  const bedY = wheelR + 0.08;
  const bedW = 1.6;
  const bedD = 0.95;
  const parts: SceneNode[] = [
    // Flat plank bed.
    f.mesh("Cart Bed", box(bedW, 0.1, bedD), wood, { position: [0, bedY, 0] }, {
      castShadow: true,
      receiveShadow: true,
    }),
    // Side rails — taller in front, sloping down at the back tailgate.
    f.mesh("Rail L", box(bedW, 0.42, 0.08), wood, {
      position: [0, bedY + 0.26, bedD / 2 - 0.04],
    }, { castShadow: true }),
    f.mesh("Rail R", box(bedW, 0.42, 0.08), wood, {
      position: [0, bedY + 0.26, -bedD / 2 + 0.04],
    }, { castShadow: true }),
    f.mesh("Front Board", box(0.08, 0.65, bedD), wood, {
      position: [-bedW / 2 + 0.04, bedY + 0.36, 0],
    }, { castShadow: true }),
    // A dropped tailgate at the back.
    f.mesh("Tailgate", box(0.08, 0.34, bedD), wood, {
      position: [bedW / 2 + 0.04, bedY + 0.18, 0],
      rotation: [0, 0, -0.45],
    }, { castShadow: true }),
    // Two shafts pulling forward off the front, one tilted to the ground.
    f.mesh("Shaft L", cylinder(0.05, 0.05, 1.6, 8), wood, {
      position: [-bedW / 2 - 0.75, bedY - 0.05, bedD / 2 - 0.18],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    f.mesh("Shaft R", cylinder(0.05, 0.05, 1.6, 8), wood, {
      position: [-bedW / 2 - 0.75, bedY - 0.45, -bedD / 2 + 0.18],
      rotation: [0, 0, Math.PI / 2 + 0.3],
    }, { castShadow: true }),
  ];
  // Two large spoked wheels — a cylinder rim plus six crossbars per wheel.
  for (const side of [-1, 1] as const) {
    const wheelZ = side * (bedD / 2 + 0.04);
    parts.push(
      f.mesh("Wheel Rim", cylinder(wheelR, wheelR, 0.07, 22), ironBand, {
        position: [0.05, wheelR, wheelZ],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Wheel Tyre", cylinder(wheelR + 0.04, wheelR + 0.04, 0.05, 24), wood, {
        position: [0.05, wheelR, wheelZ],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true }),
      f.mesh("Hub", cylinder(0.1, 0.1, 0.1, 10), wood, {
        position: [0.05, wheelR, wheelZ],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true }),
    );
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI;
      parts.push(
        f.mesh("Spoke", box(wheelR * 1.85, 0.04, 0.04), wood, {
          position: [0.05, wheelR, wheelZ],
          rotation: [0, 0, a],
        }, { castShadow: true }),
      );
    }
  }
  // Hay heap piled in the bed, spilling over the tailgate.
  parts.push(
    f.mesh("Hay Heap", sphere(0.65, 14, 9), hay, {
      position: [0.1, bedY + 0.45, 0],
      scale: [1.1, 0.65, 0.85],
    }, { castShadow: true }),
    f.mesh("Hay Mound", sphere(0.45, 12, 8), hayDark, {
      position: [-0.2, bedY + 0.55, 0.15],
      scale: [1, 0.55, 0.9],
    }),
    // Loose straws spilling over the tailgate.
    f.mesh("Spill A", cylinder(0.02, 0.02, 0.5, 4), hayDark, {
      position: [bedW / 2 + 0.18, bedY + 0.05, 0.1],
      rotation: [0, 0.1, Math.PI / 2.5],
    }),
    f.mesh("Spill B", cylinder(0.02, 0.02, 0.6, 4), hay, {
      position: [bedW / 2 + 0.2, bedY + 0.02, -0.15],
      rotation: [0, -0.3, Math.PI / 2.3],
    }),
    f.mesh("Spill C", cylinder(0.02, 0.02, 0.4, 4), hay, {
      position: [bedW / 2 + 0.15, bedY + 0.08, 0.3],
      rotation: [0, 0.4, Math.PI / 2.7],
    }),
  );
  return f.group("Hay Cart", parts, { position: pos, rotation: [0, Math.PI / 5, 0] });
}

/**
 * An old stone water well — circular dry-stone wall, peaked shingled roof
 * carried on four corner posts, a winch with rope, and a wooden bucket
 * dangling above the dark water.
 */
function buildOldWell(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.dryStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.dryStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const roofShingle = std(C.wellRoof, 0.85, { texture: "shingle", textureScale: [1.5, 1.2] });
  const wood = std(C.wellRoof, 0.85, { texture: "wood" });
  const post = std(C.walnut, 0.85, { texture: "wood" });
  const water = {
    color: C.wellWater,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
  };
  const rope = std(C.ropeJute, 0.95, { flatShading: true });
  const wellR = 0.6;
  const wellH = 0.85;
  const parts: SceneNode[] = [
    // Stone outer ring and inner ring (so the lip looks hollow).
    f.mesh("Well Outer", cylinder(wellR, wellR, wellH, 18), stone, {
      position: [0, wellH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Well Inner", cylinder(wellR - 0.12, wellR - 0.12, wellH - 0.05, 18), stoneDark, {
      position: [0, wellH / 2 - 0.025, 0],
    }, { receiveShadow: true }),
    // The dark water surface set just below the lip.
    f.mesh("Well Water", cylinder(wellR - 0.14, wellR - 0.14, 0.04, 18), water, {
      position: [0, wellH - 0.18, 0],
    }),
    // A flat rim cap of darker stone on top.
    f.mesh("Well Cap", cylinder(wellR + 0.05, wellR + 0.05, 0.06, 18), stoneDark, {
      position: [0, wellH + 0.03, 0],
    }, { castShadow: true }),
  ];
  // Four corner posts carrying the peaked roof.
  const postH = 1.0;
  const postY = wellH + 0.06 + postH / 2;
  const cornerXZ = wellR + 0.05;
  const corners: [number, number][] = [
    [-cornerXZ, -cornerXZ], [cornerXZ, -cornerXZ],
    [-cornerXZ, cornerXZ], [cornerXZ, cornerXZ],
  ];
  for (const [cx, cz] of corners) {
    parts.push(
      f.mesh("Post", box(0.08, postH, 0.08), post, { position: [cx, postY, cz] }, {
        castShadow: true,
      }),
    );
  }
  // Peaked roof — two sloping panels meeting at a ridge.
  const roofTopY = postY + postH / 2 + 0.04;
  const roofW = (cornerXZ + 0.18) * 2;
  const roofRise = 0.55;
  const roofHyp = Math.hypot(roofRise, roofW / 2);
  const roofSlope = Math.atan2(roofRise, roofW / 2);
  parts.push(
    f.mesh("Roof Front", box(roofHyp, 0.06, roofW + 0.1), roofShingle, {
      position: [-roofW / 4, roofTopY + roofRise / 2 - 0.02, 0],
      rotation: [0, 0, roofSlope],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof Back", box(roofHyp, 0.06, roofW + 0.1), roofShingle, {
      position: [roofW / 4, roofTopY + roofRise / 2 - 0.02, 0],
      rotation: [0, 0, -roofSlope],
    }, { castShadow: true, receiveShadow: true }),
    // Ridge cap.
    f.mesh("Roof Ridge", cylinder(0.06, 0.06, roofW + 0.12, 6), roofShingle, {
      position: [0, roofTopY + roofRise, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  );
  // Winch — a horizontal log between the front posts with a crank handle.
  const winchY = postY + 0.05;
  parts.push(
    f.mesh("Winch Log", cylinder(0.07, 0.07, cornerXZ * 2 - 0.1, 10), post, {
      position: [0, winchY, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
    f.mesh("Crank Arm", box(0.15, 0.025, 0.025), post, {
      position: [0, winchY + 0.06, cornerXZ - 0.04],
    }),
    f.mesh("Crank Grip", cylinder(0.018, 0.018, 0.06, 6), post, {
      position: [0.07, winchY + 0.06, cornerXZ - 0.04],
      rotation: [Math.PI / 2, 0, 0],
    }),
    // Rope going down from the winch to the bucket.
    f.mesh("Rope", cylinder(0.012, 0.012, winchY - 0.4, 5), rope, {
      position: [0, winchY / 2 + 0.2, 0],
    }),
    // Wooden bucket dangling above the water.
    f.group("Bucket", [
      f.mesh("Bucket Body", cylinder(0.13, 0.11, 0.18, 12), wood, {
        position: [0, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Bucket Band Top", cylinder(0.135, 0.135, 0.015, 12),
        std(C.ironGrey, 0.5, { metalness: 0.5 }),
        { position: [0, 0.08, 0] }),
      f.mesh("Bucket Band Bot", cylinder(0.115, 0.115, 0.015, 12),
        std(C.ironGrey, 0.5, { metalness: 0.5 }),
        { position: [0, -0.08, 0] }),
      f.mesh("Bucket Handle", cylinder(0.008, 0.008, 0.28, 5),
        std(C.ironGrey, 0.5, { metalness: 0.5 }),
        { position: [0, 0.12, 0], rotation: [0, 0, Math.PI / 2] }),
    ], { position: [0, wellH + 0.4, 0] }),
  );
  // A small stone bench beside the well for character.
  parts.push(
    f.mesh("Bench Slab", box(0.7, 0.1, 0.28), stoneDark, {
      position: [wellR + 0.7, 0.32, -wellR - 0.05],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Bench Leg L", box(0.14, 0.32, 0.22), stoneDark, {
      position: [wellR + 0.45, 0.16, -wellR - 0.05],
    }, { castShadow: true }),
    f.mesh("Bench Leg R", box(0.14, 0.32, 0.22), stoneDark, {
      position: [wellR + 0.95, 0.16, -wellR - 0.05],
    }, { castShadow: true }),
  );
  return f.group("Old Well", parts, { position: pos, rotation: [0, -Math.PI / 6, 0] });
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
 *  - Third pass — yard: a raised vegetable plot with tomato stakes and
 *    cabbages, a garden gnome on the lawn, a red-flag mailbox at the gate, a
 *    shepherd's-hook bird feeder and stepping stones to the bird bath; house:
 *    copper downspouts at the front corners, a stone front step with a jute
 *    welcome mat and a pair of terracotta urns with topiary balls flanking the
 *    door.
 *  - Fourth pass — yard: a stone-pedestal sundial with a bronze gnomon, a row
 *    of solar stake lights along the cobble path, a cottage birdhouse on a
 *    pole and festoon bulbs strung along the rose-arch crown; house: climbing
 *    ivy creeping up the chimney's south and east faces and a wrought-iron
 *    lightning rod planted on the chimney crown.
 *  - Fifth pass — yard: a board-and-batten garden shed with a pitched
 *    shingle roof, a stacked firewood pile beside it, an A-frame garden
 *    swing and a clothesline strung with three pieces of laundry; house:
 *    copper half-round eaves gutters and white porch railings flanking
 *    the front step; scene: a back-meadow ground plane that extends the
 *    scene beyond the rear fence, with a rolling hill, a brook crossed
 *    by a wooden footbridge, wildflowers, meadow trees and a perimeter
 *    post-and-rail fence.
 *  - Sixth pass — yard: a burlap-headed scarecrow with a crow on its
 *    crossarm, a five-pumpkin patch with winding vines, a parasol-shaded
 *    bistro patio set with two cushioned chairs and a teapot, and a
 *    coiled garden hose on a wall-mounted reel with a brass spigot; house:
 *    a pair of cascading hanging flower baskets on the porch canopy and a
 *    pine-needle wreath with a pink ribbon on the front door; scene: a
 *    side-orchard ground plane east of the lawn with a dry-stone retaining
 *    wall, a small grove of fruiting apple trees with windfall apples,
 *    rolling earth mounds, an old hay cart and a stone water well with a
 *    peaked shingle roof and a winched bucket.
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
    { x: VEGGIE_GARDEN_POS[0], z: VEGGIE_GARDEN_POS[2], r: 1.6 },
    { x: GARDEN_GNOME_POS[0], z: GARDEN_GNOME_POS[2], r: 0.7 },
    { x: MAILBOX_POS[0], z: MAILBOX_POS[2], r: 0.7 },
    { x: BIRD_FEEDER_POS[0], z: BIRD_FEEDER_POS[2], r: 0.9 },
    // Stepping-stone corridor between path and bird bath.
    { x: 2.2, z: STEPPING_STONE_Z, r: 0.9 },
    // Fourth-pass keep-outs — sundial pedestal and birdhouse pole.
    { x: SUNDIAL_POS[0], z: SUNDIAL_POS[2], r: 0.9 },
    { x: BIRDHOUSE_POS[0], z: BIRDHOUSE_POS[2], r: 0.9 },
    // Fifth-pass keep-outs — shed, firewood, swing, clothesline.
    { x: SHED_POS[0], z: SHED_POS[2], r: 1.8 },
    { x: FIREWOOD_POS[0], z: FIREWOOD_POS[2], r: 1.0 },
    { x: SWING_POS[0], z: SWING_POS[2], r: 1.5 },
    { x: CLOTHESLINE_POS[0], z: CLOTHESLINE_POS[2], r: 1.8 },
    // Sixth-pass keep-outs — scarecrow, pumpkin patch, patio set, hose reel.
    { x: SCARECROW_POS[0], z: SCARECROW_POS[2], r: 0.9 },
    { x: PUMPKIN_PATCH_POS[0], z: PUMPKIN_PATCH_POS[2], r: 1.2 },
    { x: PATIO_SET_POS[0], z: PATIO_SET_POS[2], r: 1.6 },
    { x: HOSE_REEL_POS[0], z: HOSE_REEL_POS[2], r: 0.5 },
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
    buildVegetableGarden(f, VEGGIE_GARDEN_POS),
    buildGardenGnome(f, GARDEN_GNOME_POS),
    buildMailbox(f, MAILBOX_POS),
    buildBirdFeeder(f, BIRD_FEEDER_POS),
    buildSteppingStones(f),
    buildSundial(f, SUNDIAL_POS),
    buildPathLights(f),
    buildBirdhouse(f, BIRDHOUSE_POS),
    buildRoseArchLights(f, ROSE_ARCH_Z),
    buildGardenShed(f, SHED_POS),
    buildFirewoodPile(f, FIREWOOD_POS),
    buildTreeSwing(f, SWING_POS),
    buildClothesline(f, CLOTHESLINE_POS),
    buildScarecrow(f, SCARECROW_POS),
    buildPumpkinPatch(f, PUMPKIN_PATCH_POS),
    buildPatioSet(f, PATIO_SET_POS),
    buildGardenHoseReel(f, HOSE_REEL_POS),
  ]);
  const meadow = buildBackMeadow(f);
  const orchard = buildSideOrchard(f);
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
    buildDownspouts(f),
    buildDoorstepMat(f),
    buildTopiaryUrns(f),
    buildChimneyIvy(f),
    buildLightningRod(f),
    buildRoofGutters(f),
    buildPorchRailings(f),
    buildHangingBaskets(f),
    buildDoorWreath(f),
    buildFurniture(f),
  ]);
  const root: SceneNode = {
    id: "dh-root",
    name: "Dollhouse",
    kind: "group",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    children: [garden, meadow, orchard, house],
  };
  return {
    schemaVersion: DOLLHOUSE_SCHEMA_VERSION,
    kind: "dollhouse",
    root,
    metadata: { name: "Pink Victorian Dollhouse" },
  };
}
