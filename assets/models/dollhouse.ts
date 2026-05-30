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

/**
 * Seventh-pass courtyard props — outdoor gathering and tidying. A round
 * fire pit on the east lawn (south of the patio set), a hexagonal gazebo
 * tucked into the southwest lawn, and a composter bin parked just north
 * of the garden shed in the back-left corner of the yard.
 */
const FIRE_PIT_POS: [number, number, number] = [8.5, 0, 5.0];
const GAZEBO_POS: [number, number, number] = [-9.5, 0, 7.5];
const COMPOSTER_POS: [number, number, number] = [-10.0, 0, -3.0];

/**
 * Seventh-pass scene extension — a Japanese-inspired west pond garden,
 * mirroring the side orchard's footprint along the lawn's western edge.
 * The garden overlaps the lawn by ~1 unit along the join so the ground
 * layer has no holes. It carries a koi pond ringed by polished river
 * stones, an arched stone footbridge, two stone garden lanterns, a pair
 * of weeping willows and scattered decorative boulders softened by moss.
 */
const POND_GARDEN_POS: [number, number, number] = [-33, -0.003, 5];
const POND_GARDEN_W = 18;
const POND_GARDEN_D = 28;
/** Mirror image of the orchard wall — the moss-stone curb along the lawn join. */
const POND_GARDEN_WALL_X = -25.5;
const KOI_POND_POS: [number, number, number] = [-33, 0, 4];
const KOI_POND_RADIUS = 3.4;
const STONE_BRIDGE_POS: [number, number, number] = [-29.6, 0, 4];
const WEST_LANTERN_A: [number, number, number] = [-37.5, 0, -2];
const WEST_LANTERN_B: [number, number, number] = [-37.5, 0, 11];

/**
 * Eighth-pass courtyard props — outdoor dining and tidy storage. A rustic
 * picnic table with a red-checkered cloth and pair of benches on the west
 * lawn, a three-tier cascading stone fountain just off the cobble path on
 * the south lawn, and a leaning tool rack of garden implements parked
 * against the back-corner shed.
 */
const PICNIC_TABLE_POS: [number, number, number] = [-5.5, 0, -2.2];
const STONE_FOUNTAIN_POS: [number, number, number] = [-1.6, 0, 8.0];
const TOOL_RACK_POS: [number, number, number] = [-6.2, 0, -4.0];

/**
 * Eighth-pass scene extension — a north lakefront plane reaching beyond
 * the back meadow's far edge. The plane overlaps the meadow by ~1 unit
 * so the ground layer joins seamlessly. It carries a calm open lake, a
 * wooden plank pier on mooring posts, a tied-up rowboat resting in the
 * shallows, fringes of cattails along the shoreline, a small grove of
 * lakeside conifers and a bobbing red-and-white channel buoy.
 */
const LAKEFRONT_POS: [number, number, number] = [0, -0.006, -56];
const LAKEFRONT_W = 60;
const LAKEFRONT_D = 34;
const LAKE_WATER_POS: [number, number, number] = [-2, 0.014, -60];
const LAKE_WATER_W = 38;
const LAKE_WATER_D = 22;
const LAKE_PIER_POS: [number, number, number] = [9, 0, -50];
const ROWBOAT_POS: [number, number, number] = [12.4, 0, -55];
const BUOY_POS: [number, number, number] = [-14, 0, -64];

/**
 * Ninth-pass courtyard props — a small bee apiary on a slate platform behind
 * the vegetable garden, a marble bunny garden statue on a column pedestal on
 * the south lawn, and a black kettle BBQ grill on three legs by the patio set.
 * Each new mesh that carries a procedural texture also references a paired
 * depth (bump) map registered in the renderer's texture library, so the
 * marble veins on the pedestal and the honeycomb cells on the hive front
 * read as relief instead of flat decals.
 */
const APIARY_POS: [number, number, number] = [9.5, 0, 11.5];
const GARDEN_STATUE_POS: [number, number, number] = [6.5, 0, 2.0];
const BBQ_GRILL_POS: [number, number, number] = [11.0, 0, 7.5];

/**
 * Ninth-pass scene extension — a south heath plane reaching beyond the front
 * yard's far edge. The plane overlaps the main lawn by ~1 unit at z = 32 so
 * the ground layer joins seamlessly. It carries a rolling earth mound, a
 * miniature standing stone circle, scattered heather shrubs, three slender
 * birch trees and a winding dirt continuation of the cobble path that
 * disappears into the distance.
 */
const HEATH_POS: [number, number, number] = [0, -0.007, 46];
const HEATH_W = 50;
const HEATH_D = 28;
const STANDING_STONES_POS: [number, number, number] = [-9, 0, 50];
const HEATH_MOUND_POS: [number, number, number] = [12, 0, 52];

/**
 * Tenth-pass courtyard props — a cast-iron hand-pump well with a stone trough
 * on the west lawn, a grape-vined wooden arbor over the back-east lawn edge,
 * and a pair of weathered copper rain barrels under the house's front-corner
 * downspouts. The barrels use a new procedural copper-patina colour map paired
 * with a depth (bump) map registered in the texture library, so the verdigris
 * mottling on the copper reads as crusted relief instead of a flat decal.
 */
const HAND_PUMP_POS: [number, number, number] = [-7.8, 0, -1.0];
const GRAPE_ARBOR_POS: [number, number, number] = [7.6, 0, -2.4];
const RAIN_BARREL_L_POS: [number, number, number] = [-W / 2 - 0.35, 0, FRONT_Z - 0.5];
const RAIN_BARREL_R_POS: [number, number, number] = [W / 2 + 0.35, 0, FRONT_Z - 0.5];

/**
 * Tenth-pass scene extension — a northeast pasture plane that fills the
 * empty corner between the back meadow's east edge (x ≈ +25) and the side
 * orchard's north edge (z ≈ -9). The plane overlaps the meadow by ~1 unit
 * along its west join and the orchard by ~1 unit along its south join so
 * the ground layer has no holes at the seams. It carries a small wooden
 * horse stable with a gabled roof, a pair of stacked round hay bales, a
 * split-rail pasture fence following two sides of the plane and a couple
 * of meadow-tone grass tufts.
 */
const NE_PASTURE_POS: [number, number, number] = [34, -0.008, -24];
const NE_PASTURE_W = 18;
const NE_PASTURE_D = 32;
const STABLE_POS: [number, number, number] = [37, 0, -32];
const HAY_BALES_POS: [number, number, number] = [30, 0, -18];

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
  // Seventh enhancement pass — fire pit + ember glow, gazebo, composter,
  // porch step rails, striped awnings, and a Japanese-style west pond
  // garden scene extension (koi pond, arched stone bridge, stone lanterns,
  // weeping willows, decorative boulders).
  firePitStone: "#5a544c",
  firePitAsh: "#2c2825",
  firePitEmber: "#f07a2c",
  emberGlow: "#ffb348",
  gazeboPost: "#f0e2c8",
  gazeboRoof: "#bd6c8e",
  gazeboTrim: "#fdfbf4",
  composterWood: "#5c4326",
  composterBin: "#3a2a1e",
  awningCream: "#fff5e6",
  awningStripe: "#e6738d",
  pondGardenGrass: "#80a85a",
  koiWater: "#3f8aa2",
  koiSurface: "#84c2d8",
  koiOrange: "#e88341",
  bridgeStone: "#a89b8a",
  bridgeStoneDark: "#766a5b",
  lanternStone: "#8c8278",
  lanternGlow: "#ffd989",
  willowTrunk: "#5e4a30",
  willowFoliage: "#7ea64b",
  boulderRock: "#8a8580",
  boulderShade: "#5a564f",
  cherryBlossom: "#f4c7d4",
  mossGreen: "#4d6f3a",
  // Eighth enhancement pass — picnic table with checkered cloth, three-tier
  // stone fountain with cascading water, an A-frame tool rack of garden
  // implements, the front-eave bistro string lights along the porch fascia,
  // and the north lakefront scene extension (open lake water, wooden pier,
  // moored rowboat, cattail fringes, lakeside conifers and a channel buoy).
  clothCheckRed: "#c2403a",
  clothCheckCream: "#fff5e8",
  fountainStone: "#a89e90",
  fountainStoneDark: "#776c5c",
  fountainWater: "#7eb6cf",
  fountainSplash: "#fdfefe",
  toolHandle: "#7a5236",
  toolMetalDark: "#3e4148",
  toolMetalLight: "#a3a7ad",
  bistroBulb: "#ffe9a8",
  bistroBulbGlow: "#fff1c4",
  bistroWire: "#1f1c1a",
  lakefrontGrass: "#86a85f",
  lakefrontSand: "#cdb98a",
  lakeWater: "#3b6e8c",
  lakeShallow: "#7faec5",
  lakeShoreReed: "#5d8a48",
  pierPlank: "#5e4530",
  pierPost: "#3b2a1e",
  pierTrim: "#a98359",
  boatHull: "#bd5a3d",
  boatTrim: "#fff5e8",
  boatInterior: "#8a6240",
  cattailHead: "#5a4022",
  buoyRed: "#c84a3f",
  buoyWhite: "#fdf6f0",
  // Ninth enhancement pass — a bee apiary, a marble garden statue, a kettle
  // BBQ grill, and a south-heath scene extension with heather, standing
  // stones, birches and a rolling earth mound.
  hiveWhite: "#f1ead4",
  hiveHoney: "#d49b3a",
  hiveRoof: "#3f3a36",
  slatePlate: "#4a4944",
  marbleCream: "#ede2d0",
  bunnyShade: "#cbb8a4",
  grillBody: "#1a1a1a",
  grillSilver: "#c5c8cf",
  grillEmber: "#e85d2a",
  heathGround: "#75673f",
  heathMoss: "#5e6a3a",
  heatherBloom: "#a35aa6",
  heatherDark: "#6b4477",
  birchTrunk: "#f0e8d8",
  birchBark: "#2c2823",
  birchFoliage: "#8fb05e",
  // Tenth enhancement pass — a cast-iron hand pump and stone trough, a
  // grape-vined wooden arbor, copper rain barrels and the northeast
  // pasture scene extension with a stable, hay bales and a split-rail
  // fence corner. The copper patina pair (colour + bump) is registered in
  // the renderer's texture library so the verdigris reads as relief.
  copperPatina: "#5fa884",
  copperPatinaDark: "#2d6849",
  copperRim: "#a06a3c",
  pumpIron: "#2a2622",
  pumpHandle: "#3a2c1c",
  troughStone: "#8a8278",
  troughWater: "#5b91a4",
  arborWood: "#7c5536",
  grapeLeaf: "#587f3a",
  grapeLeafDark: "#3d5a28",
  grapePurple: "#5c3c7a",
  pastureGrass: "#8aa75e",
  pastureGrassDark: "#5e7a3a",
  stableWall: "#6b4a2c",
  stableTrim: "#dcc89b",
  stableRoof: "#5c2a2a",
  stableDoor: "#3a2218",
  hayBale: "#d4a85a",
  hayBaleDark: "#a87f2c",
  pastureFence: "#b89a72",
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

/* ─────────────────── seventh-pass courtyard props ─────────────────── */

/**
 * A round stone fire pit — a low ring of mortared field stones around an
 * ash pit, three crossed logs in the middle and a cluster of glowing
 * ember spheres at the heart of the pile. Eight sittable log rounds
 * arranged around the ring give it a "campfire" feel without ringing
 * the whole pit with seating that fights the patio set.
 */
function buildFirePit(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.firePitStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.firePitAsh, 0.95, { flatShading: true });
  const log = std(C.logBark, 0.9, { texture: "bark", flatShading: true });
  const logFlesh = std(C.logFlesh, 0.85, { flatShading: true });
  const ember = std(C.firePitEmber, 0.5, { emissive: C.emberGlow, flatShading: true });
  const ash = std(C.firePitAsh, 0.95);
  const pitR = 0.85;
  const ringStones = 14;
  const parts: SceneNode[] = [];
  // Ring of stacked stones.
  for (let i = 0; i < ringStones; i++) {
    const a = (i / ringStones) * Math.PI * 2;
    const x = Math.cos(a) * pitR;
    const z = Math.sin(a) * pitR;
    const tilt = ((i * 137) % 7) / 30;
    parts.push(
      f.mesh("Stone", box(0.32, 0.24, 0.28), i % 3 === 0 ? stoneDark : stone, {
        position: [x, 0.12, z],
        rotation: [0, a + 0.15, tilt],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Ash circle inside the ring.
  parts.push(
    f.mesh("Ash Bed", cylinder(pitR - 0.18, pitR - 0.14, 0.04, 22), ash, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
  );
  // Three crossed logs at the centre.
  const logLen = 1.1;
  const logR = 0.085;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    parts.push(
      f.mesh("Log", cylinder(logR, logR, logLen, 8), log, {
        position: [0, 0.16 + i * 0.04, 0],
        rotation: [0, a, Math.PI / 2],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Log End A", cylinder(logR, logR, 0.018, 8), logFlesh, {
        position: [Math.cos(a) * (logLen / 2 - 0.01), 0.16 + i * 0.04, Math.sin(a) * (logLen / 2 - 0.01)],
        rotation: [0, a, Math.PI / 2],
      }),
      f.mesh("Log End B", cylinder(logR, logR, 0.018, 8), logFlesh, {
        position: [-Math.cos(a) * (logLen / 2 - 0.01), 0.16 + i * 0.04, -Math.sin(a) * (logLen / 2 - 0.01)],
        rotation: [0, a, Math.PI / 2],
      }),
    );
  }
  // Glowing ember cluster between the logs.
  const embers: Transform[] = [];
  const rng = mulberry32(0xe11be7);
  for (let i = 0; i < 9; i++) {
    embers.push({
      position: [(rng() - 0.5) * 0.5, 0.13 + rng() * 0.05, (rng() - 0.5) * 0.5],
      rotation: [rng(), rng(), rng()],
      scale: [0.6 + rng() * 0.6, 0.6 + rng() * 0.6, 0.6 + rng() * 0.6],
    });
  }
  parts.push(
    f.instanced("Embers", sphere(0.05, 6, 5), ember, embers),
  );
  // Three log stool seats around the pit (not a full ring — leaves room for the patio set).
  const stoolAngles = [Math.PI * 0.35, Math.PI * 0.95, Math.PI * 1.7];
  for (const a of stoolAngles) {
    const sr = pitR + 0.95;
    parts.push(
      f.group("Log Stool", [
        f.mesh("Stool Body", cylinder(0.22, 0.24, 0.42, 10), log, {
          position: [0, 0.21, 0],
        }, { castShadow: true, receiveShadow: true }),
        f.mesh("Stool Top", cylinder(0.22, 0.22, 0.02, 10), logFlesh, {
          position: [0, 0.42, 0],
        }),
      ], { position: [Math.cos(a) * sr, 0, Math.sin(a) * sr] }),
    );
  }
  return f.group("Fire Pit", parts, { position: pos });
}

/**
 * A hexagonal cottage gazebo — six creamy posts on a low octagonal stone
 * pad carrying a rose-pink shingle dome with a finial ball, and a small
 * curved bench wrapping the back three panels. Built airy so it reads as
 * a destination from across the lawn without crowding the patio.
 */
function buildGazebo(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const post = std(C.gazeboPost, 0.7, { texture: "wood", textureScale: [1, 4] });
  const trim = std(C.gazeboTrim, 0.7);
  const roof = std(C.gazeboRoof, 0.8, { texture: "shingle", textureScale: [2, 1.5] });
  const benchWood = std(C.walnut, 0.7, { texture: "wood" });
  const pad = std(C.stone, 0.95, { texture: "cobblestone", flatShading: true });
  const parts: SceneNode[] = [];
  const r = 1.6;
  const postH = 2.2;
  const sides = 6;
  // Stone pad — a low hexagonal slab.
  parts.push(
    f.mesh("Gazebo Pad", cylinder(r + 0.25, r + 0.32, 0.18, sides), pad, {
      position: [0, 0.09, 0],
    }, { receiveShadow: true, castShadow: true }),
    f.mesh("Pad Trim", cylinder(r + 0.27, r + 0.27, 0.03, sides), trim, {
      position: [0, 0.2, 0],
    }),
  );
  // Six corner posts.
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    parts.push(
      f.mesh("Post", box(0.12, postH, 0.12), post, {
        position: [Math.cos(a) * r, 0.18 + postH / 2, Math.sin(a) * r],
      }, { castShadow: true, receiveShadow: true }),
      // Decorative bracket at the top of each post.
      f.mesh("Bracket", box(0.18, 0.22, 0.18), trim, {
        position: [Math.cos(a) * r * 0.92, 0.18 + postH - 0.04, Math.sin(a) * r * 0.92],
        rotation: [0, a, 0],
      }, { castShadow: true }),
    );
  }
  // Hexagonal roof dome — a six-sided cone, rotated so its flats line up
  // with the gaps between posts and its corners sit above the posts.
  const roofRise = 0.9;
  const roofPeak = 0.18 + postH + roofRise;
  parts.push(
    f.mesh("Roof Dome", cone(r + 0.3, roofRise, 6), roof, {
      position: [0, 0.18 + postH + roofRise / 2, 0],
      rotation: [0, Math.PI / sides, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A thin ring at the eave to read as a fascia / drip edge.
    f.mesh("Roof Fascia", cylinder(r + 0.32, r + 0.32, 0.05, sides), trim, {
      position: [0, 0.18 + postH + 0.025, 0],
      rotation: [0, Math.PI / sides, 0],
    }, { castShadow: true }),
  );
  // Finial — a ball atop a short stem at the dome peak.
  parts.push(
    f.mesh("Finial Stem", cylinder(0.04, 0.04, 0.18, 6), trim, {
      position: [0, roofPeak + 0.1, 0],
    }),
    f.mesh("Finial Ball", sphere(0.12, 10, 8), roof, {
      position: [0, roofPeak + 0.26, 0],
    }, { castShadow: true }),
  );
  // Curved bench wrapping three back panels.
  for (let i = 0; i < 3; i++) {
    const a = Math.PI + (i - 1) * (Math.PI / sides) * 2;
    const br = r - 0.28;
    parts.push(
      f.mesh("Bench Seat", box(r * 0.95, 0.05, 0.32), benchWood, {
        position: [Math.cos(a) * br, 0.5, Math.sin(a) * br],
        rotation: [0, a + Math.PI / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Bench Back", box(r * 0.95, 0.45, 0.05), benchWood, {
        position: [Math.cos(a) * (br + 0.13), 0.7, Math.sin(a) * (br + 0.13)],
        rotation: [0, a + Math.PI / 2, 0],
      }, { castShadow: true }),
    );
  }
  // Hanging lantern at the centre of the dome — a small glowing sphere.
  parts.push(
    f.mesh("Lantern Rope", cylinder(0.008, 0.008, 0.5, 4), benchWood, {
      position: [0, roofPeak - 0.45, 0],
    }),
    f.mesh("Lantern", sphere(0.1, 10, 8),
      std(C.lampGlow, 0.4, { emissive: "#f7d28c" }),
      { position: [0, roofPeak - 0.75, 0] },
      { castShadow: true }),
  );
  return f.group("Gazebo", parts, { position: pos, rotation: [0, Math.PI / 12, 0] });
}

/**
 * A pair of slatted compost bins beside the garden shed — open-top
 * wooden frames filled with darker mulch, with a small pitchfork leaning
 * on one bin and a scattering of stray leaves on the lid of the other.
 */
function buildComposterBin(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.composterWood, 0.92, { texture: "wood", flatShading: true });
  const mulch = std(C.composterBin, 0.95, { flatShading: true });
  const metal = std(C.ironGrey, 0.5, { metalness: 0.5, flatShading: true });
  const handle = std(C.walnut, 0.8, { texture: "wood" });
  const leaf = std(C.appleFoliage, 0.95, { flatShading: true });
  const binW = 0.62;
  const binH = 0.62;
  const binD = 0.55;
  const parts: SceneNode[] = [];
  // Two bins side-by-side along X.
  for (let b = 0; b < 2; b++) {
    const xOff = (b - 0.5) * (binW + 0.05);
    // Four corner posts.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(
          f.mesh("Post", box(0.06, binH + 0.04, 0.06), wood, {
            position: [xOff + sx * binW / 2, binH / 2, sz * binD / 2],
          }, { castShadow: true, receiveShadow: true }),
        );
      }
    }
    // Slatted side and back walls.
    for (let s = 0; s < 3; s++) {
      const y = 0.12 + s * 0.2;
      parts.push(
        f.mesh("Slat Back", box(binW, 0.12, 0.025), wood, {
          position: [xOff, y, -binD / 2 + 0.012],
        }, { castShadow: true }),
        f.mesh("Slat Left", box(0.025, 0.12, binD), wood, {
          position: [xOff - binW / 2 + 0.012, y, 0],
        }, { castShadow: true }),
        f.mesh("Slat Right", box(0.025, 0.12, binD), wood, {
          position: [xOff + binW / 2 - 0.012, y, 0],
        }, { castShadow: true }),
        f.mesh("Slat Front", box(binW, 0.12, 0.025), wood, {
          position: [xOff, y, binD / 2 - 0.012],
        }, { castShadow: true }),
      );
    }
    // Heap of mulch inside.
    parts.push(
      f.mesh("Mulch", box(binW - 0.08, 0.25, binD - 0.08), mulch, {
        position: [xOff, 0.16, 0],
      }, { receiveShadow: true }),
      f.mesh("Mulch Mound", sphere(0.22, 10, 7), mulch, {
        position: [xOff, 0.42, 0],
        scale: [1.3, 0.5, 1.0],
      }),
    );
  }
  // Pitchfork leaning on the right bin — handle + four tines.
  parts.push(
    f.mesh("Fork Handle", cylinder(0.022, 0.022, 1.4, 6), handle, {
      position: [binW + 0.4, 0.7, binD / 2 + 0.15],
      rotation: [-0.25, 0, 0.35],
    }, { castShadow: true }),
    f.mesh("Fork Head", box(0.16, 0.06, 0.02), metal, {
      position: [binW + 0.62, 1.36, binD / 2 + 0.3],
      rotation: [-0.25, 0, 0.35],
    }),
  );
  for (let i = 0; i < 4; i++) {
    parts.push(
      f.mesh("Fork Tine", cylinder(0.012, 0.012, 0.18, 4), metal, {
        position: [binW + 0.56 + i * 0.04, 1.46, binD / 2 + 0.32],
        rotation: [-0.25, 0, 0.35],
      }),
    );
  }
  // A few fallen leaves on the left lid.
  const leafRng = mulberry32(0x1eaf);
  const leaves: Transform[] = [];
  for (let i = 0; i < 8; i++) {
    leaves.push({
      position: [-binW / 2 - 0.5 + (leafRng() - 0.5) * binW, 0.66, (leafRng() - 0.5) * binD],
      rotation: [Math.PI / 2 + leafRng() * 0.2, leafRng() * Math.PI, 0],
      scale: [0.7 + leafRng() * 0.4, 0.7 + leafRng() * 0.4, 1],
    });
  }
  parts.push(
    f.instanced("Loose Leaves", plane(0.12, 0.12), leaf, leaves, { castShadow: false }),
  );
  return f.group("Composter Bin", parts, { position: pos, rotation: [0, -Math.PI / 6, 0] });
}

/* ─────────────────── seventh-pass house enhancements ─────────────────── */

/**
 * A formal topiary edging running alongside the cobble path from the
 * porch out to the gate — five clipped dwarf hedge balls on each side,
 * planted in shallow soil mounds so the path reads as a deliberate
 * approach to the front door rather than a casual track.
 */
function buildPorchSteps(f: NodeFactory): SceneNode {
  const hedge = std(C.hedge, 0.9, { flatShading: true });
  const hedgeDark = std(C.foliage, 0.9, { flatShading: true });
  const soil = std(C.soil, 0.95, { flatShading: true });
  const balls: SceneNode[] = [];
  // Path runs along x ≈ 0; cobble stones span x in [-0.55, +0.55]. Place
  // edging at x = ±0.9 — outside the stones but still hugging the path.
  const startZ = FRONT_Z + 1.4;
  const step = 1.7;
  const count = 5;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const z = startZ + i * step;
      const big = i % 2 === 0;
      balls.push(
        f.group("Topiary Ball", [
          // Soil mound under the ball.
          f.mesh("Soil Mound", cylinder(big ? 0.22 : 0.18, big ? 0.26 : 0.22, 0.07, 12), soil, {
            position: [0, 0.035, 0],
          }, { receiveShadow: true }),
          // Clipped hedge sphere — alternating size and a tonally darker
          // every-other ball, like a real planted lineup.
          f.mesh(
            "Ball",
            sphere(big ? 0.2 : 0.16, 12, 10),
            i % 2 === 0 ? hedge : hedgeDark,
            { position: [0, big ? 0.27 : 0.23, 0], scale: [1, 0.95, 1] },
            { castShadow: true, receiveShadow: true },
          ),
        ], { position: [sx * 0.9, 0, z] }),
      );
    }
  }
  return f.group("Porch Topiary Edging", balls);
}

/**
 * Striped canvas awnings projecting over the upper-storey back-wall
 * windows — one per upper floor, sitting just above the existing
 * shutters and flower boxes. Each is a sloping rectangle of cream and
 * pink stripes with a scalloped valance and two side arm supports.
 */
function buildWindowAwnings(f: NodeFactory): SceneNode {
  const awning = std(C.awningCream, 0.85, { texture: "awning-stripe", textureScale: [1, 0.5] });
  const trim = std(C.awningStripe, 0.85);
  // Stand the awning just forward of the back wall's interior face, where
  // the windows and shutters live (zFront = BACK_Z + WALL_T/2 in
  // buildWindowDressing). +0.05 keeps the back lip flush against the wall.
  const z = BACK_Z + WALL_T / 2 + 0.05;
  const x = 2.3;
  // Window centres are at y = 1.3 + floor * FLOOR_H (top of window ≈ y+0.46);
  // place the awning's back lip ~0.55 above the centre so it caps the frame.
  const ys = [1.3 + FLOOR_H + 0.6, 1.3 + FLOOR_H * 2 + 0.6];
  const parts: SceneNode[] = [];
  for (const y of ys) {
    parts.push(
      f.group("Awning", [
        // Sloped canvas — a thin box tilted so the front edge dips lower.
        f.mesh("Canvas", box(1.05, 0.035, 0.5), awning, {
          position: [0, 0, 0.22],
          rotation: [-0.45, 0, 0],
        }, { castShadow: true, receiveShadow: true }),
        // Scalloped valance hanging from the front edge.
        f.mesh("Valance", box(1.05, 0.12, 0.025), trim, {
          position: [0, -0.18, 0.43],
        }, { castShadow: true }),
        // Two side arm supports running from the wall down to the eave.
        f.mesh("Arm L", cylinder(0.012, 0.012, 0.45, 5), trim, {
          position: [-0.5, -0.08, 0.22],
          rotation: [Math.PI / 2.4, 0, 0],
        }),
        f.mesh("Arm R", cylinder(0.012, 0.012, 0.45, 5), trim, {
          position: [0.5, -0.08, 0.22],
          rotation: [Math.PI / 2.4, 0, 0],
        }),
      ], { position: [x, y, z] }),
    );
  }
  return f.group("Window Awnings", parts);
}

/* ─────────────────── seventh-pass scene extension ─────────────────── */

/**
 * The west pond garden — a new ground plane west of the lawn that
 * overlaps the lawn by ~1 unit. A Japanese-inspired water garden with a
 * circular koi pond, an arched stone footbridge, two stone lanterns,
 * weeping willows softening the perimeter and decorative moss-flecked
 * boulders. Mirrors the side orchard's structural pattern so the scene
 * stays balanced east-to-west.
 */
function buildWestPondGarden(f: NodeFactory): SceneNode {
  return f.group("West Pond Garden", [
    // Pond garden ground plane.
    f.mesh(
      "Pond Garden Ground",
      plane(POND_GARDEN_W, POND_GARDEN_D),
      std(C.pondGardenGrass, 0.95, { texture: "grass", textureScale: [9, 12] }),
      { position: POND_GARDEN_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // Apron along the lawn join — mirrors the orchard apron so the seam
    // feathers cleanly under raking light.
    f.mesh(
      "Pond Garden Apron",
      plane(2.5, POND_GARDEN_D),
      std(C.grassDark, 0.95, { texture: "grass", textureScale: [1, 8] }),
      { position: [-25, -0.002, POND_GARDEN_POS[2]], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    buildKoiPond(f, KOI_POND_POS),
    buildStoneBridge(f, STONE_BRIDGE_POS),
    buildStoneLantern(f, WEST_LANTERN_A),
    buildStoneLantern(f, WEST_LANTERN_B),
    buildWeepingWillows(f),
    buildPondGardenBoulders(f),
    buildPondGardenWall(f),
  ]);
}

/**
 * The koi pond — a circular pool with a sand-coloured stone perimeter, a
 * lily-pad-strewn water surface and three orange koi just below it.
 */
function buildKoiPond(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.bridgeStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.bridgeStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const water = std(C.koiSurface, 0.2, {
    metalness: 0.25,
    transparent: true,
    opacity: 0.78,
    texture: "koi-water",
    textureScale: [2, 2],
  });
  const deepWater = std(C.koiWater, 0.3, { metalness: 0.15 });
  const koi = std(C.koiOrange, 0.5, { flatShading: true });
  const koiPale = std(C.flowerWhite, 0.5, { flatShading: true });
  const lilyPad = std(C.lilyPad, 0.85, { flatShading: true });
  const lilyFlower = std(C.flowerWhite, 0.6, { flatShading: true });
  const r = KOI_POND_RADIUS;
  const parts: SceneNode[] = [];
  // Outer stone ring — wider, darker capstones.
  const ringStones = 22;
  const ring: Transform[] = [];
  const ringCaps: Transform[] = [];
  for (let i = 0; i < ringStones; i++) {
    const a = (i / ringStones) * Math.PI * 2;
    const wob = ((i * 41) % 7) / 60;
    ring.push({
      position: [Math.cos(a) * r, 0.1, Math.sin(a) * r],
      rotation: [0, a, wob],
      scale: [0.55, 0.22, 0.45],
    });
    if (i % 2 === 0) {
      ringCaps.push({
        position: [Math.cos(a) * (r + 0.04), 0.22, Math.sin(a) * (r + 0.04)],
        rotation: [0, a, 0],
        scale: [0.58, 0.08, 0.5],
      });
    }
  }
  parts.push(
    f.instanced("Pond Stones", box(1, 1, 1), stone, ring, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.instanced("Pond Capstones", box(1, 1, 1), stoneDark, ringCaps, {
      castShadow: true,
      receiveShadow: true,
    }),
  );
  // Pond bed (dark deep water) and a brighter rippled surface above it.
  parts.push(
    f.mesh("Pond Bed", cylinder(r - 0.18, r - 0.18, 0.05, 28), deepWater, {
      position: [0, 0.03, 0],
    }, { receiveShadow: true }),
    f.mesh("Pond Surface", cylinder(r - 0.16, r - 0.16, 0.04, 28), water, {
      position: [0, 0.16, 0],
    }, { receiveShadow: true }),
  );
  // Lily pads scattered on the surface.
  const lilyRng = mulberry32(0x111ad);
  const lilies: Transform[] = [];
  const flowers: Transform[] = [];
  for (let i = 0; i < 9; i++) {
    const a = lilyRng() * Math.PI * 2;
    const rr = (lilyRng() * 0.7 + 0.1) * (r - 0.5);
    lilies.push({
      position: [Math.cos(a) * rr, 0.18, Math.sin(a) * rr],
      rotation: [0, lilyRng() * Math.PI, 0],
      scale: [0.7 + lilyRng() * 0.4, 1, 0.7 + lilyRng() * 0.4],
    });
    if (i % 3 === 0) {
      flowers.push({
        position: [Math.cos(a) * rr, 0.21, Math.sin(a) * rr],
        rotation: [0, lilyRng() * Math.PI, 0],
        scale: [1, 1, 1],
      });
    }
  }
  parts.push(
    f.instanced("Lily Pads", cylinder(0.24, 0.24, 0.02, 10), lilyPad, lilies, {
      castShadow: false,
      receiveShadow: true,
    }),
    f.instanced("Lily Flowers", sphere(0.05, 8, 6), lilyFlower, flowers),
  );
  // Three koi just under the surface — flattened orange ovoids with a white belly.
  const koiPositions: [number, number, number, number][] = [
    [r * 0.5, 0.13, r * 0.1, 0.3],
    [-r * 0.4, 0.13, r * 0.4, -1.2],
    [r * 0.2, 0.13, -r * 0.5, 2.2],
  ];
  for (const [kx, ky, kz, ra] of koiPositions) {
    parts.push(
      f.group("Koi", [
        f.mesh("Koi Body", sphere(0.16, 10, 7), koi, {
          position: [0, 0, 0],
          scale: [1.6, 0.55, 0.8],
        }),
        f.mesh("Koi Belly", sphere(0.13, 8, 6), koiPale, {
          position: [0, -0.04, 0],
          scale: [1.4, 0.4, 0.7],
        }),
        f.mesh("Koi Tail", cone(0.08, 0.18, 6), koi, {
          position: [-0.22, 0, 0],
          rotation: [0, 0, -Math.PI / 2],
        }),
      ], { position: [kx, ky, kz], rotation: [0, ra, 0] }),
    );
  }
  return f.group("Koi Pond", parts, { position: pos });
}

/**
 * An arched stone footbridge crossing the koi pond on its east side —
 * a curved span of mortared blocks with low side walls. The path
 * approaches it from the lawn join and exits onto the garden floor.
 */
function buildStoneBridge(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.bridgeStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.bridgeStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const moss = std(C.mossGreen, 0.95, { flatShading: true });
  const parts: SceneNode[] = [];
  // Five arching deck segments forming a gentle hump along Z.
  const segs = 7;
  const span = 3.4;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const z = (t - 0.5) * span;
    const rise = Math.sin(t * Math.PI) * 0.35;
    parts.push(
      f.mesh("Bridge Tread", box(0.95, 0.12, span / segs + 0.04), stone, {
        position: [0, 0.32 + rise, z],
        rotation: [Math.cos(t * Math.PI) * 0.18, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Two side rails — short walls following the arch.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const z = (t - 0.5) * span;
      const rise = Math.sin(t * Math.PI) * 0.35;
      parts.push(
        f.mesh("Rail Stone", box(0.1, 0.22, span / segs + 0.02), i % 2 === 0 ? stone : stoneDark, {
          position: [sx * 0.5, 0.55 + rise, z],
          rotation: [Math.cos(t * Math.PI) * 0.18, 0, 0],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
    // Cap blocks at each end of the rail.
    parts.push(
      f.mesh("Rail End", box(0.18, 0.3, 0.18), stoneDark, {
        position: [sx * 0.5, 0.45, -span / 2 - 0.04],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Rail End", box(0.18, 0.3, 0.18), stoneDark, {
        position: [sx * 0.5, 0.45, span / 2 + 0.04],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Two moss tufts on the rails for an aged look.
  parts.push(
    f.mesh("Moss Tuft A", sphere(0.07, 8, 6), moss, {
      position: [-0.5, 0.66, -0.4],
      scale: [1.4, 0.4, 1.0],
    }),
    f.mesh("Moss Tuft B", sphere(0.06, 8, 6), moss, {
      position: [0.5, 0.7, 0.6],
      scale: [1.2, 0.4, 1.0],
    }),
  );
  return f.group("Stone Bridge", parts, { position: pos });
}

/**
 * A stylised stone garden lantern — square plinth, slender shaft, roofed
 * fire box housing a warm glow, finial cap. Two are placed flanking the
 * pond, casting illumination across the surface.
 */
function buildStoneLantern(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.lanternStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.bridgeStoneDark, 0.95, { flatShading: true });
  const moss = std(C.mossGreen, 0.95, { flatShading: true });
  const glow = std(C.lanternGlow, 0.4, { emissive: C.lanternGlow });
  return f.group("Stone Lantern", [
    // Base plinth.
    f.mesh("Plinth", box(0.5, 0.18, 0.5), stone, {
      position: [0, 0.09, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Shaft.
    f.mesh("Shaft", cylinder(0.07, 0.09, 0.7, 8), stoneDark, {
      position: [0, 0.55, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Fire box platform.
    f.mesh("Platform", box(0.32, 0.05, 0.32), stone, {
      position: [0, 0.92, 0],
    }, { castShadow: true }),
    // Fire box walls — square frame with the glow inside.
    f.mesh("Box Frame", box(0.34, 0.32, 0.34), stoneDark, {
      position: [0, 1.1, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Box Glow", box(0.2, 0.22, 0.2), glow, {
      position: [0, 1.1, 0],
    }),
    // Pyramid roof — a low cone.
    f.mesh("Lantern Roof", cone(0.3, 0.22, 4), stone, {
      position: [0, 1.38, 0],
      rotation: [0, Math.PI / 4, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Finial pinecone.
    f.mesh("Finial", sphere(0.04, 8, 6), stoneDark, {
      position: [0, 1.55, 0],
    }),
    // A small moss patch crawling onto the plinth.
    f.mesh("Plinth Moss", sphere(0.1, 8, 6), moss, {
      position: [0.2, 0.2, 0.18],
      scale: [1.2, 0.35, 1.2],
    }),
  ], { position: pos, rotation: [0, ((pos[2] * 0.3) % Math.PI), 0] });
}

/**
 * Two weeping willows softening the pond garden's edges — wide, drooping
 * tear-drop foliage made from elongated, downward-scaled spheres.
 */
function buildWeepingWillows(f: NodeFactory): SceneNode {
  const trunkMat = std(C.willowTrunk, 0.95, { texture: "bark", flatShading: true });
  const foliage = std(C.willowFoliage, 0.85, { flatShading: true });
  const foliageDark = std(C.appleFoliage, 0.85, { flatShading: true });
  const layouts: { x: number; z: number; s: number }[] = [
    { x: -38.5, z: -8, s: 1.1 },
    { x: -38.5, z: 16, s: 1.0 },
    { x: -29, z: -7, s: 0.9 },
  ];
  const trees: SceneNode[] = [];
  for (let i = 0; i < layouts.length; i++) {
    const lay = layouts[i]!;
    const parts: SceneNode[] = [
      f.mesh("Trunk", cylinder(0.18, 0.24, 1.4, 8), trunkMat, {
        position: [0, 0.7, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Lower Limbs", sphere(0.4, 8, 6), trunkMat, {
        position: [0, 1.4, 0],
      }),
      // Wide drooping canopy — multiple flattened spheres tear-dropping down.
      f.mesh("Canopy A", sphere(1.4, 14, 10), foliage, {
        position: [0, 1.95, 0],
        scale: [1.2, 0.95, 1.2],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Canopy B", sphere(1.1, 12, 9), foliageDark, {
        position: [0.45, 1.65, -0.2],
        scale: [1.0, 1.1, 1.0],
      }, { castShadow: true }),
      f.mesh("Canopy C", sphere(1.0, 12, 9), foliage, {
        position: [-0.4, 1.6, 0.4],
        scale: [1.0, 1.15, 1.0],
      }, { castShadow: true }),
      // Two trailing whips that hang lower than the main canopy.
      f.mesh("Whip A", sphere(0.7, 10, 8), foliage, {
        position: [0.6, 1.1, 0.3],
        scale: [1.0, 1.6, 1.0],
      }, { castShadow: true }),
      f.mesh("Whip B", sphere(0.65, 10, 8), foliageDark, {
        position: [-0.55, 1.05, -0.35],
        scale: [1.0, 1.5, 1.0],
      }, { castShadow: true }),
    ];
    trees.push(
      f.group(`Willow ${i + 1}`, parts, {
        position: [lay.x, 0, lay.z],
        scale: [lay.s, lay.s, lay.s],
        rotation: [0, (i * 1.1) % (Math.PI * 2), 0],
      }),
    );
  }
  return f.group("Weeping Willows", trees);
}

/**
 * Decorative boulders scattered around the pond garden — large smooth
 * river rocks half-buried in the grass, with moss patches on the
 * shaded faces.
 */
function buildPondGardenBoulders(f: NodeFactory): SceneNode {
  const rock = std(C.boulderRock, 0.95, { flatShading: true });
  const rockDark = std(C.boulderShade, 0.95, { flatShading: true });
  const moss = std(C.mossGreen, 0.95, { flatShading: true });
  const layouts: { x: number; z: number; s: number; tilt: number }[] = [
    { x: -29.6, z: 9, s: 0.9, tilt: 0.2 },
    { x: -28.8, z: -3, s: 0.7, tilt: -0.15 },
    { x: -36, z: 12, s: 1.1, tilt: 0.3 },
    { x: -35.5, z: -6, s: 0.85, tilt: -0.25 },
    { x: -32, z: 14.5, s: 0.6, tilt: 0.1 },
    { x: -39, z: 3, s: 0.5, tilt: 0.4 },
  ];
  const parts: SceneNode[] = [];
  for (let i = 0; i < layouts.length; i++) {
    const lay = layouts[i]!;
    const mat = i % 2 === 0 ? rock : rockDark;
    parts.push(
      f.group("Boulder", [
        f.mesh("Boulder Body", sphere(0.7, 12, 9), mat, {
          position: [0, 0.35, 0],
          scale: [1.2, 0.7, 1.0],
        }, { castShadow: true, receiveShadow: true }),
        f.mesh("Moss Cap", sphere(0.4, 10, 7), moss, {
          position: [0.05, 0.55, 0.1],
          scale: [1.2, 0.32, 1.0],
        }),
      ], {
        position: [lay.x, 0, lay.z],
        scale: [lay.s, lay.s, lay.s],
        rotation: [lay.tilt * 0.3, lay.tilt, 0],
      }),
    );
  }
  return f.group("Pond Garden Boulders", parts);
}

/**
 * A low moss-flecked stone curb along the pond garden's east edge —
 * mirrors the orchard wall on the opposite side but is shorter (the
 * pond garden is meant to feel open and contemplative). A 1.4-unit gap
 * in the middle lets a doll cross between the lawn and the garden.
 */
function buildPondGardenWall(f: NodeFactory): SceneNode {
  const stone = std(C.dryStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.dryStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const moss = std(C.mossGreen, 0.95, { flatShading: true });
  const rng = mulberry32(0x70ddca11);
  const zMin = POND_GARDEN_POS[2] - POND_GARDEN_D / 2 + 1;
  const zMax = POND_GARDEN_POS[2] + POND_GARDEN_D / 2 - 1;
  const gapHalf = 0.7;
  const gapZ = POND_GARDEN_POS[2];
  const stones: Transform[] = [];
  const stonesDark: Transform[] = [];
  let z = zMin;
  while (z < zMax) {
    const w = 0.5 + rng() * 0.3;
    if (Math.abs(z - gapZ) < gapHalf || Math.abs(z + w - gapZ) < gapHalf) {
      z += w;
      continue;
    }
    const inst: Transform = {
      position: [POND_GARDEN_WALL_X + (rng() - 0.5) * 0.08, 0.16, z + w / 2],
      rotation: [0, rng() * 0.3 - 0.15, 0],
      scale: [w, 0.32, 0.4 + rng() * 0.18],
    };
    (rng() < 0.4 ? stonesDark : stones).push(inst);
    z += w * 0.97;
  }
  // A few moss tufts on the wall.
  const mossTufts: Transform[] = [];
  let mz = zMin + 1;
  while (mz < zMax) {
    if (Math.abs(mz - gapZ) > gapHalf) {
      mossTufts.push({
        position: [POND_GARDEN_WALL_X, 0.32, mz],
        rotation: [0, rng() * Math.PI, 0],
        scale: [1.0 + rng() * 0.6, 0.35, 0.7],
      });
    }
    mz += 1.8 + rng() * 1.4;
  }
  return f.group("Pond Garden Wall", [
    f.instanced("Wall Stones", box(1, 1, 1), stone, stones, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.instanced("Wall Stones Dark", box(1, 1, 1), stoneDark, stonesDark, {
      castShadow: true,
      receiveShadow: true,
    }),
    f.instanced("Wall Moss", sphere(0.1, 8, 6), moss, mossTufts),
  ]);
}

/* ─────────────────── eighth-pass courtyard props ─────────────────── */

/**
 * A rustic picnic table — two trestle X-frames carrying a slatted top with a
 * red-checkered cloth thrown over it, flanked by two slatted benches. The
 * cloth tapers down past the table edge so it hangs naturally over the side.
 */
function buildPicnicTable(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.walnut, 0.7, { texture: "wood", textureScale: [1, 3] });
  const woodDark = std(C.bark, 0.85, { texture: "wood", flatShading: true });
  const cloth = std(C.clothCheckRed, 0.95, {
    texture: "checkered-cloth",
    textureScale: [2, 1.4],
  });
  const clothEdge = std(C.clothCheckCream, 0.9, { flatShading: true });
  const tableL = 1.85;
  const tableW = 0.95;
  const tableY = 0.74;
  const benchY = 0.45;
  const benchOffset = 0.55;
  const parts: SceneNode[] = [];

  // Trestle X-frame legs at each end of the table.
  const trestle = (zPos: number): SceneNode[] => {
    return [
      f.mesh("Leg A", box(0.06, 0.86, 0.06), woodDark, {
        position: [-0.4, 0.43, zPos],
        rotation: [0, 0, 0.46],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Leg B", box(0.06, 0.86, 0.06), woodDark, {
        position: [0.4, 0.43, zPos],
        rotation: [0, 0, -0.46],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Cross Rail", box(0.78, 0.06, 0.06), woodDark, {
        position: [0, 0.38, zPos],
      }, { castShadow: true }),
    ];
  };
  parts.push(...trestle(-tableL / 2 + 0.16), ...trestle(tableL / 2 - 0.16));

  // Stretcher running between the trestles.
  parts.push(
    f.mesh("Stretcher", box(0.06, 0.06, tableL - 0.3), woodDark, {
      position: [0, 0.32, 0],
    }, { castShadow: true }),
  );

  // Slatted tabletop — five planks running lengthwise.
  const slats = 5;
  for (let i = 0; i < slats; i++) {
    const xOff = -tableW / 2 + (tableW / slats) * (i + 0.5);
    parts.push(
      f.mesh("Top Slat", box(tableW / slats - 0.02, 0.04, tableL), wood, {
        position: [xOff, tableY - 0.02, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Two end battens fixing the slats.
  for (const sz of [-1, 1] as const) {
    parts.push(
      f.mesh("Top Batten", box(tableW - 0.04, 0.03, 0.06), woodDark, {
        position: [0, tableY - 0.05, sz * (tableL / 2 - 0.18)],
      }),
    );
  }

  // Checkered tablecloth — a flat panel on the table with an apron flap on
  // each long side. Scale on the side flaps cheats the "draped" silhouette.
  parts.push(
    f.mesh("Tablecloth", box(tableW + 0.18, 0.01, tableL + 0.22), cloth, {
      position: [0, tableY + 0.012, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  for (const sx of [-1, 1] as const) {
    parts.push(
      f.mesh("Cloth Apron", box(0.02, 0.16, tableL + 0.18), cloth, {
        position: [sx * (tableW / 2 + 0.09), tableY - 0.06, 0],
        rotation: [0, 0, sx * 0.05],
      }, { castShadow: true }),
    );
  }
  for (const sz of [-1, 1] as const) {
    parts.push(
      f.mesh("Cloth End Apron", box(tableW + 0.16, 0.12, 0.02), cloth, {
        position: [0, tableY - 0.04, sz * (tableL / 2 + 0.11)],
        rotation: [sz * 0.05, 0, 0],
      }, { castShadow: true }),
    );
  }
  // Cream piping along the cloth hem on the long sides.
  for (const sx of [-1, 1] as const) {
    parts.push(
      f.mesh("Cloth Hem", box(0.025, 0.018, tableL + 0.2), clothEdge, {
        position: [sx * (tableW / 2 + 0.09), tableY - 0.135, 0],
      }),
    );
  }

  // Two benches running parallel to the table.
  for (const sx of [-1, 1] as const) {
    const bx = sx * (tableW / 2 + benchOffset);
    parts.push(
      f.mesh("Bench Top", box(0.28, 0.04, tableL - 0.05), wood, {
        position: [bx, benchY, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
    // Pair of legs per bench.
    for (const sz of [-1, 1] as const) {
      parts.push(
        f.mesh("Bench Leg", box(0.06, benchY, 0.22), woodDark, {
          position: [bx, benchY / 2, sz * (tableL / 2 - 0.22)],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
  }

  // A small wooden serving tray with two clay mugs at the centre of the table.
  const mug = std(C.terracotta, 0.65, { flatShading: true });
  parts.push(
    f.mesh("Serving Tray", box(0.5, 0.025, 0.32), woodDark, {
      position: [0, tableY + 0.04, 0],
    }, { castShadow: true }),
    f.mesh("Mug", cylinder(0.05, 0.05, 0.09, 10), mug, {
      position: [-0.1, tableY + 0.09, 0],
    }, { castShadow: true }),
    f.mesh("Mug", cylinder(0.05, 0.05, 0.09, 10), mug, {
      position: [0.1, tableY + 0.09, 0],
    }, { castShadow: true }),
    f.mesh("Mug Handle", cylinder(0.012, 0.012, 0.04, 6), mug, {
      position: [-0.16, tableY + 0.09, 0],
      rotation: [0, 0, Math.PI / 2],
    }),
    f.mesh("Mug Handle", cylinder(0.012, 0.012, 0.04, 6), mug, {
      position: [0.16, tableY + 0.09, 0],
      rotation: [0, 0, Math.PI / 2],
    }),
  );

  return f.group("Picnic Table", parts, { position: pos, rotation: [0, 0.2, 0] });
}

/**
 * A three-tier cascading stone fountain — a stepped basin stack on an
 * octagonal coping, with translucent water plates filling each bowl and a
 * stylised splash mist tuft at the lip of every step. The bowls grow
 * smaller as they climb, finishing in a finial sphere.
 */
function buildStoneFountain(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.fountainStone, 0.85, {
    texture: "cobblestone",
    flatShading: true,
  });
  const stoneDark = std(C.fountainStoneDark, 0.9, {
    texture: "cobblestone",
    flatShading: true,
  });
  const moss = std(C.mossGreen, 0.95, { flatShading: true });
  const water = {
    color: C.fountainWater,
    roughness: 0.08,
    metalness: 0.32,
    transparent: true,
    opacity: 0.82,
  };
  const splash = std(C.fountainSplash, 0.4, {
    transparent: true,
    opacity: 0.55,
    flatShading: true,
  });

  const parts: SceneNode[] = [];

  // Octagonal coping basin at the base.
  parts.push(
    f.mesh("Base Coping", cylinder(1.18, 1.28, 0.22, 8), stoneDark, {
      position: [0, 0.11, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Base Bowl", cylinder(1.04, 1.06, 0.16, 16), stone, {
      position: [0, 0.28, 0],
    }, { receiveShadow: true }),
    // Water in the lower basin.
    f.mesh("Base Water", cylinder(0.96, 0.96, 0.04, 24), water, {
      position: [0, 0.32, 0],
    }, { receiveShadow: true }),
  );

  // Middle tier — narrower bowl on a chunky pedestal.
  parts.push(
    f.mesh("Mid Pedestal", cylinder(0.32, 0.4, 0.55, 12), stone, {
      position: [0, 0.65, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Mid Bowl", cylinder(0.72, 0.74, 0.12, 14), stoneDark, {
      position: [0, 0.96, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Mid Water", cylinder(0.66, 0.66, 0.03, 18), water, {
      position: [0, 1.02, 0],
    }),
  );

  // Top tier — small bowl and finial.
  parts.push(
    f.mesh("Top Pedestal", cylinder(0.18, 0.24, 0.45, 10), stone, {
      position: [0, 1.27, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Top Bowl", cylinder(0.4, 0.42, 0.1, 12), stoneDark, {
      position: [0, 1.54, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Top Water", cylinder(0.34, 0.34, 0.02, 14), water, {
      position: [0, 1.59, 0],
    }),
    f.mesh("Finial Stem", cylinder(0.06, 0.08, 0.2, 8), stone, {
      position: [0, 1.71, 0],
    }, { castShadow: true }),
    f.mesh("Finial Ball", sphere(0.14, 12, 9), stoneDark, {
      position: [0, 1.88, 0],
    }, { castShadow: true }),
  );

  // Cascading splash mist — small flattened spheres along the spillways.
  const rng = mulberry32(0xfa017a1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      f.mesh("Top Spill", sphere(0.09, 8, 6), splash, {
        position: [Math.cos(a) * 0.4, 1.48, Math.sin(a) * 0.4],
        scale: [1, 0.4 + rng() * 0.2, 1],
      }),
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    parts.push(
      f.mesh("Mid Spill", sphere(0.12, 8, 6), splash, {
        position: [Math.cos(a) * 0.7, 0.92, Math.sin(a) * 0.7],
        scale: [1, 0.4 + rng() * 0.25, 1],
      }),
    );
  }

  // Moss patches along the lower coping for an aged look.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    parts.push(
      f.mesh("Coping Moss", sphere(0.13, 7, 5), moss, {
        position: [Math.cos(a) * 1.18, 0.2, Math.sin(a) * 1.18],
        scale: [1.1 + rng() * 0.5, 0.4, 0.7 + rng() * 0.4],
      }),
    );
  }

  // A few worn cobble stones around the fountain's base, suggesting a
  // small plaza of paving.
  const cobbleStones: Transform[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = 1.3 + rng() * 0.5;
    cobbleStones.push({
      position: [Math.cos(a) * r, 0.02, Math.sin(a) * r],
      rotation: [0, rng() * Math.PI, 0],
      scale: [0.32 + rng() * 0.18, 0.05 + rng() * 0.02, 0.32 + rng() * 0.18],
    });
  }
  parts.push(
    f.instanced("Plaza Cobbles", box(1, 1, 1), stoneDark, cobbleStones, {
      receiveShadow: true,
    }),
  );

  return f.group("Stone Fountain", parts, { position: pos });
}

/**
 * An A-frame wooden tool rack with four leaning garden implements — a
 * rake, a long-handled shovel, a hoe and a small pitchfork. Parked
 * against the back-corner shed so it reads as a tool stash.
 */
function buildToolRack(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.toolHandle, 0.7, { texture: "wood", flatShading: true });
  const woodDark = std(C.walnut, 0.85, { texture: "wood", flatShading: true });
  const metalDark = std(C.toolMetalDark, 0.55, { metalness: 0.6, flatShading: true });
  const metalLight = std(C.toolMetalLight, 0.45, { metalness: 0.7, flatShading: true });

  const rackW = 1.4;
  const rackH = 1.2;
  const parts: SceneNode[] = [];

  // Two A-frames at each end.
  for (const sx of [-1, 1] as const) {
    const ax = sx * rackW / 2;
    parts.push(
      f.mesh("Frame Leg L", box(0.05, rackH, 0.05), woodDark, {
        position: [ax - 0.13, rackH / 2, 0.08],
        rotation: [0, 0, sx * 0.0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Frame Leg R", box(0.05, rackH, 0.05), woodDark, {
        position: [ax + 0.13, rackH / 2, 0.08],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Frame Tie", box(0.32, 0.04, 0.04), woodDark, {
        position: [ax, rackH - 0.1, 0.08],
      }),
    );
  }
  // Top horizontal beam — the rail tools lean against.
  parts.push(
    f.mesh("Rail", box(rackW + 0.05, 0.06, 0.06), woodDark, {
      position: [0, rackH - 0.05, 0.08],
    }, { castShadow: true }),
    // Small backboard pegboard.
    f.mesh("Backboard", box(rackW - 0.08, 0.7, 0.04), wood, {
      position: [0, 0.7, 0.06],
    }, { castShadow: true, receiveShadow: true }),
  );

  // Tools leaning against the rail. Each tool is a long thin handle plus a
  // shaped head at the bottom — slight rotation so they fan across the rack.
  const handle = (x: number, len: number, tilt: number): SceneNode =>
    f.mesh("Handle", cylinder(0.018, 0.022, len, 6), wood, {
      position: [x, len / 2 - 0.04, 0.18],
      rotation: [tilt, 0, 0],
    }, { castShadow: true, receiveShadow: true });

  // Rake.
  parts.push(
    handle(-0.55, 1.4, -0.18),
    f.mesh("Rake Bar", box(0.32, 0.03, 0.04), metalDark, {
      position: [-0.55, 0.04, 0.42],
      rotation: [-0.18, 0, 0],
    }, { castShadow: true }),
  );
  for (let i = 0; i < 6; i++) {
    parts.push(
      f.mesh("Rake Tine", box(0.012, 0.12, 0.012), metalDark, {
        position: [-0.55 - 0.13 + i * 0.052, -0.05, 0.43],
        rotation: [-0.18, 0, 0],
      }),
    );
  }

  // Shovel — long handle, broad blade.
  parts.push(
    handle(-0.18, 1.42, -0.05),
    f.mesh("Shovel Blade", box(0.18, 0.22, 0.02), metalLight, {
      position: [-0.18, -0.04, 0.27],
      rotation: [-0.05, 0, 0],
    }, { castShadow: true }),
    f.mesh("Shovel Shoulder", cylinder(0.026, 0.022, 0.07, 6), metalLight, {
      position: [-0.18, 0.08, 0.26],
      rotation: [-0.05, 0, 0],
    }),
  );

  // Hoe.
  parts.push(
    handle(0.22, 1.36, 0.08),
    f.mesh("Hoe Head", box(0.22, 0.04, 0.12), metalDark, {
      position: [0.22, 0.0, 0.17],
      rotation: [0.08 + Math.PI / 6, 0, 0],
    }, { castShadow: true }),
  );

  // Small pitchfork.
  parts.push(
    handle(0.6, 1.32, 0.2),
    f.mesh("Fork Head", box(0.16, 0.04, 0.05), metalDark, {
      position: [0.6, -0.04, 0.06],
      rotation: [0.2, 0, 0],
    }),
  );
  for (let i = 0; i < 4; i++) {
    parts.push(
      f.mesh("Fork Tine", box(0.018, 0.18, 0.018), metalDark, {
        position: [0.55 + i * 0.034, -0.16, 0.04],
        rotation: [0.2, 0, 0],
      }),
    );
  }

  // A small bucket on the ground beside the rack.
  parts.push(
    f.mesh("Bucket", cylinder(0.16, 0.13, 0.22, 12), metalLight, {
      position: [0.78, 0.11, -0.05],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Bucket Rim", cylinder(0.165, 0.165, 0.02, 12), metalDark, {
      position: [0.78, 0.22, -0.05],
    }),
    f.mesh("Bucket Handle", cylinder(0.012, 0.012, 0.32, 6), metalDark, {
      position: [0.78, 0.3, -0.05],
      rotation: [0, 0, Math.PI / 2],
    }),
  );

  return f.group("Tool Rack", parts, { position: pos, rotation: [0, -0.35, 0] });
}

/* ─────────────────────── eighth-pass house detail ─────────────────────── */

/**
 * Bistro string lights strung along the front roof eave — a thin wire
 * draped from the porch canopy's east post across the front fascia to the
 * roof's east corner, dotted with warm glowing bulbs. The wire dips
 * slightly between bulbs to suggest the cable's slack.
 */
function buildEaveStringLights(f: NodeFactory): SceneNode {
  const wire = std(C.bistroWire, 0.6, { flatShading: true });
  const bulb = std(C.bistroBulb, 0.35, { emissive: C.bistroBulbGlow, transparent: false });
  const socket = std(C.bistroWire, 0.7, { flatShading: true });

  const eaveY = ROOF_TOP - 0.06;
  const startX = -W / 2 + 0.15;
  const endX = W / 2 - 0.15;
  const span = endX - startX;
  const cableZ = FRONT_Z + 0.07;
  const parts: SceneNode[] = [];

  // The wire — a thin cylinder running horizontally just under the fascia.
  parts.push(
    f.mesh("Eave Wire", cylinder(0.012, 0.012, span, 5), wire, {
      position: [(startX + endX) / 2, eaveY, cableZ],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
  );

  // Six bulbs evenly spaced, each on its own short drop-wire and socket.
  const bulbCount = 6;
  for (let i = 0; i < bulbCount; i++) {
    const t = (i + 0.5) / bulbCount;
    const bx = startX + span * t;
    // Slight sag in the middle of the wire — a tiny parabolic dip.
    const sag = Math.sin(t * Math.PI) * 0.05;
    const dropY = eaveY - 0.08 - sag;
    parts.push(
      f.mesh("Drop Wire", cylinder(0.008, 0.008, 0.16, 4), wire, {
        position: [bx, dropY + 0.04, cableZ],
      }),
      f.mesh("Bulb Socket", cylinder(0.026, 0.022, 0.05, 8), socket, {
        position: [bx, dropY - 0.05, cableZ],
      }),
      f.mesh("Bulb", sphere(0.06, 12, 8), bulb, {
        position: [bx, dropY - 0.12, cableZ],
      }, { castShadow: true }),
    );
  }

  // A small wall hook anchoring each end of the wire.
  for (const x of [startX, endX]) {
    parts.push(
      f.mesh("Eave Hook", box(0.04, 0.06, 0.04), socket, {
        position: [x, eaveY, cableZ - 0.02],
      }, { castShadow: true }),
    );
  }

  return f.group("Eave String Lights", parts);
}

/* ─────────────────── eighth-pass scene extension ─────────────────── */

/**
 * The lakefront scene extension — a large ground plane stretching beyond
 * the back meadow's far edge with a calm open lake, a wooden plank pier
 * on stout posts, a moored rowboat, cattail fringes along the shore, a
 * grove of lakeside conifers and a bobbing channel buoy. The lakefront
 * overlaps the meadow by ~1 unit along the join so the ground layer has
 * no holes.
 */
function buildNorthLakefront(f: NodeFactory): SceneNode {
  return f.group("North Lakefront", [
    // The lakefront ground plane itself — warmer / more golden grass than the
    // meadow, suggesting a sunlit clearing on the shore.
    f.mesh(
      "Lakefront Ground",
      plane(LAKEFRONT_W, LAKEFRONT_D),
      std(C.lakefrontGrass, 0.95, { texture: "grass", textureScale: [14, 8] }),
      { position: LAKEFRONT_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // A thin sand apron tracing the shore where the grass meets the water.
    f.mesh(
      "Shore Apron",
      plane(LAKE_WATER_W + 5, 3.5),
      std(C.lakefrontSand, 0.9, { texture: "grass", textureScale: [12, 2] }),
      {
        position: [LAKE_WATER_POS[0], -0.004, LAKE_WATER_POS[2] + LAKE_WATER_D / 2 + 1.4],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // Apron joining the meadow's far edge — a darker grass strip with the
    // same texture so the seam reads as one continuous lawn.
    f.mesh(
      "Lakefront Apron",
      plane(LAKEFRONT_W, 3),
      std(C.meadowGrassDark, 0.95, { texture: "grass", textureScale: [12, 1] }),
      { position: [0, -0.004, -40.5], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    buildLakeWater(f, LAKE_WATER_POS),
    buildLakePier(f, LAKE_PIER_POS),
    buildRowboat(f, ROWBOAT_POS),
    buildCattails(f),
    buildLakefrontTrees(f),
    buildMooringBuoy(f, BUOY_POS),
  ]);
}

/**
 * The lake water surface — an oval pool with a darker deep-water plate
 * sitting below a lighter shallow rim plate that fades to the shore. The
 * shallows are slightly transparent so the sand apron reads through. A
 * pair of stylised ripple highlights breaks up the surface.
 */
function buildLakeWater(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const deep = {
    color: C.lakeWater,
    roughness: 0.08,
    metalness: 0.4,
    transparent: true,
    opacity: 0.92,
    texture: "lake-water",
    textureScale: [3, 2] as const,
  };
  const shallow = {
    color: C.lakeShallow,
    roughness: 0.18,
    metalness: 0.3,
    transparent: true,
    opacity: 0.55,
  };
  const ripple = {
    color: C.laundryWhite,
    roughness: 0.05,
    transparent: true,
    opacity: 0.22,
  };
  return f.group("Lake", [
    // Shallow rim plate sits a hair below the deep plate so the deep colour
    // shows through where it overlaps.
    f.mesh(
      "Lake Shallow",
      plane(LAKE_WATER_W + 1.6, LAKE_WATER_D + 1.2),
      shallow,
      { position: [0, 0.005, 0], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    f.mesh(
      "Lake Deep",
      plane(LAKE_WATER_W, LAKE_WATER_D),
      deep,
      { position: [0, 0.012, 0], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // Two thin ripple highlights to suggest a gentle current.
    f.mesh(
      "Ripple A",
      plane(LAKE_WATER_W * 0.5, 0.18),
      ripple,
      { position: [-3, 0.018, -1], rotation: [-Math.PI / 2, 0, 0] },
    ),
    f.mesh(
      "Ripple B",
      plane(LAKE_WATER_W * 0.35, 0.14),
      ripple,
      { position: [4, 0.018, 3], rotation: [-Math.PI / 2, 0, 0] },
    ),
  ], { position: pos });
}

/**
 * A wooden plank pier sitting on six stout square posts that walk out
 * over the lake. The deck is six planks wide and runs ~7 units long;
 * the last bay carries a low railed nook for the moored rowboat.
 */
function buildLakePier(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const plank = std(C.pierPlank, 0.85, { texture: "wood", textureScale: [1, 2] });
  const post = std(C.pierPost, 0.95, { texture: "wood", flatShading: true });
  const trim = std(C.pierTrim, 0.8, { texture: "wood" });

  const pierLen = 7.6;
  const pierW = 1.4;
  const deckY = 0.45;
  const parts: SceneNode[] = [];

  // Three pairs of mooring posts under the deck.
  const postPairs = 3;
  for (let p = 0; p < postPairs; p++) {
    const tz = -pierLen / 2 + (pierLen / (postPairs - 1)) * p;
    for (const sx of [-1, 1] as const) {
      parts.push(
        f.mesh("Pier Post", box(0.14, 0.95, 0.14), post, {
          position: [sx * (pierW / 2 - 0.08), 0.45, tz],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
  }

  // Two stringers under the deck running the full length.
  for (const sx of [-1, 1] as const) {
    parts.push(
      f.mesh("Pier Stringer", box(0.06, 0.1, pierLen + 0.05), post, {
        position: [sx * (pierW / 2 - 0.1), deckY - 0.08, 0],
      }, { castShadow: true }),
    );
  }

  // Deck planks — running across the pier.
  const planks = 22;
  const plankD = pierLen / planks;
  for (let i = 0; i < planks; i++) {
    parts.push(
      f.mesh("Pier Plank", box(pierW, 0.04, plankD * 0.94), plank, {
        position: [0, deckY, -pierLen / 2 + plankD * (i + 0.5)],
      }, { castShadow: true, receiveShadow: true }),
    );
  }

  // Low railed nook at the lake end of the pier — two short posts and a
  // top rail, with a mooring cleat in the middle.
  for (const sx of [-1, 1] as const) {
    parts.push(
      f.mesh("Rail Post", box(0.08, 0.6, 0.08), post, {
        position: [sx * (pierW / 2 - 0.06), deckY + 0.3, -pierLen / 2 + 0.05],
      }, { castShadow: true }),
    );
  }
  parts.push(
    f.mesh("End Top Rail", box(pierW - 0.04, 0.05, 0.05), trim, {
      position: [0, deckY + 0.55, -pierLen / 2 + 0.05],
    }, { castShadow: true }),
    // Mooring cleat — a small T-shape on the deck.
    f.mesh("Cleat Body", cylinder(0.06, 0.06, 0.12, 8), trim, {
      position: [pierW / 2 - 0.18, deckY + 0.06, -pierLen / 2 + 0.6],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
  );

  // A small lantern hanging over the rail at the lake end.
  parts.push(
    f.mesh("Lantern Arm", box(0.05, 0.05, 0.3), post, {
      position: [0, deckY + 0.75, -pierLen / 2 + 0.05],
    }),
    f.mesh("Lantern Box", box(0.18, 0.22, 0.18), std(C.ironGrey, 0.5, {
      metalness: 0.4, flatShading: true,
    }), {
      position: [0, deckY + 0.62, -pierLen / 2 - 0.1],
    }, { castShadow: true }),
    f.mesh("Lantern Glow", box(0.12, 0.14, 0.12),
      std(C.lampGlow, 0.4, { emissive: "#f7d28c", transparent: true, opacity: 0.9 }),
      { position: [0, deckY + 0.62, -pierLen / 2 - 0.1] }),
  );

  // A coiled rope on the deck near the cleat — read as a few stacked rings.
  const rope = std(C.ropeJute, 0.95, { flatShading: true });
  for (let i = 0; i < 3; i++) {
    parts.push(
      f.mesh("Rope Coil", cylinder(0.07 + i * 0.01, 0.07 + i * 0.01, 0.02, 14), rope, {
        position: [-pierW / 2 + 0.32, deckY + 0.04 + i * 0.018, -pierLen / 2 + 0.95],
      }),
    );
  }

  return f.group("Lake Pier", parts, { position: pos, rotation: [0, Math.PI / 2, 0] });
}

/**
 * A small wooden rowboat moored to the lake end of the pier. Three thwart
 * benches across the hull, two long oars resting across the gunwales, a
 * tiny brass painter looping forward over the bow.
 */
function buildRowboat(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const hull = std(C.boatHull, 0.7, { texture: "wood", textureScale: [2, 1] });
  const trim = std(C.boatTrim, 0.7, { texture: "wood" });
  const inside = std(C.boatInterior, 0.85, { texture: "wood" });
  const oar = std(C.walnut, 0.7, { texture: "wood", flatShading: true });

  const boatL = 2.4;
  const boatW = 0.95;
  const parts: SceneNode[] = [];

  // Hull — a long flattened box with two end tapers (small triangular bow and
  // stern caps). The body sits half-sunk in the water.
  parts.push(
    f.mesh("Hull Body", box(boatW, 0.32, boatL), hull, {
      position: [0, 0.14, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Bow taper — a flattened cone pointing forward.
    f.mesh("Bow", cone(boatW / 2, 0.7, 4), hull, {
      position: [0, 0.14, boatL / 2 + 0.34],
      rotation: [Math.PI / 2, 0, Math.PI / 4],
      scale: [1, 1, 0.6],
    }, { castShadow: true }),
    // Stern taper.
    f.mesh("Stern", cone(boatW / 2, 0.5, 4), hull, {
      position: [0, 0.14, -boatL / 2 - 0.24],
      rotation: [-Math.PI / 2, 0, Math.PI / 4],
      scale: [1, 1, 0.6],
    }, { castShadow: true }),
  );

  // Interior shell — a slightly smaller darker box inset into the hull so the
  // boat reads as open-topped from above.
  parts.push(
    f.mesh("Inside Pan", box(boatW - 0.14, 0.04, boatL - 0.18), inside, {
      position: [0, 0.26, 0],
    }, { receiveShadow: true }),
  );

  // Gunwale trim — a thin cream rim around the top edge of the hull.
  parts.push(
    f.mesh("Gunwale L", box(0.04, 0.05, boatL + 0.4), trim, {
      position: [-boatW / 2, 0.31, 0],
    }, { castShadow: true }),
    f.mesh("Gunwale R", box(0.04, 0.05, boatL + 0.4), trim, {
      position: [boatW / 2, 0.31, 0],
    }, { castShadow: true }),
    f.mesh("Gunwale Bow", box(boatW, 0.05, 0.04), trim, {
      position: [0, 0.31, boatL / 2 + 0.18],
    }),
    f.mesh("Gunwale Stern", box(boatW, 0.05, 0.04), trim, {
      position: [0, 0.31, -boatL / 2 - 0.12],
    }),
  );

  // Three thwart benches across the hull.
  for (let i = 0; i < 3; i++) {
    const tz = -boatL / 2 + (boatL / 4) * (i + 1);
    parts.push(
      f.mesh("Thwart", box(boatW - 0.06, 0.05, 0.18), trim, {
        position: [0, 0.32, tz],
      }, { castShadow: true }),
    );
  }

  // Two oars resting across the gunwales, blades aft.
  for (const sx of [-1, 1] as const) {
    parts.push(
      f.mesh("Oar Shaft", cylinder(0.024, 0.024, 1.6, 7), oar, {
        position: [sx * 0.12, 0.36, -0.05],
        rotation: [0, sx * 0.05, Math.PI / 2 - sx * 0.1],
      }, { castShadow: true }),
      f.mesh("Oar Blade", box(0.08, 0.02, 0.32), oar, {
        position: [sx * 0.86, 0.36, -0.18],
        rotation: [0, sx * 0.05, 0],
      }),
      // Oarlock — a small upright at the gunwale.
      f.mesh("Oarlock", cylinder(0.016, 0.016, 0.1, 6), trim, {
        position: [sx * (boatW / 2), 0.36, 0],
      }),
    );
  }

  // Painter (mooring rope) looping forward off the bow.
  parts.push(
    f.mesh("Painter", cylinder(0.012, 0.012, 0.9, 6), std(C.ropeJute, 0.95), {
      position: [0, 0.32, boatL / 2 + 0.55],
      rotation: [0.3, 0, Math.PI / 2],
    }),
  );

  return f.group("Rowboat", parts, { position: pos, rotation: [0, -0.18, 0] });
}

/**
 * Cattail clusters along the lake shore — two stems of slender green
 * leaves and a tall brown sausage seed-head per clump, instanced in
 * three colour groups across the shoreline.
 */
function buildCattails(f: NodeFactory): SceneNode {
  const rng = mulberry32(0xca770a17);
  const stemMat = std(C.lakeShoreReed, 0.85, { flatShading: true });
  const headMat = std(C.cattailHead, 0.95, { flatShading: true });
  const tipMat = std(C.strawHay, 0.9, { flatShading: true });

  const stems: Transform[] = [];
  const heads: Transform[] = [];
  const tips: Transform[] = [];

  // Concentrate clusters along the curving lake shoreline — three short arcs
  // at different shore points.
  const shoreSegments: { cx: number; cz: number; r: number; arcStart: number; arcEnd: number }[] = [
    { cx: LAKE_WATER_POS[0], cz: LAKE_WATER_POS[2] + LAKE_WATER_D / 2 + 0.4, r: 14, arcStart: -1.3, arcEnd: -0.5 },
    { cx: LAKE_WATER_POS[0] - 12, cz: LAKE_WATER_POS[2], r: 4, arcStart: 1.6, arcEnd: 2.4 },
    { cx: LAKE_WATER_POS[0] + 14, cz: LAKE_WATER_POS[2] + 4, r: 4, arcStart: 0.3, arcEnd: 1.1 },
  ];
  for (const seg of shoreSegments) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = seg.arcStart + (seg.arcEnd - seg.arcStart) * t;
      const wobbleR = seg.r + (rng() - 0.5) * 1.2;
      const x = seg.cx + Math.cos(a) * wobbleR;
      const z = seg.cz + Math.sin(a) * wobbleR;
      // Bunch two stems per clump.
      for (let s = 0; s < 2; s++) {
        const sx = x + (rng() - 0.5) * 0.18;
        const sz = z + (rng() - 0.5) * 0.18;
        const h = 0.9 + rng() * 0.35;
        stems.push({
          position: [sx, h / 2, sz],
          rotation: [0, rng() * Math.PI, (rng() - 0.5) * 0.12],
          scale: [1, h / 1.0, 1],
        });
        if (s === 0) {
          heads.push({
            position: [sx, h + 0.14, sz],
            rotation: [0, rng() * Math.PI, 0],
            scale: [1, 1, 1],
          });
          tips.push({
            position: [sx, h + 0.32, sz],
            rotation: [0, rng() * Math.PI, 0],
            scale: [1, 1, 1],
          });
        }
      }
    }
  }

  return f.group("Cattails", [
    f.instanced("Cattail Stems", cylinder(0.014, 0.02, 1.0, 5), stemMat, stems, {
      castShadow: true,
    }),
    f.instanced("Cattail Heads", cylinder(0.04, 0.04, 0.24, 7), headMat, heads, {
      castShadow: true,
    }),
    // Tiny tuft tip on top of each head — a wisp of pale fluff.
    f.instanced("Cattail Tips", sphere(0.03, 6, 5), tipMat, tips),
  ]);
}

/**
 * A small grove of slender lakeside conifers placed around the lakefront,
 * routed away from the lake water, the pier and the meadow join. Built
 * from a stack of stylised cones over a short trunk.
 */
function buildLakefrontTrees(f: NodeFactory): SceneNode {
  const trunkMat = std(C.bark, 0.95, { texture: "bark", flatShading: true });
  const foliage = std(C.foliage, 0.85, { flatShading: true });
  const rng = mulberry32(0x1ac3c0);
  const trees: SceneNode[] = [];
  const placed: { x: number; z: number }[] = [];
  const xMin = LAKEFRONT_POS[0] - LAKEFRONT_W / 2 + 2;
  const xMax = LAKEFRONT_POS[0] + LAKEFRONT_W / 2 - 2;
  const zMin = LAKEFRONT_POS[2] - LAKEFRONT_D / 2 + 2;
  const zMax = LAKEFRONT_POS[2] + LAKEFRONT_D / 2 - 2;
  let attempts = 0;
  while (trees.length < 16 && attempts < 400) {
    attempts++;
    const x = xMin + rng() * (xMax - xMin);
    const z = zMin + rng() * (zMax - zMin);
    // Stay off the lake water itself, plus a one-unit buffer.
    if (
      x > LAKE_WATER_POS[0] - LAKE_WATER_W / 2 - 1 &&
      x < LAKE_WATER_POS[0] + LAKE_WATER_W / 2 + 1 &&
      z > LAKE_WATER_POS[2] - LAKE_WATER_D / 2 - 1 &&
      z < LAKE_WATER_POS[2] + LAKE_WATER_D / 2 + 1
    ) continue;
    // Stay off the pier corridor.
    if (Math.hypot(x - LAKE_PIER_POS[0], z - LAKE_PIER_POS[2]) < 4.5) continue;
    // Stay off the meadow seam (avoid overlapping back-meadow trees).
    if (z > -42) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 3.0)) continue;
    placed.push({ x, z });

    const trunkH = 0.55 + rng() * 0.25;
    const s = 1.1 + rng() * 0.5;
    const tilt = (rng() - 0.5) * 0.05;
    trees.push(
      f.group(
        `Lakefront Tree ${trees.length + 1}`,
        [
          f.mesh("Trunk", cylinder(0.1, 0.14, trunkH, 6), trunkMat, {
            position: [0, trunkH / 2, 0],
          }, { castShadow: true, receiveShadow: true }),
          f.mesh("Lower Cone", cone(0.78, 1.0, 8), foliage, {
            position: [0, trunkH + 0.42, 0],
          }, { castShadow: true, receiveShadow: true }),
          f.mesh("Mid Cone", cone(0.6, 0.8, 8), foliage, {
            position: [0, trunkH + 0.95, 0],
          }, { castShadow: true }),
          f.mesh("Top Cone", cone(0.4, 0.6, 8), foliage, {
            position: [0, trunkH + 1.4, 0],
          }, { castShadow: true }),
        ],
        { position: [x, 0, z], scale: [s, s, s], rotation: [tilt, rng() * Math.PI, tilt] },
      ),
    );
  }
  return f.group("Lakefront Trees", trees);
}

/**
 * A small bobbing channel buoy — red and white horizontal stripes over a
 * cylindrical drum on a flat base, with a small lantern cage and a tiny
 * pennant flag on top. Anchored a few units off shore.
 */
function buildMooringBuoy(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const red = std(C.buoyRed, 0.55, { flatShading: true });
  const white = std(C.buoyWhite, 0.6, { flatShading: true });
  const metal = std(C.ironGrey, 0.4, { metalness: 0.6, flatShading: true });
  const flag = std(C.flowerYellow, 0.6, { transparent: true, opacity: 0.95 });

  const parts: SceneNode[] = [
    // Flotation drum sitting on the water.
    f.mesh("Drum Base", cylinder(0.34, 0.4, 0.1, 14), white, {
      position: [0, 0.06, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Drum Red A", cylinder(0.36, 0.36, 0.16, 14), red, {
      position: [0, 0.2, 0],
    }, { castShadow: true }),
    f.mesh("Drum White", cylinder(0.36, 0.36, 0.1, 14), white, {
      position: [0, 0.33, 0],
    }, { castShadow: true }),
    f.mesh("Drum Red B", cylinder(0.36, 0.36, 0.16, 14), red, {
      position: [0, 0.46, 0],
    }, { castShadow: true }),
    f.mesh("Drum Top", cylinder(0.3, 0.36, 0.08, 14), white, {
      position: [0, 0.58, 0],
    }, { castShadow: true }),
    // Lantern cage — four uprights forming an open box on top of the drum.
    f.mesh("Cage Floor", cylinder(0.18, 0.18, 0.02, 8), metal, {
      position: [0, 0.63, 0],
    }),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(
      f.mesh("Cage Post", cylinder(0.012, 0.012, 0.34, 5), metal, {
        position: [Math.cos(a) * 0.16, 0.8, Math.sin(a) * 0.16],
      }),
    );
  }
  parts.push(
    f.mesh("Cage Ring", cylinder(0.18, 0.18, 0.02, 8), metal, {
      position: [0, 0.96, 0],
    }),
    // Tiny lantern bulb inside the cage.
    f.mesh("Buoy Lamp", sphere(0.08, 10, 8),
      std(C.lampGlow, 0.4, { emissive: "#f7d28c" }),
      { position: [0, 0.8, 0] }),
    // Pennant flag pole and triangular flag.
    f.mesh("Pennant Pole", cylinder(0.01, 0.01, 0.4, 5), metal, {
      position: [0, 1.18, 0],
    }, { castShadow: true }),
    f.mesh("Pennant Flag", box(0.22, 0.14, 0.005), flag, {
      position: [0.11, 1.3, 0],
    }),
  );

  return f.group("Mooring Buoy", parts, { position: pos, rotation: [0, 0.2, 0] });
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

/* ─────────────── ninth-pass courtyard enhancements ─────────────── */

/**
 * A small bee apiary — two stacked white hive boxes (with a honeycomb-stamped
 * front face that reads as relief via the paired depth map) on a flat slate
 * platform. The hive carries a peaked roof with a tiny landing board where
 * stylised bees can be implied as instanced specks above the entrance hole.
 */
function buildBeeApiary(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const slate = std(C.slatePlate, 0.85, { flatShading: true });
  const hiveBody = std(C.hiveWhite, 0.65, { texture: "wood", textureScale: [1, 1] });
  // Honeycomb front — colour + companion bump map.
  const hiveFront: MaterialDef = {
    color: C.hiveHoney,
    roughness: 0.55,
    texture: "honeycomb",
    textureScale: [1, 1],
    bumpMap: "honeycomb-bump",
    bumpScale: 0.045,
  };
  const roof = std(C.hiveRoof, 0.9, { texture: "shingle", textureScale: [1, 1] });
  const metal = std(C.ironGrey, 0.4, { metalness: 0.6 });
  const beeBody = std(C.bistroBulb, 0.6, { flatShading: true });

  const boxW = 0.7;
  const boxH = 0.32;
  const boxD = 0.6;
  const slateH = 0.06;
  const parts: SceneNode[] = [
    // Slate platform — wider than the hive footprint.
    f.mesh("Slate Plate", box(boxW + 0.4, slateH, boxD + 0.4), slate, {
      position: [0, slateH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Two short feet under the slate.
    f.mesh("Foot L", box(0.1, 0.05, 0.1), slate, {
      position: [-boxW / 2 + 0.06, slateH / 2 - 0.03, boxD / 2 - 0.06],
    }, { castShadow: true }),
    f.mesh("Foot R", box(0.1, 0.05, 0.1), slate, {
      position: [boxW / 2 - 0.06, slateH / 2 - 0.03, boxD / 2 - 0.06],
    }, { castShadow: true }),
    f.mesh("Foot BL", box(0.1, 0.05, 0.1), slate, {
      position: [-boxW / 2 + 0.06, slateH / 2 - 0.03, -boxD / 2 + 0.06],
    }, { castShadow: true }),
    f.mesh("Foot BR", box(0.1, 0.05, 0.1), slate, {
      position: [boxW / 2 - 0.06, slateH / 2 - 0.03, -boxD / 2 + 0.06],
    }, { castShadow: true }),
  ];
  // Lower hive box.
  const baseY = slateH + boxH / 2;
  parts.push(
    f.mesh("Hive Lower Body", box(boxW, boxH, boxD), hiveBody, {
      position: [0, baseY, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Hive Lower Front", box(boxW + 0.01, boxH * 0.7, 0.01), hiveFront, {
      position: [0, baseY, boxD / 2 + 0.005],
    }, { castShadow: false }),
    // Entrance slot — a thin dark rectangle at the bottom of the lower box.
    f.mesh("Entrance Slot", box(boxW * 0.4, 0.04, 0.012), std(C.composterBin, 0.95), {
      position: [0, slateH + 0.06, boxD / 2 + 0.012],
    }),
    // Landing board projecting forward.
    f.mesh("Landing Board", box(boxW * 0.5, 0.02, 0.08), hiveBody, {
      position: [0, slateH + 0.04, boxD / 2 + 0.05],
    }, { castShadow: true }),
  );
  // Upper hive box (slightly recessed inset look — same width).
  const upperY = slateH + boxH + boxH / 2 + 0.005;
  parts.push(
    f.mesh("Hive Upper Body", box(boxW, boxH, boxD), hiveBody, {
      position: [0, upperY, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Hive Upper Front", box(boxW + 0.01, boxH * 0.7, 0.01), hiveFront, {
      position: [0, upperY, boxD / 2 + 0.005],
    }),
  );
  // Peaked roof — gable + ridge.
  const ridgeY = upperY + boxH / 2 + 0.18;
  parts.push(
    f.mesh("Roof Slope L", box(boxW + 0.18, 0.04, boxD + 0.16), roof, {
      position: [-0.16, ridgeY - 0.08, 0],
      rotation: [0, 0, 0.35],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof Slope R", box(boxW + 0.18, 0.04, boxD + 0.16), roof, {
      position: [0.16, ridgeY - 0.08, 0],
      rotation: [0, 0, -0.35],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof Ridge", box(0.04, 0.06, boxD + 0.16), roof, {
      position: [0, ridgeY, 0],
    }, { castShadow: true }),
    // A tiny ventilation chimney pipe.
    f.mesh("Vent Pipe", cylinder(0.025, 0.025, 0.12, 6), metal, {
      position: [0.18, ridgeY + 0.08, 0],
    }, { castShadow: true }),
  );
  // A few stylised bees orbiting the entrance — three small striped specks.
  const beeSpots: [number, number, number][] = [
    [0.05, slateH + 0.18, boxD / 2 + 0.18],
    [-0.12, slateH + 0.26, boxD / 2 + 0.32],
    [0.18, slateH + 0.34, boxD / 2 + 0.22],
  ];
  beeSpots.forEach(([bx, by, bz], i) => {
    parts.push(
      f.mesh(`Bee ${i + 1}`, sphere(0.022, 6, 5), beeBody, {
        position: [bx, by, bz], scale: [1.3, 0.8, 0.9],
      }, { castShadow: true }),
    );
  });
  return f.group("Bee Apiary", parts, { position: pos });
}

/**
 * A small marble garden statue — a stylised crouching bunny perched on a
 * fluted column pedestal. Both pedestal and bunny use the marble colour
 * map paired with a depth map, so the chiseled veining reads as relief
 * when sun grazes the pedestal at an angle.
 */
function buildGardenStatue(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const marble: MaterialDef = {
    color: C.marbleCream,
    roughness: 0.45,
    metalness: 0.05,
    texture: "marble",
    textureScale: [1, 1.4],
    bumpMap: "marble-bump",
    bumpScale: 0.06,
  };
  const marbleShade: MaterialDef = {
    color: C.bunnyShade,
    roughness: 0.55,
    metalness: 0.05,
    texture: "marble",
    textureScale: [0.6, 0.6],
    bumpMap: "marble-bump",
    bumpScale: 0.04,
  };
  const parts: SceneNode[] = [
    // Square plinth at the base.
    f.mesh("Plinth", box(0.5, 0.1, 0.5), marbleShade, {
      position: [0, 0.05, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Fluted column shaft.
    f.mesh("Shaft", cylinder(0.16, 0.18, 0.7, 16), marble, {
      position: [0, 0.45, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A simple capital block on top.
    f.mesh("Capital", box(0.42, 0.08, 0.42), marbleShade, {
      position: [0, 0.84, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Bunny body — a flattened sphere.
    f.mesh("Bunny Body", sphere(0.13, 12, 10), marble, {
      position: [0, 1.0, 0], scale: [1, 0.85, 1.15],
    }, { castShadow: true, receiveShadow: true }),
    // Bunny head — a smaller sphere forward and up.
    f.mesh("Bunny Head", sphere(0.09, 12, 10), marble, {
      position: [0, 1.16, 0.08], scale: [1, 0.95, 1],
    }, { castShadow: true, receiveShadow: true }),
    // Two ears — short flattened cylinders angled back.
    f.mesh("Ear L", cylinder(0.02, 0.03, 0.12, 6), marble, {
      position: [-0.04, 1.27, 0.04], rotation: [0.2, 0, -0.15],
    }, { castShadow: true }),
    f.mesh("Ear R", cylinder(0.02, 0.03, 0.12, 6), marble, {
      position: [0.04, 1.27, 0.04], rotation: [0.2, 0, 0.15],
    }, { castShadow: true }),
    // Tail — a tiny sphere at the back.
    f.mesh("Tail", sphere(0.03, 8, 6), marble, {
      position: [0, 1.0, -0.12],
    }, { castShadow: true }),
    // Two front paws — tiny boxes peeking out.
    f.mesh("Paw L", box(0.04, 0.05, 0.08), marble, {
      position: [-0.06, 0.92, 0.14],
    }),
    f.mesh("Paw R", box(0.04, 0.05, 0.08), marble, {
      position: [0.06, 0.92, 0.14],
    }),
  ];
  return f.group("Garden Statue", parts, { position: pos });
}

/**
 * A black kettle BBQ grill — a hemispherical lid on a domed bowl, perched
 * on three tubular legs, with a small wire side shelf, a wooden handle on
 * the lid and a faint orange ember glow showing through the vent.
 */
function buildBbqKettle(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const body = std(C.grillBody, 0.4, { metalness: 0.5 });
  const trim = std(C.grillSilver, 0.3, { metalness: 0.85, flatShading: true });
  const wood = std(C.walnut, 0.7, { texture: "wood" });
  const ember = {
    color: C.grillEmber,
    roughness: 0.35,
    emissive: C.emberGlow,
    opacity: 0.95,
  };
  const legH = 0.62;
  const bowlY = legH + 0.18;
  const parts: SceneNode[] = [];
  // Three legs splayed outward.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(
      f.mesh(`Leg ${i + 1}`, cylinder(0.018, 0.024, legH, 6), body, {
        position: [Math.cos(a) * 0.22, legH / 2, Math.sin(a) * 0.22],
        rotation: [Math.cos(a) * 0.1, 0, -Math.sin(a) * 0.1],
      }, { castShadow: true }),
    );
  }
  // Bowl — the lower half of a sphere clipped at the equator.
  const bowlGeom: GeometryDef = {
    type: "sphere",
    radius: 0.32,
    widthSegments: 16,
    heightSegments: 10,
    phiStart: 0,
    phiLength: Math.PI * 2,
    thetaStart: Math.PI / 2,
    thetaLength: Math.PI / 2,
  };
  const lidGeom: GeometryDef = {
    type: "sphere",
    radius: 0.32,
    widthSegments: 16,
    heightSegments: 10,
    phiStart: 0,
    phiLength: Math.PI * 2,
    thetaStart: 0,
    thetaLength: Math.PI / 2,
  };
  parts.push(
    f.mesh("Bowl", bowlGeom, body, {
      position: [0, bowlY, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A black grate disc on top of the bowl rim.
    f.mesh("Grate", cylinder(0.3, 0.3, 0.018, 18), trim, {
      position: [0, bowlY + 0.01, 0],
    }),
    // Glowing ember disc just below the grate — visible through the slats.
    f.mesh("Embers", cylinder(0.26, 0.26, 0.012, 16), ember, {
      position: [0, bowlY - 0.05, 0],
    }),
    // Lid — the upper hemisphere over the bowl.
    f.mesh("Lid", lidGeom, body, {
      position: [0, bowlY + 0.02, 0],
    }, { castShadow: true }),
    // Lid handle — a small wood knob on top.
    f.mesh("Lid Handle Base", cylinder(0.02, 0.02, 0.05, 8), trim, {
      position: [0, bowlY + 0.32, 0],
    }),
    f.mesh("Lid Handle", sphere(0.04, 10, 8), wood, {
      position: [0, bowlY + 0.38, 0],
    }, { castShadow: true }),
    // Vent at the back of the lid.
    f.mesh("Vent", cylinder(0.04, 0.04, 0.012, 10), trim, {
      position: [0, bowlY + 0.28, -0.18],
      rotation: [Math.PI / 2, 0, 0],
    }),
    // A small wire side shelf on the east leg.
    f.mesh("Side Shelf", box(0.16, 0.012, 0.22), trim, {
      position: [0.32, bowlY - 0.06, 0],
    }, { castShadow: true }),
    // A pair of grilling tongs resting on the shelf.
    f.mesh("Tongs A", cylinder(0.008, 0.008, 0.2, 5), trim, {
      position: [0.32, bowlY - 0.04, 0.02],
      rotation: [0, 0.1, 0],
    }),
    f.mesh("Tongs B", cylinder(0.008, 0.008, 0.2, 5), trim, {
      position: [0.32, bowlY - 0.04, -0.02],
      rotation: [0, -0.1, 0],
    }),
  );
  return f.group("BBQ Kettle Grill", parts, { position: pos });
}

/* ─────────────── ninth-pass scene extension: south heath ─────────────── */

/**
 * The south heath — a heather-carpeted moorland plane reaching beyond the
 * front yard. The plane overlaps the main lawn by ~1 unit along the join
 * at z = 32 so the ground layer reads as continuous. Carries a rolling
 * earth mound, a miniature standing-stone circle in the marble palette,
 * scattered heather shrubs, three slender birch trees with stylised paper
 * bark and a winding extension of the cobble path that fades into the
 * heath as a soft dirt trail.
 */
function buildSouthHeath(f: NodeFactory): SceneNode {
  return f.group("South Heath", [
    // The heath ground plane itself — a heather-toned carpet, slightly
    // duller than the lawn so the eye reads the transition. The texture
    // uses repeats sized for the plane's footprint.
    f.mesh(
      "Heath Ground",
      plane(HEATH_W, HEATH_D),
      {
        color: C.heathGround,
        roughness: 0.97,
        texture: "heather",
        textureScale: [10, 6],
        bumpMap: "heather-bump",
        bumpScale: 0.05,
      },
      { position: HEATH_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // Apron joining the lawn's far edge — a darker moss strip with the
    // grass texture so the seam reads as one continuous lawn-to-heath.
    f.mesh(
      "Heath Apron",
      plane(HEATH_W, 3),
      std(C.heathMoss, 0.95, { texture: "grass", textureScale: [12, 1] }),
      { position: [0, -0.004, 33], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    buildHeathTrail(f),
    buildHeathMound(f, HEATH_MOUND_POS),
    buildStandingStones(f, STANDING_STONES_POS),
    buildHeatherShrubs(f),
    buildBirchTrees(f),
  ]);
}

/**
 * A winding dirt trail — a soft cream-coloured strip that continues the
 * cobble path's exit into the heath, tapering as it recedes. Implemented
 * as a series of slightly-overlapping flat planes so the eye reads it as
 * a meandering path rather than a single rectangle.
 */
function buildHeathTrail(f: NodeFactory): SceneNode {
  const dirt = std(C.lakefrontSand, 0.95, { texture: "grass", textureScale: [3, 1] });
  const rng = mulberry32(0xd17e21);
  const segments: SceneNode[] = [];
  const startZ = 36;
  const endZ = 60;
  const step = 1.2;
  let curveX = 0;
  for (let z = startZ; z <= endZ; z += step) {
    curveX += (rng() - 0.5) * 0.4;
    const taper = 1 - (z - startZ) / (endZ - startZ);
    const w = 1.3 * (0.4 + taper * 0.6);
    segments.push(
      f.mesh(
        "Trail Segment",
        plane(w, step * 1.1),
        dirt,
        {
          position: [curveX, -0.003, z],
          rotation: [-Math.PI / 2, 0, (rng() - 0.5) * 0.1],
        },
        { receiveShadow: true },
      ),
    );
  }
  return f.group("Heath Trail", segments);
}

/**
 * A low rolling earth mound on the heath — a heavily flattened sphere half
 * buried at the anchor point. Carries a few small loose stones on its flank.
 */
function buildHeathMound(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const earth = std(C.heathGround, 0.97, { flatShading: true });
  const moss = std(C.heathMoss, 0.95, { flatShading: true });
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const rng = mulberry32(0xea14b00d);
  const loose: SceneNode[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const rr = 2.0 + rng() * 1.6;
    loose.push(
      f.mesh("Loose Stone", sphere(0.18 + rng() * 0.22, 8, 6), stone, {
        position: [Math.cos(a) * rr, 0.18 + rng() * 0.25, Math.sin(a) * rr],
        rotation: [rng() * 0.4, rng() * Math.PI, rng() * 0.4],
        scale: [1, 0.7 + rng() * 0.3, 1],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  return f.group("Heath Mound", [
    f.mesh("Mound Base", sphere(3.8, 18, 12), earth, {
      position: [0, 0.2, 0],
      scale: [1, 0.32, 0.95],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Mound Crown", sphere(2.0, 14, 10), moss, {
      position: [0, 1.05, 0],
      scale: [1, 0.45, 1],
    }, { castShadow: true, receiveShadow: true }),
    ...loose,
  ], { position: pos });
}

/**
 * A miniature standing-stone circle — six tall marble megaliths arranged in
 * a ring around a flat altar stone, evoking a tiny Stonehenge tucked into
 * the heath. Each stone uses the marble colour + depth map so the veining
 * reads as carved relief on the surface.
 */
function buildStandingStones(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const marble: MaterialDef = {
    color: C.marbleCream,
    roughness: 0.6,
    texture: "marble",
    textureScale: [0.5, 1.2],
    bumpMap: "marble-bump",
    bumpScale: 0.08,
    flatShading: true,
  };
  const marbleAltar: MaterialDef = {
    color: C.bunnyShade,
    roughness: 0.7,
    texture: "marble",
    textureScale: [0.8, 0.8],
    bumpMap: "marble-bump",
    bumpScale: 0.05,
    flatShading: true,
  };
  const ringR = 2.0;
  const stones: SceneNode[] = [];
  const rng = mulberry32(0x5103e0);
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const lean = (rng() - 0.5) * 0.2;
    const h = 1.4 + rng() * 0.5;
    const w = 0.32 + rng() * 0.12;
    stones.push(
      f.mesh(`Megalith ${i + 1}`, box(w, h, w * 0.7), marble, {
        position: [Math.cos(a) * ringR, h / 2, Math.sin(a) * ringR],
        rotation: [lean, a + Math.PI / 2, lean * 0.5],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  return f.group("Standing Stones", [
    // Flat altar stone in the centre — half-buried in the heath.
    f.mesh("Altar", box(1.1, 0.18, 0.7), marbleAltar, {
      position: [0, 0.1, 0],
    }, { castShadow: true, receiveShadow: true }),
    ...stones,
  ], { position: pos });
}

/**
 * Heather shrubs scattered across the heath — short rounded bushes in a mix
 * of bloom and dark-foliage colours. Instanced for cheap rendering since
 * the heath wants a dense carpet of small shapes.
 */
function buildHeatherShrubs(f: NodeFactory): SceneNode {
  const rng = mulberry32(0xc01d12c);
  const blooms: Transform[] = [];
  const darks: Transform[] = [];
  const xMin = HEATH_POS[0] - HEATH_W / 2 + 2;
  const xMax = HEATH_POS[0] + HEATH_W / 2 - 2;
  const zMin = HEATH_POS[2] - HEATH_D / 2 + 2;
  const zMax = HEATH_POS[2] + HEATH_D / 2 - 2;
  const standingR = 3.5;
  const moundR = 4.5;
  const trailHalfW = 0.9;
  let attempts = 0;
  while (blooms.length + darks.length < 110 && attempts < 1200) {
    attempts++;
    const x = xMin + rng() * (xMax - xMin);
    const z = zMin + rng() * (zMax - zMin);
    // Avoid the standing-stone circle, the mound and the trail corridor.
    if (Math.hypot(x - STANDING_STONES_POS[0], z - STANDING_STONES_POS[2]) < standingR) continue;
    if (Math.hypot(x - HEATH_MOUND_POS[0], z - HEATH_MOUND_POS[2]) < moundR) continue;
    if (Math.abs(x) < trailHalfW && z > 35 && z < 60) continue;
    const s = 0.3 + rng() * 0.22;
    const transform: Transform = {
      position: [x, s * 0.45, z],
      rotation: [0, rng() * Math.PI, 0],
      scale: [s, s * 0.6, s],
    };
    if (rng() < 0.65) blooms.push(transform);
    else darks.push(transform);
  }
  return f.group("Heather Shrubs", [
    f.instanced(
      "Heather Bloom Cluster",
      sphere(1, 10, 7),
      std(C.heatherBloom, 0.85, { flatShading: true }),
      blooms,
      { castShadow: true, receiveShadow: true },
    ),
    f.instanced(
      "Heather Foliage Cluster",
      sphere(1, 10, 7),
      std(C.heatherDark, 0.9, { flatShading: true }),
      darks,
      { castShadow: true, receiveShadow: true },
    ),
  ]);
}

/**
 * Three slender birch trees scattered across the heath — a pale paper-bark
 * trunk with dark knots stamped on as small ringed bands, and a soft lime
 * foliage crown of stacked cones. Birches tilt slightly for naturalism.
 */
function buildBirchTrees(f: NodeFactory): SceneNode {
  const trunkMat = std(C.birchTrunk, 0.85, { flatShading: true });
  const knot = std(C.birchBark, 0.9, { flatShading: true });
  const foliage = std(C.birchFoliage, 0.85, { flatShading: true });
  const positions: [number, number, number][] = [
    [-12, 0, 42],
    [6, 0, 56],
    [18, 0, 48],
  ];
  const trees: SceneNode[] = [];
  positions.forEach((p, idx) => {
    const rng = mulberry32(0xb127c70 + idx);
    const trunkH = 2.4 + rng() * 0.6;
    const tilt = (rng() - 0.5) * 0.06;
    const parts: SceneNode[] = [
      f.mesh("Birch Trunk", cylinder(0.08, 0.12, trunkH, 8), trunkMat, {
        position: [0, trunkH / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
    ];
    // A few dark knot bands stamped on the trunk.
    for (let k = 0; k < 4; k++) {
      const y = 0.4 + rng() * (trunkH - 0.8);
      parts.push(
        f.mesh(`Knot ${k + 1}`, cylinder(0.105, 0.115, 0.04, 8), knot, {
          position: [0, y, 0],
          rotation: [0, rng() * Math.PI, 0],
        }),
      );
    }
    // Two lateral branches near the top of the trunk.
    for (let b = 0; b < 2; b++) {
      const a = rng() * Math.PI * 2;
      parts.push(
        f.mesh(`Branch ${b + 1}`, cylinder(0.025, 0.04, 0.6, 5), trunkMat, {
          position: [Math.cos(a) * 0.18, trunkH - 0.4 - b * 0.25, Math.sin(a) * 0.18],
          rotation: [Math.PI / 2 + 0.3, a, 0],
        }, { castShadow: true }),
      );
    }
    // Foliage — a stack of three soft cones with airy spread.
    parts.push(
      f.mesh("Lower Foliage", cone(0.95, 1.2, 9), foliage, {
        position: [0, trunkH + 0.45, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Mid Foliage", cone(0.7, 0.9, 9), foliage, {
        position: [0, trunkH + 0.95, 0],
      }, { castShadow: true }),
      f.mesh("Top Foliage", cone(0.42, 0.6, 8), foliage, {
        position: [0, trunkH + 1.4, 0],
      }, { castShadow: true }),
    );
    trees.push(
      f.group(`Birch Tree ${idx + 1}`, parts, {
        position: p,
        rotation: [tilt, rng() * Math.PI, tilt],
        scale: [0.95 + rng() * 0.2, 0.95 + rng() * 0.2, 0.95 + rng() * 0.2],
      }),
    );
  });
  return f.group("Birch Trees", trees);
}

/* ─────────────── tenth-pass courtyard props ─────────────── */

/**
 * A cast-iron hand pump on a flat slate footing, with a curved spout
 * dripping into a stone trough. The cylindrical pump shaft, a sweeping
 * lever handle and a thin water column from the spout into the trough
 * read as a working village pump. Designed to sit just west of the
 * picnic table on the back lawn.
 */
function buildHandPump(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const iron = std(C.pumpIron, 0.7, { flatShading: true, metalness: 0.4 });
  const handleWood = std(C.pumpHandle, 0.75, { texture: "wood" });
  const stone = std(C.troughStone, 0.92, { texture: "cobblestone", flatShading: true });
  const water: MaterialDef = {
    color: C.troughWater,
    roughness: 0.18,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
  };
  const slate = std("#4a4944", 0.8, { texture: "cobblestone", flatShading: true });
  return f.group("Hand Pump", [
    // Slate footing the pump and trough share.
    f.mesh("Pump Footing", box(1.5, 0.06, 1.0), slate, {
      position: [0, 0.03, 0],
    }, { receiveShadow: true }),
    // Stone trough — a rectangular box hollowed with a water sheet on top.
    f.mesh("Trough Body", box(1.2, 0.34, 0.5), stone, {
      position: [0.3, 0.23, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A second slightly inset rim to suggest a hollowed bowl.
    f.mesh("Trough Rim", box(1.04, 0.05, 0.42), stone, {
      position: [0.3, 0.42, 0],
    }, { castShadow: true }),
    // Water surface inside the trough.
    f.mesh("Trough Water", box(0.98, 0.025, 0.38), water, {
      position: [0.3, 0.435, 0],
    }, { receiveShadow: true }),
    // Pump column — vertical cast-iron pipe.
    f.mesh("Pump Column", cylinder(0.07, 0.09, 0.92, 12), iron, {
      position: [-0.4, 0.5, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Flared base block at the bottom.
    f.mesh("Pump Base", box(0.26, 0.18, 0.26), iron, {
      position: [-0.4, 0.13, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Curved iron spout — a short pipe arced down toward the trough.
    f.mesh("Pump Spout", cylinder(0.04, 0.04, 0.42, 8), iron, {
      position: [-0.18, 0.82, 0],
      rotation: [0, 0, -Math.PI / 2],
    }, { castShadow: true }),
    // Thin water column from the spout into the trough.
    f.mesh("Pump Stream", cylinder(0.022, 0.018, 0.42, 6), water, {
      position: [0.03, 0.6, 0],
    }),
    // Lever handle — a thick wooden lever pinned to the top of the column.
    f.mesh("Pump Lever", box(0.7, 0.06, 0.08), handleWood, {
      position: [-0.55, 1.02, 0],
      rotation: [0, 0, -0.35],
    }, { castShadow: true }),
    // The pivot bolt where the lever meets the column.
    f.mesh("Lever Pivot", cylinder(0.04, 0.04, 0.12, 8), iron, {
      position: [-0.4, 0.98, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
    // A small grip at the lever's far end.
    f.mesh("Lever Grip", cylinder(0.045, 0.045, 0.16, 8), iron, {
      position: [-0.88, 0.85, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  ], { position: pos, rotation: [0, Math.PI / 2.3, 0] });
}

/**
 * A grape arbor — two slatted wooden posts joined by a flat overhead
 * lattice, draped with a green vine and small cobalt grape clusters.
 * Sits on the east lawn just south of the patio set.
 */
function buildGrapeArbor(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.arborWood, 0.8, { texture: "wood" });
  const leaf = std(C.grapeLeaf, 0.85, { flatShading: true });
  const leafDark = std(C.grapeLeafDark, 0.9, { flatShading: true });
  const grape = std(C.grapePurple, 0.55, { flatShading: true });
  const arborW = 2.2;
  const arborD = 1.6;
  const postH = 2.1;
  const parts: SceneNode[] = [];
  // Four corner posts.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        f.mesh("Arbor Post", box(0.12, postH, 0.12), wood, {
          position: [sx * arborW / 2, postH / 2, sz * arborD / 2],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
  }
  // Top frame — two long beams and three crosspieces forming a lattice.
  parts.push(
    f.mesh("Arbor Beam Front", box(arborW + 0.2, 0.08, 0.1), wood, {
      position: [0, postH + 0.04, arborD / 2],
    }, { castShadow: true }),
    f.mesh("Arbor Beam Back", box(arborW + 0.2, 0.08, 0.1), wood, {
      position: [0, postH + 0.04, -arborD / 2],
    }, { castShadow: true }),
  );
  for (let i = 0; i < 5; i++) {
    const x = -arborW / 2 + (arborW / 4) * i;
    parts.push(
      f.mesh(`Lattice Slat ${i + 1}`, box(0.06, 0.05, arborD + 0.2), wood, {
        position: [x, postH + 0.12, 0],
      }, { castShadow: true }),
    );
  }
  // Drape the lattice with grouped leaves and grape clusters.
  const rng = mulberry32(0x9214b305);
  for (let i = 0; i < 22; i++) {
    const x = (rng() - 0.5) * arborW;
    const z = (rng() - 0.5) * arborD;
    const y = postH + 0.18 + rng() * 0.08;
    const s = 0.18 + rng() * 0.1;
    parts.push(
      f.mesh("Vine Leaf", sphere(s, 7, 5), rng() < 0.5 ? leaf : leafDark, {
        position: [x, y, z],
        scale: [1, 0.45, 1],
        rotation: [0, rng() * Math.PI, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Grape clusters dangling between leaves.
  for (let i = 0; i < 5; i++) {
    const x = -arborW / 2 + 0.3 + (arborW - 0.6) * (i / 4);
    const z = (rng() - 0.5) * (arborD - 0.4);
    parts.push(
      f.mesh(`Grape Cluster ${i + 1}`, sphere(0.13, 8, 6), grape, {
        position: [x, postH - 0.08, z],
        scale: [1, 1.4, 1],
      }, { castShadow: true }),
    );
  }
  // A trailing tendril along one post, suggesting the vine grew up from below.
  for (let i = 0; i < 6; i++) {
    parts.push(
      f.mesh("Trailing Leaf", sphere(0.12, 6, 5), leaf, {
        position: [arborW / 2 + 0.06, 0.3 + i * 0.3, arborD / 2 + (i % 2 === 0 ? 0.02 : -0.02)],
        scale: [1, 0.5, 1],
      }, { castShadow: true }),
    );
  }
  return f.group("Grape Arbor", parts, { position: pos, rotation: [0, -Math.PI / 9, 0] });
}

/**
 * A pair of weathered copper rain barrels under the front-corner
 * downspouts. Each barrel is a banded cylinder with an iron lid, a
 * brass spigot near the foot and a wooden riser plinth — the copper
 * skin uses the `copper-patina` colour map paired with a depth map so
 * the verdigris mottling reads as crusted relief.
 */
function buildRainBarrels(f: NodeFactory): SceneNode {
  const copper: MaterialDef = {
    color: C.copperPatina,
    roughness: 0.6,
    metalness: 0.45,
    texture: "copper-patina",
    textureScale: [1, 1.4],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.04,
  };
  const band = std(C.copperRim, 0.5, { metalness: 0.55 });
  const lid = std(C.copperPatinaDark, 0.55, { metalness: 0.5 });
  const spigot = std(C.brass, 0.4, { metalness: 0.7 });
  const wood = std(C.walnut, 0.85, { texture: "wood" });
  function barrel(sideX: number): SceneNode {
    const dir = sideX < 0 ? -1 : 1;
    const radius = 0.32;
    const height = 0.78;
    return f.group(`Rain Barrel ${sideX < 0 ? "L" : "R"}`, [
      // Wooden riser plinth — keeps the barrel off the wet grass.
      f.mesh("Plinth", box(0.78, 0.08, 0.78), wood, {
        position: [0, 0.04, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Main copper drum.
      f.mesh("Drum", cylinder(radius, radius, height, 18), copper, {
        position: [0, 0.08 + height / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Three iron hoops — upper, mid, lower.
      f.mesh("Upper Band", cylinder(radius + 0.012, radius + 0.012, 0.04, 18), band, {
        position: [0, 0.08 + height - 0.08, 0],
      }, { castShadow: true }),
      f.mesh("Mid Band", cylinder(radius + 0.012, radius + 0.012, 0.04, 18), band, {
        position: [0, 0.08 + height * 0.5, 0],
      }, { castShadow: true }),
      f.mesh("Lower Band", cylinder(radius + 0.012, radius + 0.012, 0.04, 18), band, {
        position: [0, 0.08 + 0.1, 0],
      }, { castShadow: true }),
      // Lid — a slightly larger flat disc on top.
      f.mesh("Lid", cylinder(radius + 0.04, radius + 0.04, 0.04, 18), lid, {
        position: [0, 0.08 + height + 0.02, 0],
      }, { castShadow: true }),
      // Small finial knob on the lid.
      f.mesh("Lid Knob", cylinder(0.05, 0.05, 0.08, 8), band, {
        position: [0, 0.08 + height + 0.08, 0],
      }, { castShadow: true }),
      // Brass spigot — pipe + handle pointing outward away from the wall.
      f.mesh("Spigot Pipe", cylinder(0.025, 0.025, 0.14, 8), spigot, {
        position: [dir * (radius + 0.07), 0.22, 0],
        rotation: [0, 0, Math.PI / 2],
      }, { castShadow: true }),
      f.mesh("Spigot Handle", box(0.12, 0.02, 0.04), spigot, {
        position: [dir * (radius + 0.16), 0.32, 0],
      }, { castShadow: true }),
      // Short downspout drop pipe entering the lid.
      f.mesh("Downspout Drop", box(0.07, 0.55, 0.07), std(C.copperPipe, 0.7, { metalness: 0.4 }), {
        position: [0, 0.08 + height + 0.35, 0],
      }, { castShadow: true }),
    ], { position: [0, 0, 0] });
  }
  return f.group("Rain Barrels", [
    f.group("Barrel L", [barrel(-1)], { position: RAIN_BARREL_L_POS }),
    f.group("Barrel R", [barrel(+1)], { position: RAIN_BARREL_R_POS }),
  ]);
}

/* ─────────────── tenth-pass NE pasture extension ─────────────── */

/**
 * A northeast pasture ground plane that bridges the back-meadow's east
 * edge and the side-orchard's north edge. The plane overlaps each
 * neighbour by ~1 unit so the ground layer joins seamlessly. It carries
 * a small gabled wooden horse stable, two stacked round hay bales and a
 * split-rail pasture fence along the eastern and southern perimeters.
 */
function buildNortheastPasture(f: NodeFactory): SceneNode {
  return f.group("Northeast Pasture", [
    // The pasture ground plane itself — a slightly warmer yellow-green
    // than the meadow so the eye reads the transition without a hard
    // seam, and a tiny bump map gives the carpet some glancing relief.
    f.mesh(
      "Pasture Ground",
      plane(NE_PASTURE_W, NE_PASTURE_D),
      std(C.pastureGrass, 0.96, {
        texture: "grass",
        textureScale: [10, 8],
        bumpMap: "heather-bump",
        bumpScale: 0.02,
      }),
      { position: NE_PASTURE_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // West apron — a darker strip overlapping the meadow's east edge so
    // the join between the two grass tones reads as one continuous field.
    f.mesh(
      "Pasture West Apron",
      plane(2, NE_PASTURE_D),
      std(C.pastureGrassDark, 0.95, { texture: "grass", textureScale: [1, 8] }),
      { position: [NE_PASTURE_POS[0] - NE_PASTURE_W / 2 + 1, -0.005, NE_PASTURE_POS[2]], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // South apron — overlaps the orchard's north edge.
    f.mesh(
      "Pasture South Apron",
      plane(NE_PASTURE_W, 2),
      std(C.pastureGrassDark, 0.95, { texture: "grass", textureScale: [8, 1] }),
      { position: [NE_PASTURE_POS[0], -0.005, NE_PASTURE_POS[2] + NE_PASTURE_D / 2 - 1], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    buildPastureStable(f, STABLE_POS),
    buildHayBales(f, HAY_BALES_POS),
    buildPastureFence(f),
    buildPastureTufts(f),
  ]);
}

/**
 * A small wooden horse stable — board-and-batten walls, a gabled red
 * roof with shingle texture, a Dutch-style split door on one face and
 * a small square window on the gable end. Sized to suggest a single
 * stall rather than a working barn.
 */
function buildPastureStable(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wall = std(C.stableWall, 0.85, { texture: "wood", textureScale: [2, 1] });
  const trim = std(C.stableTrim, 0.85, { texture: "wood" });
  const roof = std(C.stableRoof, 0.85, { texture: "shingle", textureScale: [2, 2] });
  const door = std(C.stableDoor, 0.7, { texture: "wood" });
  const glass: MaterialDef = {
    color: "#9bcfdc",
    roughness: 0.15,
    metalness: 0.3,
    transparent: true,
    opacity: 0.55,
  };
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const w = 3.0;
  const d = 2.4;
  const wallH = 1.7;
  const ridgeH = 1.0;
  const parts: SceneNode[] = [
    // Stone footing.
    f.mesh("Footing", box(w + 0.2, 0.12, d + 0.2), stone, {
      position: [0, 0.06, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Four walls.
    f.mesh("Wall N", box(w, wallH, 0.1), wall, {
      position: [0, 0.12 + wallH / 2, -d / 2 + 0.05],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall S", box(w, wallH, 0.1), wall, {
      position: [0, 0.12 + wallH / 2, d / 2 - 0.05],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall E", box(0.1, wallH, d), wall, {
      position: [w / 2 - 0.05, 0.12 + wallH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall W", box(0.1, wallH, d), wall, {
      position: [-w / 2 + 0.05, 0.12 + wallH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Trim cap along the eave on each long wall.
    f.mesh("Eave Trim N", box(w + 0.06, 0.06, 0.14), trim, {
      position: [0, 0.12 + wallH, -d / 2 + 0.05],
    }, { castShadow: true }),
    f.mesh("Eave Trim S", box(w + 0.06, 0.06, 0.14), trim, {
      position: [0, 0.12 + wallH, d / 2 - 0.05],
    }, { castShadow: true }),
    // Gable triangles on east and west walls — simple flat boards rising to
    // the ridge.
    f.mesh("Gable E", cone(d * 0.7, ridgeH, 4), wall, {
      position: [w / 2 - 0.06, 0.12 + wallH + ridgeH / 2, 0],
      rotation: [0, Math.PI / 4, Math.PI / 2],
      scale: [1, 1, 0.18],
    }, { castShadow: true }),
    f.mesh("Gable W", cone(d * 0.7, ridgeH, 4), wall, {
      position: [-w / 2 + 0.06, 0.12 + wallH + ridgeH / 2, 0],
      rotation: [0, Math.PI / 4, Math.PI / 2],
      scale: [1, 1, 0.18],
    }, { castShadow: true }),
    // Two roof slopes — flat planks tilted to meet at the ridge.
    f.mesh("Roof Slope N", box(w + 0.4, 0.06, Math.hypot(d / 2, ridgeH) + 0.1), roof, {
      position: [0, 0.12 + wallH + ridgeH / 2, -d / 4],
      rotation: [-Math.atan2(ridgeH, d / 2), 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof Slope S", box(w + 0.4, 0.06, Math.hypot(d / 2, ridgeH) + 0.1), roof, {
      position: [0, 0.12 + wallH + ridgeH / 2, d / 4],
      rotation: [Math.atan2(ridgeH, d / 2), 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Ridge cap.
    f.mesh("Ridge Cap", box(w + 0.4, 0.07, 0.18), trim, {
      position: [0, 0.12 + wallH + ridgeH + 0.02, 0],
    }, { castShadow: true }),
    // Dutch split door on the south wall — upper and lower halves with a
    // gap between them.
    f.mesh("Door Lower", box(0.85, 0.85, 0.06), door, {
      position: [0.3, 0.12 + 0.425, d / 2 + 0.04],
    }, { castShadow: true }),
    f.mesh("Door Upper", box(0.85, 0.7, 0.06), door, {
      position: [0.3, 0.12 + 0.85 + 0.05 + 0.35, d / 2 + 0.04],
    }, { castShadow: true }),
    f.mesh("Door Frame", box(0.95, 0.08, 0.08), trim, {
      position: [0.3, 0.12 + wallH - 0.04, d / 2 + 0.04],
    }, { castShadow: true }),
    // A small gable-end window.
    f.mesh("Gable Window", box(0.34, 0.34, 0.05), glass, {
      position: [-w / 2 + 0.06, 0.12 + wallH + ridgeH * 0.45, 0],
      rotation: [0, Math.PI / 2, 0],
    }, { castShadow: false }),
    f.mesh("Window Frame", box(0.4, 0.4, 0.04), trim, {
      position: [-w / 2 + 0.04, 0.12 + wallH + ridgeH * 0.45, 0],
      rotation: [0, Math.PI / 2, 0],
    }, { castShadow: true }),
  ];
  return f.group("Pasture Stable", parts, { position: pos, rotation: [0, -Math.PI / 8, 0] });
}

/**
 * Two stacked round hay bales — a bottom pair lying on their flat ends
 * with a single bale resting on top. Each bale uses the burlap texture
 * for a coarse straw weave reading.
 */
function buildHayBales(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const hayMat = std(C.hayBale, 0.95, {
    texture: "burlap",
    textureScale: [2, 1],
    flatShading: true,
  });
  const hayCap = std(C.hayBaleDark, 0.95, { texture: "burlap", textureScale: [1, 1], flatShading: true });
  function bale(name: string, pos: [number, number, number], rotY: number): SceneNode {
    const radius = 0.55;
    const length = 0.95;
    return f.group(name, [
      // Cylindrical body laid on its side.
      f.mesh("Body", cylinder(radius, radius, length, 16), hayMat, {
        position: [0, 0, 0],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Darker caps for the cut ends.
      f.mesh("Cap Front", cylinder(radius * 0.98, radius * 0.98, 0.03, 16), hayCap, {
        position: [0, 0, length / 2 + 0.01],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true }),
      f.mesh("Cap Back", cylinder(radius * 0.98, radius * 0.98, 0.03, 16), hayCap, {
        position: [0, 0, -length / 2 - 0.01],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true }),
    ], { position: pos, rotation: [0, rotY, 0] });
  }
  return f.group("Hay Bales", [
    bale("Bale A", [-0.3, 0.55, 0], 0),
    bale("Bale B", [0.6, 0.55, 0.1], 0.12),
    // Top bale tucked between the lower pair.
    bale("Bale C", [0.18, 1.18, 0.04], -0.05),
    // A loose hay scatter on the ground — a few thin angled boxes.
    f.mesh("Loose Hay", box(1.6, 0.04, 1.4), hayMat, {
      position: [0.15, 0.02, 0],
    }, { receiveShadow: true }),
  ], { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/**
 * A split-rail pasture fence running along the east and south edges of
 * the new ground plane. Each segment is a pair of horizontal rails between
 * square posts — instanced so the corner is cheap.
 */
function buildPastureFence(f: NodeFactory): SceneNode {
  const wood = std(C.pastureFence, 0.85, { texture: "bark", flatShading: true });
  const xR = NE_PASTURE_POS[0] + NE_PASTURE_W / 2 - 0.5;
  const xL = NE_PASTURE_POS[0] - NE_PASTURE_W / 2 + 1.0;
  const zN = NE_PASTURE_POS[2] - NE_PASTURE_D / 2 + 0.5;
  const zS = NE_PASTURE_POS[2] + NE_PASTURE_D / 2 - 0.5;
  const postH = 1.05;
  const posts: Transform[] = [];
  // Posts along the east edge.
  for (let z = zN; z <= zS + 1e-3; z += 1.6) {
    posts.push({ position: [xR, postH / 2, z], rotation: [0, 0, 0], scale: [1, 1, 1] });
  }
  // Posts along the south edge (skip the corner one already placed at zS).
  for (let x = xR - 1.6; x >= xL - 1e-3; x -= 1.6) {
    posts.push({ position: [x, postH / 2, zS], rotation: [0, 0, 0], scale: [1, 1, 1] });
  }
  // Rails — long thin boxes.
  const rails: SceneNode[] = [];
  const eastLen = zS - zN;
  const southLen = xR - xL;
  for (const yOff of [0.35, 0.78]) {
    rails.push(
      f.mesh("Rail E", box(0.06, 0.05, eastLen), wood, {
        position: [xR, yOff, (zN + zS) / 2],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Rail S", box(southLen, 0.05, 0.06), wood, {
        position: [(xL + xR) / 2, yOff, zS],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  return f.group("Pasture Fence", [
    f.instanced(
      "Fence Posts",
      box(0.1, postH, 0.1),
      wood,
      posts,
      { castShadow: true, receiveShadow: true },
    ),
    ...rails,
  ]);
}

/**
 * A scatter of meadow-grass tufts on the pasture — short rounded clumps,
 * instanced for cheap rendering. Tufts avoid the stable, the hay bales
 * and the perimeter fence corridor.
 */
function buildPastureTufts(f: NodeFactory): SceneNode {
  const tuftMat = std(C.pastureGrassDark, 0.95, { flatShading: true });
  const rng = mulberry32(0x70ff7a);
  const tufts: Transform[] = [];
  const xMin = NE_PASTURE_POS[0] - NE_PASTURE_W / 2 + 2;
  const xMax = NE_PASTURE_POS[0] + NE_PASTURE_W / 2 - 2;
  const zMin = NE_PASTURE_POS[2] - NE_PASTURE_D / 2 + 2;
  const zMax = NE_PASTURE_POS[2] + NE_PASTURE_D / 2 - 2;
  let attempts = 0;
  while (tufts.length < 56 && attempts < 600) {
    attempts++;
    const x = xMin + rng() * (xMax - xMin);
    const z = zMin + rng() * (zMax - zMin);
    if (Math.hypot(x - STABLE_POS[0], z - STABLE_POS[2]) < 2.6) continue;
    if (Math.hypot(x - HAY_BALES_POS[0], z - HAY_BALES_POS[2]) < 1.6) continue;
    const s = 0.18 + rng() * 0.12;
    tufts.push({
      position: [x, s * 0.35, z],
      rotation: [0, rng() * Math.PI, 0],
      scale: [s, s * 0.6, s],
    });
  }
  return f.instanced(
    "Pasture Tufts",
    sphere(1, 8, 6),
    tuftMat,
    tufts,
    { castShadow: true, receiveShadow: true },
  );
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
 *  - Seventh pass — yard: a round stone fire pit with crossed logs and
 *    glowing embers ringed by three log-round stools, a hexagonal
 *    cottage gazebo with a domed shingle roof, a curved bench and a
 *    hanging lantern, and a pair of slatted compost bins with a leaning
 *    pitchfork tucked behind the garden shed; house: a formal topiary
 *    edging of ten clipped dwarf hedge balls lining the cobble path
 *    from porch to gate, and a pair of striped canvas awnings over the
 *    upper-storey back-wall windows; scene: a Japanese-style west pond
 *    garden plane mirroring the side orchard, with a koi pond ringed
 *    by river stones, drifting lily pads and three submerged koi, an
 *    arched stone footbridge, two stone garden lanterns, three weeping
 *    willows and moss-flecked decorative boulders.
 *  - Eighth pass — yard: a rustic picnic table with a red-checkered
 *    tablecloth and matching slatted benches, a three-tier cascading
 *    stone fountain on the south lawn and an A-frame tool rack of
 *    leaning garden implements with a galvanised bucket beside the
 *    back-corner shed; house: a strand of warm bistro string lights
 *    running along the front roof eave from porch to weather vane;
 *    scene: a north lakefront plane stretching beyond the back
 *    meadow's far edge, carrying an open lake with deep / shallow
 *    layers and drift highlights, a wooden plank pier on stout posts
 *    with a lake-end lantern and a mooring cleat, a moored rowboat
 *    with oars and a painter, cattail fringes along the shoreline,
 *    a grove of lakeside conifers and a red-and-white channel buoy
 *    with a tiny pennant flag.
 *  - Ninth pass — yard: a two-box bee apiary on a slate platform with
 *    a honeycomb-stamped hive front (paired with a depth map so the
 *    cell walls read as relief), a marble bunny garden statue on a
 *    fluted column pedestal (with a marble depth map carving its
 *    veining as bump relief) and a three-legged black kettle BBQ
 *    grill with a glowing ember disc and a side shelf of tongs;
 *    scene: a south-heath plane reaching beyond the front yard's
 *    far edge, with a heather-toned ground that uses a heather
 *    depth map, a winding dirt trail extending the cobble path
 *    into the moor, a low rolling earth mound topped with loose
 *    stones, a miniature standing-stone circle in marble around a
 *    flat altar and three slender birch trees with stylised paper
 *    bark and lime foliage crowns; the frontend lighting rig adds
 *    a warm-pink-over-moss-green hemisphere fill so the under-eaves
 *    and the heath stones don't fall completely flat in the sun's
 *    shadow.
 *  - Tenth pass — yard: a cast-iron hand-pump well on a slate
 *    footing with a stone trough and a thin water column on the
 *    west lawn, and a wooden grape arbor draped with leaves and
 *    cobalt-purple grape clusters on the east lawn; house: a pair
 *    of weathered copper rain barrels under the front-corner
 *    downspouts, banded with iron hoops and a brass spigot — the
 *    barrels carry the new `copper-patina` colour map paired with
 *    a matching depth map so the verdigris mottling reads as
 *    crusted relief; scene: a northeast pasture ground plane
 *    bridging the back meadow's east edge and the side orchard's
 *    north edge, with a board-and-batten horse stable with a
 *    gabled shingle roof and a Dutch-split door, a stack of three
 *    round burlap-bound hay bales and a split-rail pasture fence
 *    running the eastern and southern perimeters.
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
    // Seventh-pass keep-outs — fire pit (with seating ring), gazebo and composter.
    { x: FIRE_PIT_POS[0], z: FIRE_PIT_POS[2], r: 2.0 },
    { x: GAZEBO_POS[0], z: GAZEBO_POS[2], r: 2.0 },
    { x: COMPOSTER_POS[0], z: COMPOSTER_POS[2], r: 1.2 },
    // Eighth-pass keep-outs — picnic table, stone fountain and tool rack.
    { x: PICNIC_TABLE_POS[0], z: PICNIC_TABLE_POS[2], r: 1.6 },
    { x: STONE_FOUNTAIN_POS[0], z: STONE_FOUNTAIN_POS[2], r: 1.5 },
    { x: TOOL_RACK_POS[0], z: TOOL_RACK_POS[2], r: 1.0 },
    // Ninth-pass keep-outs — apiary, marble statue and kettle BBQ grill.
    { x: APIARY_POS[0], z: APIARY_POS[2], r: 1.1 },
    { x: GARDEN_STATUE_POS[0], z: GARDEN_STATUE_POS[2], r: 0.9 },
    { x: BBQ_GRILL_POS[0], z: BBQ_GRILL_POS[2], r: 0.8 },
    // Tenth-pass keep-outs — hand pump and grape arbor.
    { x: HAND_PUMP_POS[0], z: HAND_PUMP_POS[2], r: 1.4 },
    { x: GRAPE_ARBOR_POS[0], z: GRAPE_ARBOR_POS[2], r: 1.7 },
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
    buildFirePit(f, FIRE_PIT_POS),
    buildGazebo(f, GAZEBO_POS),
    buildComposterBin(f, COMPOSTER_POS),
    buildPicnicTable(f, PICNIC_TABLE_POS),
    buildStoneFountain(f, STONE_FOUNTAIN_POS),
    buildToolRack(f, TOOL_RACK_POS),
    buildBeeApiary(f, APIARY_POS),
    buildGardenStatue(f, GARDEN_STATUE_POS),
    buildBbqKettle(f, BBQ_GRILL_POS),
    buildHandPump(f, HAND_PUMP_POS),
    buildGrapeArbor(f, GRAPE_ARBOR_POS),
  ]);
  const meadow = buildBackMeadow(f);
  const orchard = buildSideOrchard(f);
  const pondGarden = buildWestPondGarden(f);
  const lakefront = buildNorthLakefront(f);
  const heath = buildSouthHeath(f);
  const nePasture = buildNortheastPasture(f);
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
    buildPorchSteps(f),
    buildWindowAwnings(f),
    buildEaveStringLights(f),
    buildFurniture(f),
    buildRainBarrels(f),
  ]);
  const root: SceneNode = {
    id: "dh-root",
    name: "Dollhouse",
    kind: "group",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    children: [garden, meadow, orchard, pondGarden, lakefront, heath, nePasture, house],
  };
  return {
    schemaVersion: DOLLHOUSE_SCHEMA_VERSION,
    kind: "dollhouse",
    root,
    metadata: { name: "Pink Victorian Dollhouse" },
  };
}
