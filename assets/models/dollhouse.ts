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

/**
 * Eleventh-pass courtyard props — a wood-fired stone pizza oven on the
 * east back lawn (with a stacked split-wood pile beside the firebox), a
 * timber potting bench against the back fence flanked by a row of
 * terracotta pots, and a stone garden chess set on the front lawn with
 * carved chess pieces on a checkered marble board.
 */
const PIZZA_OVEN_POS: [number, number, number] = [11.0, 0, -2.2];
const POTTING_BENCH_POS: [number, number, number] = [-2.2, 0, -4.2];
const CHESS_GARDEN_POS: [number, number, number] = [-0.7, 0, 1.6];

/**
 * Eleventh-pass scene extension — a southwest wheat field plane bridging
 * the gap between the west pond garden's south edge (z ≈ 19) and the
 * south heath's west edge (z ≈ 32, x ≈ -25). The plane overlaps each
 * neighbour by ~1.5 units so the ground layer joins seamlessly. It
 * carries golden wind-rowed wheat (with a paired colour + depth map), a
 * Dutch-style four-sail windmill, scattered wheat sheaves and a winding
 * cart trail that meanders between the windmill and the pond garden.
 */
const WHEAT_FIELD_POS: [number, number, number] = [-32, -0.009, 25.5];
const WHEAT_FIELD_W = 22;
const WHEAT_FIELD_D = 16;
const WINDMILL_POS: [number, number, number] = [-36, 0, 28];

/**
 * Twelfth-pass courtyard prop — a lean-to greenhouse on the back-east lawn
 * with a sloped glass-paned roof, a white-painted timber frame, an open
 * door panel and a row of three potted seedlings inside.
 */
const GREENHOUSE_POS: [number, number, number] = [3.5, 0, -4.4];

/**
 * Thirteenth-pass courtyard props — a rose pergola with a cross-beam lattice
 * crowned by climbing roses on the back-west lawn, and an ornamental dovecote
 * tower on a slate platform with three perched white doves.
 */
const ROSE_PERGOLA_POS: [number, number, number] = [-5.6, 0, 1.6];
const DOVECOTE_POS: [number, number, number] = [-9.4, 0, 2.8];

/**
 * Twelfth-pass scene extension — a northwest woodland plane bridging the
 * gap between the back meadow's west edge (x ≈ -25) and the west pond
 * garden's north edge (z ≈ -9). The plane overlaps each neighbour by
 * ~2 units along its joins so the ground layer has no holes. It carries
 * a grove of tall conifers (with the new `pine-bark` colour map paired
 * with a depth map so the trunk ridges read as relief), a mossy fallen
 * log, a fairy mushroom ring of red toadstools and a small wooden ranger
 * lookout tower on four stilts with a peaked shingle roof.
 */
const NW_WOODLAND_POS: [number, number, number] = [-33, -0.011, -25];
const NW_WOODLAND_W = 22;
const NW_WOODLAND_D = 36;
const LOOKOUT_TOWER_POS: [number, number, number] = [-38, 0, -32];
const FALLEN_LOG_POS: [number, number, number] = [-30, 0, -18];
const MUSHROOM_RING_POS: [number, number, number] = [-30, 0, -28];

/**
 * Thirteenth-pass scene extension — a southeast vineyard plane bridging the
 * gap between the side orchard's south edge (z ≈ 19, x ≈ [24, 42]) and the
 * south heath's east edge (x ≈ 25, z ≈ [32, 60]). The plane overlaps the
 * orchard by ~1.5 units along its north edge and the heath by ~1.5 units
 * along its west edge so the ground layer joins seamlessly. It carries a
 * tilled cinnamon-earth field (with the new `vineyard-soil` colour map
 * paired with a row-ridge depth map so the plough furrows read as relief),
 * five rows of grape trellises with cobalt-purple grape clusters, a small
 * stone wine press shed with a peaked tile roof, four oak wine barrels
 * stacked beside the shed and a pair of slender cypress trees framing the
 * approach from the orchard side.
 */
const SE_VINEYARD_POS: [number, number, number] = [30, -0.013, 26];
const SE_VINEYARD_W = 22;
const SE_VINEYARD_D = 18;
const WINE_SHED_POS: [number, number, number] = [37, 0, 29];
const WINE_BARRELS_POS: [number, number, number] = [34.4, 0, 30];

/**
 * Thirteenth-pass house detail — a central roof cupola (belvedere) atop the
 * main roof ridge with four small arched windows, a peaked shingle roof and
 * a copper-patina spire finial. The cupola sits centred along the ridge so
 * it reads as a tower lantern rather than a structural chimney.
 */
const CUPOLA_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H, 0];

/**
 * Fourteenth-pass courtyard props — a wrought-iron Victorian two-seater
 * garden glider with a striped canvas canopy on the west lawn just outside
 * the fence (between the lawn and the west pond garden), and an ornamental
 * brass armillary sphere on a fluted stone pedestal on the east lawn just
 * outside the fence (between the lawn and the side orchard's stone wall).
 * The armillary's intersecting rings reuse the `copper-patina` colour +
 * bump pair so the verdigris reads as crusted relief on the metal arcs.
 */
const GLIDER_POS: [number, number, number] = [-13.5, 0, 5.0];
const ARMILLARY_POS: [number, number, number] = [14.0, 0, 1.5];

/**
 * Fourteenth-pass house detail — a pair of round oculus windows centred in
 * the front and back gables, each ringed by a copper-patina trim band that
 * reuses the existing `copper-patina` colour + bump pair so the metal frame
 * reads as crusted relief at the top of each gable.
 */
const FRONT_OCULUS_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H / 2, FRONT_Z + 0.06];
const BACK_OCULUS_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H / 2, BACK_Z - 0.06];

/**
 * Fourteenth-pass scene extension — a southeast olive grove plane mirroring
 * the side orchard's east edge. The plane overlaps the orchard by ~1 unit
 * along its west join so the ground layer has no holes. It carries a sun-
 * bleached khaki ground (with the new `olive-grove` colour map paired with
 * a pebble depth map so the scattered olive pits and pale pebbles read as
 * raised relief at glancing sun), a grove of six silver-leaved olive trees
 * with gnarled twin trunks, a rustic dry-stone retaining wall along the
 * orchard join with a doll-width gap, a cluster of three clay amphora urns
 * by the south corner and an old olive-press millstone wheel on a flat
 * slate base in the middle of the grove.
 */
const OLIVE_GROVE_POS: [number, number, number] = [50, -0.014, 5];
const OLIVE_GROVE_W = 18;
const OLIVE_GROVE_D = 28;
/** The dry-stone wall sits just inside the olive grove's west edge, marking the join. */
const OLIVE_GROVE_WALL_X = 42;
const AMPHORA_CLUSTER_POS: [number, number, number] = [55, 0, 16];
const OLIVE_MILLSTONE_POS: [number, number, number] = [51, 0, 5];

/**
 * Fifteenth-pass courtyard props — a pair of Adirondack chairs facing each
 * other across a small slatted side table on the back lawn near the patio
 * set, and a tall ornamental cascading-flower urn on a fluted pedestal as
 * a focal piece on the south lawn near the path's first bend.
 */
const ADIRONDACK_PAIR_POS: [number, number, number] = [-5.7, 0, 3.8];
const CASCADE_URN_POS: [number, number, number] = [1.6, 0, 7.4];

/**
 * Fifteenth-pass house detail — a verdigris brass door knocker and a small
 * house number plaque on the front wall beside the open arched doorway.
 * Both reuse the existing `copper-patina` colour + bump pair so the metal
 * carries crusted relief on the door surround.
 */
const DOOR_KNOCKER_POS: [number, number, number] = [0.62, 1.6, FRONT_Z + WALL_T / 2 + 0.01];
const HOUSE_PLAQUE_POS: [number, number, number] = [0.92, 2.05, FRONT_Z + WALL_T / 2 + 0.01];

/**
 * Fifteenth-pass scene extension — a southwest lavender field plane
 * mirroring the southeast olive grove on the west side of the lawn. The
 * plane overlaps the west pond garden by ~1 unit along its east join so
 * the ground layer has no holes. It carries a sage-green cultivated
 * ground surfaced with the new `lavender-field` colour map paired with
 * a row-crest depth map (registered alongside the other procedural
 * textures) so the bloom rows read as raised relief at glancing sun,
 * a pond-garden-grass apron along the east join, a mirror dry-stone
 * retaining wall along the pond-garden edge with a doll-width gap,
 * five rows of cultivated lavender bushes with purple bloom tops, a
 * trio of straw bee skeps on a slate platform in the south corner, a
 * focal antique stone watering trough on a slate plinth in the middle
 * of the field, and a weathered wooden flower cart parked at the
 * north corner of the field.
 */
const LAVENDER_FIELD_POS: [number, number, number] = [-50, -0.015, 5];
const LAVENDER_FIELD_W = 18;
const LAVENDER_FIELD_D = 28;
/** The mirror dry-stone wall sits just inside the lavender field's east edge. */
const LAVENDER_WALL_X = -42;
const BEE_SKEP_CLUSTER_POS: [number, number, number] = [-55, 0, 16];
const STONE_TROUGH_POS: [number, number, number] = [-51, 0, 5];
const FLOWER_CART_POS: [number, number, number] = [-47, 0, -8];

/**
 * Sixteenth-pass courtyard props — a Victorian garden gazing ball on a
 * swirling iron stand near the south end of the cobble path's first bend
 * and a small stone cherub statue holding a basket of blooms on a low
 * plinth opposite the gazing ball across the path. The gazing ball uses a
 * polished mirror-finish material so it reads as a metallic reflective
 * sphere from any angle of approach.
 */
const GAZING_BALL_POS: [number, number, number] = [2.4, 0, 5.5];
const CHERUB_STATUE_POS: [number, number, number] = [-1.4, 0, 6.6];

/**
 * Sixteenth-pass house detail — a pair of climbing-rose trellises mounted
 * on the east and west exterior side walls. Each trellis is a lattice grid
 * of slim painted slats with climbing-rose vines and pink bloom dabs
 * scattered up the grid, the south half of each side wall (so the east
 * trellis sits clear of the hose reel at z = -1.8 and the west trellis
 * sits clear of the clothesline path).
 */
const TRELLIS_E_POS: [number, number, number] = [W / 2 + 0.06, 0, 1.05];
const TRELLIS_W_POS: [number, number, number] = [-W / 2 - 0.06, 0, 1.05];

/**
 * Sixteenth-pass scene extension — a far-north alpine foothills plane
 * reaching beyond the lakefront's far edge. The plane overlaps the
 * lakefront by ~1.5 units along its south join so the ground layer has
 * no holes. It carries a snow-dusted alpine ground (with the new
 * `alpine-foothills` colour map paired with a snowdrift-and-scree depth
 * map so the drifts read as raised relief at glancing sun), a south
 * lakefront-grass apron along the join, a small log cabin with a stone
 * chimney trailing translucent smoke and a warm glow in its window, a
 * grove of six snow-dusted conifers, three rounded snowdrift mounds, a
 * pair of mossy boulders and a small frozen tarn pond with a thin sheet
 * of pale-blue ice.
 */
const ALPINE_POS: [number, number, number] = [0, -0.016, -86];
const ALPINE_W = 56;
const ALPINE_D = 28;
const LOG_CABIN_POS: [number, number, number] = [-6, 0, -90];
const ALPINE_TARN_POS: [number, number, number] = [10, 0, -88];

/**
 * Seventeenth-pass courtyard props — a wrought-iron Victorian tea table
 * set on the back-east lawn (round iron table with crossed legs, two
 * ornate scrollback iron chairs, a porcelain teapot, two cups on saucers
 * and a three-tier pastry stand), and a pair of stone owl sentinel
 * statues on slate plinths flanking the cobble path entrance near the
 * front gate. The owl bodies reuse the existing `marble` colour + bump
 * pair so the stone reads with veined relief on the rounded shoulders.
 */
const TEA_TABLE_POS: [number, number, number] = [10.5, 0, -7.0];
const OWL_L_POS: [number, number, number] = [-1.8, 0, 12.5];
const OWL_R_POS: [number, number, number] = [1.8, 0, 12.5];

/**
 * Seventeenth-pass house detail — a stained-glass arched fanlight
 * transom panel centred above the front door, tucked between the door
 * trim and the porch canopy. The panel uses a new procedural
 * `stained-glass` colour map paired with a `stained-glass-bump` depth
 * map (registered alongside the other procedural textures) so the
 * leaded muntins read as crusted relief on the glass plane, with a
 * dim warm glow plate sitting just behind it to suggest interior light
 * filtering through the rose-window medallion.
 */
const FANLIGHT_POS: [number, number, number] = [0, 2.5, FRONT_Z + WALL_T / 2 + 0.005];

/**
 * Seventeenth-pass scene extension — a northeast autumn maple grove
 * plane bridging the gap between the lakefront's east edge (x ≈ 30,
 * z ≈ [-73, -39]) and the northeast pasture's north edge (z ≈ -40,
 * x ≈ [25, 43]). The plane overlaps the lakefront by ~1 unit along
 * its west join and the pasture by ~2 units along its south join so
 * the ground layer has no holes at the seams. It carries an auburn-
 * orange ground (the new `autumn-canopy` colour map paired with a
 * leaf-litter depth map so the leaf piles and exposed soil patches
 * read as raised relief at glancing sun), a grove of five maple trees
 * with crimson, amber and gold foliage layers, a small wooden hunting
 * lodge with a stone chimney trailing pale smoke and a warm window
 * glow, a pair of moss-jacketed fallen logs and a small stacked-stone
 * cairn marking a clearing at the back of the grove.
 */
const NE_MAPLE_POS: [number, number, number] = [36, -0.017, -55.5];
const NE_MAPLE_W = 14;
const NE_MAPLE_D = 35;
const HUNTING_LODGE_POS: [number, number, number] = [38, 0, -60];
const MAPLE_LOG_A_POS: [number, number, number] = [33, 0, -50];
const MAPLE_LOG_B_POS: [number, number, number] = [40, 0, -45];
const MAPLE_CAIRN_POS: [number, number, number] = [34, 0, -68];

/**
 * Eighteenth-pass courtyard props — a bronze knight sentinel statue on
 * a fluted marble pedestal on the east lawn (verdigris bronze figure
 * with sword and shield, reusing the existing `copper-patina` colour +
 * bump pair so the patina mottling reads as crusted relief on the
 * armour), and a raised wooden cold frame planted with three glass
 * cloches (bell jars) sheltering seedlings on the back lawn. The
 * cloche bells are translucent so the seedlings inside read as
 * dappled silhouettes through the glass.
 */
const KNIGHT_STATUE_POS: [number, number, number] = [5.5, 0, 1.5];
const CLOCHE_BED_POS: [number, number, number] = [4.0, 0, -7.0];

/**
 * Eighteenth-pass house detail — a pair of carved Victorian bargeboards
 * with pendant drop finials trimming the front and back gable rakes.
 * Each bargeboard is a stepped scroll panel hugging the eave slope with
 * three pendant finial drops below it, giving the gable a lacy
 * silhouette against the sky.
 */
const FRONT_BARGEBOARD_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H / 2, FRONT_Z + 0.04];
const BACK_BARGEBOARD_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H / 2, BACK_Z - 0.04];

/**
 * Eighteenth-pass scene extension — a northwest waterfall ravine plane
 * tucked into the gap between the northwest woodland's north edge
 * (z ≈ -43, x ≈ [-44, -22]) and the alpine foothills' west edge
 * (x ≈ -28, z ≈ [-100, -72]). The plane overlaps the woodland by ~1.5
 * units along its south join, the alpine foothills by ~1.5 units
 * along its north join and the lakefront by ~1.5 units along its east
 * join so the ground layer has no holes at any of the three seams. It
 * carries a granite-toned ground surfaced with the new `granite-cliff`
 * colour map paired with a fissure depth map (registered alongside
 * the other procedural textures) so the bedding cracks and lichen
 * patches read as raised relief at glancing sun, a tall north-edge
 * granite cliff face, a tumbling three-tier waterfall cascading off
 * the cliff into a fern-fringed plunge pool, a wooden plank footbridge
 * crossing the outflow stream at the south end, three alpine pine
 * trees clinging to the rim of the cliff and a scatter of mossy
 * boulders ringing the pool.
 */
const NW_RAVINE_POS: [number, number, number] = [-37, -0.018, -57];
const NW_RAVINE_W = 16;
const NW_RAVINE_D = 32;
const RAVINE_CLIFF_Z = NW_RAVINE_POS[2] - NW_RAVINE_D / 2 + 3.5;
const WATERFALL_POS: [number, number, number] = [-37, 0, RAVINE_CLIFF_Z + 0.6];
const PLUNGE_POOL_POS: [number, number, number] = [-37, 0, RAVINE_CLIFF_Z + 3.4];
const PLANK_BRIDGE_POS: [number, number, number] = [-37, 0, NW_RAVINE_POS[2] + NW_RAVINE_D / 2 - 5];

/**
 * Nineteenth-pass courtyard prop — a Victorian cast-bronze cupid fountain
 * on the back-southwest lawn. A slim cupid figure on a swelled column
 * pedestal holds a flower vase aloft, with a thin water column trickling
 * from the vase rim into an upper basin and a wider sheet of water falling
 * over the rim of the upper basin into a lower tiered basin. The cupid body
 * reuses the existing `copper-patina` colour + bump pair so the verdigris
 * mottling reads as crusted relief on the wings and the slim limbs, and the
 * tiered basins reuse the existing `marble` colour + bump pair so the rim
 * seams read as veined relief on the stone.
 */
const CUPID_FOUNTAIN_POS: [number, number, number] = [-9, 0, 13];

/**
 * Nineteenth-pass house detail — a pair of ornate cast-iron gable peak
 * finials with copper-patina spires crowning the front and back gable
 * ridges above the existing bargeboard medallions. Each finial is a slim
 * tapered spire with a lobed medallion cap, an open quatrefoil ring and a
 * small pennant directional vane at the tip. Both reuse the existing
 * `copper-patina` colour + bump pair so the verdigris mottling reads as
 * crusted relief on the metal spire.
 */
const GABLE_FINIAL_FRONT_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H * 1.02, FRONT_Z + 0.04];
const GABLE_FINIAL_BACK_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H * 1.02, BACK_Z - 0.04];

/**
 * Nineteenth-pass scene extension — a southwest sunflower field plane
 * bridging the gap south of the wheat field's south edge (z ≈ 33.5, x ≈
 * [-43, -21]) and west of the south heath's west edge (x ≈ -25, z ≈
 * [32, 60]). The plane overlaps the wheat field by ~1.5 units along its
 * north edge and the south heath by ~1.5 units along its east edge so
 * the ground layer has no holes at either seam. It carries a cultivated
 * yellow-and-brown ground surfaced with the new `sunflower-field` colour
 * map paired with a row depth map (registered alongside the other
 * procedural textures) so the planting rows and seed clumps read as
 * raised relief at glancing sun, six rows of tall sunflower plants with
 * bright yellow ray-petal faces and dark seed-disc centres, a small
 * board-and-batten tool shed at the northwest corner with a peaked
 * shingle roof and a sun-bleached door, a scatter of straw bales between
 * the rows and a slim stake-and-twine fence along the south edge.
 */
const SUNFLOWER_FIELD_POS: [number, number, number] = [-34.5, -0.019, 45];
const SUNFLOWER_FIELD_W = 22;
const SUNFLOWER_FIELD_D = 26;
const SUNFLOWER_SHED_POS: [number, number, number] = [-42, 0, 36];

/**
 * Twentieth-pass courtyard prop — a Victorian ornamental iron birdcage
 * aviary on a fluted marble plinth, parked on the southeast outside-fence
 * lawn between the bee apiary and the side-orchard gate. A swelled domed
 * cage built from a ring of vertical iron bars and three horizontal hoop
 * rings holds a slender central perch with a small bright bird, the dome
 * is crowned by a slim copper-patina finial spire, and the cage seats on
 * a fluted marble plinth ringed by a slim copper-patina trim ring. The
 * iron bars, hoops and finial spire reuse the existing `copper-patina`
 * colour + bump pair so the verdigris mottling reads as crusted relief on
 * the cast metal, and the plinth reuses the existing `marble` colour +
 * bump pair so the stone reads with veined relief.
 */
const AVIARY_POS: [number, number, number] = [13.0, 0, 13.0];

/**
 * Twentieth-pass house detail — a row of ornate Victorian iron ridge
 * cresting pickets running along the main roof ridge between the front
 * and back gable peaks. Each picket is a slim copper-patina spear-tip
 * spire seated on a low scroll bracket, and short ornamental scroll
 * caps between adjacent pickets read as the lacy filigree typical of
 * cast-iron ridge cresting. All iron parts reuse the existing
 * `copper-patina` colour + bump pair so the verdigris reads as crusted
 * relief on the cast metal.
 */
const RIDGE_CRESTING_PICKETS = 9;

/**
 * Twentieth-pass scene extension — a southeast citrus grove plane tucked
 * into the gap between the southeast vineyard's south edge (z ≈ 35, x ≈
 * [19, 41]) and the south heath's east edge (x ≈ 25, z ≈ [32, 60]). The
 * plane overlaps the vineyard by ~1.5 units along its north edge and the
 * south heath by ~1.5 units along its west edge so the ground layer has
 * no holes at either seam. It carries a sun-baked terracotta ground
 * surfaced with the new `citrus-grove` colour map paired with a pebble
 * depth map (registered alongside the other procedural textures) so the
 * fallen-fruit dabs and scattered pebbles read as raised relief at
 * glancing sun, a small grove of six citrus trees (three lemon and three
 * orange, alternating across two rows) with bright yellow and orange
 * fruit dabs in their crowns, a small stone-walled juice press shed at
 * the southeast corner with a peaked terracotta-tile roof, a focal
 * weathered wooden produce crate brimming with ripe citrus near the
 * north-west gate apron and a low dry-stone retaining wall running along
 * the south and east edges of the grove.
 */
const CITRUS_GROVE_POS: [number, number, number] = [33, -0.020, 47];
const CITRUS_GROVE_W = 18;
const CITRUS_GROVE_D = 24;
const CITRUS_PRESS_POS: [number, number, number] = [39, 0, 55];
const CITRUS_CRATE_POS: [number, number, number] = [27, 0, 38];

/**
 * Twenty-first-pass courtyard prop — a whimsical Victorian carousel horse
 * ornament on a fluted marble pedestal, parked on the back-west outside-fence
 * lawn between the glider and the back fence. The horse is a stylised prancing
 * piece with a swirling pole running through its back (reusing the existing
 * `copper-patina` colour + bump pair so the verdigris reads as crusted relief
 * on the brass pole, harness studs and tassel rings), a cream body with a
 * flowing rose-pink mane and tail, a gilt saddle with rose bib and the marble
 * plinth reuses the existing `marble` colour + bump pair so the stone reads
 * with veined relief.
 */
const CAROUSEL_HORSE_POS: [number, number, number] = [-12.5, 0, -5.5];

/**
 * Twenty-first-pass house detail — a pair of decorative bay windows projecting
 * from the east and west side walls of the lower storey. Each bay is a small
 * three-sided box bump with a slim peaked shingle cap, a white painted trim
 * sash and three tinted glass panes (front + two angled sides). The bay
 * windows add 3D dimensionality to the side façades without modifying the
 * underlying side-wall construction.
 */
const BAY_WINDOW_E_POS: [number, number, number] = [W / 2 + 0.04, 0, -0.6];
const BAY_WINDOW_W_POS: [number, number, number] = [-W / 2 - 0.04, 0, -0.6];

/**
 * Twenty-first-pass scene extension — a far-east desert oasis plane tucked
 * beyond the southeast olive grove's east edge. The plane overlaps the olive
 * grove by ~1 unit along its west join so the ground layer has no holes. It
 * carries a sun-baked sand ground surfaced with the new `desert-sand` colour
 * map paired with a dune-and-pebble depth map (registered alongside the other
 * procedural textures) so the dune crests and scattered pebbles read as raised
 * relief at glancing sun, an olive-grove apron along the west join, three
 * date palm trees with broad frond crowns and pendant date clusters, a small
 * mud-brick caravanserai (adobe inn) at the southeast corner with a flat
 * sun-baked roof and round wooden beam ends, a focal sandstone obelisk pillar
 * with a pyramidal cap and a hieroglyphic relief band on its shaft, a small
 * resting camel statue with a red saddle blanket and a scatter of low dune
 * mounds rolling across the sand.
 */
const DESERT_OASIS_POS: [number, number, number] = [68, -0.021, 5];
const DESERT_OASIS_W = 18;
const DESERT_OASIS_D = 28;
const CARAVANSERAI_POS: [number, number, number] = [74, 0, 15];
const DESERT_OBELISK_POS: [number, number, number] = [68, 0, -4];
const CAMEL_STATUE_POS: [number, number, number] = [70, 0, 8];

/**
 * Twenty-second-pass courtyard prop — a Victorian wrought-iron flagpole stand
 * with a striped triangular pennant flag on a fluted marble base, parked on
 * the front-west outside-gate apron just outside the picket fence. The pole,
 * halyard ring and finial ball reuse the existing `copper-patina` colour +
 * bump pair so the verdigris reads as crusted relief on the cast metal, the
 * plinth reuses the existing `marble` colour + bump pair so the stone reads
 * with veined relief, and the pennant flag carries a slim cream-and-rose
 * stripe pattern fluttering off to the east.
 */
const FLAGPOLE_POS: [number, number, number] = [-3.6, 0, 14.6];

/**
 * Twenty-second-pass house detail — a pair of small Victorian copper sunburst
 * rosettes mounted on the front and back gable faces above the existing
 * oculus windows. Each rosette is a slim central marble disc surrounded by
 * twelve copper-patina rays radiating outward in an alternating long/short
 * pattern, with a small central boss covering the ray junction.
 */
const FRONT_SUNBURST_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H * 0.78, FRONT_Z + 0.06];
const BACK_SUNBURST_POS: [number, number, number] = [0, ROOF_TOP + ROOF_H * 0.78, BACK_Z - 0.06];

/**
 * Twenty-second-pass scene extension — a far-southwest peat-bog moor plane
 * south of the lavender field bridging the gap between the lavender field's
 * south edge and the wheat field's west edge. The plane overlaps the lavender
 * field by ~1 unit along its north join and the wheat field by ~1 unit along
 * its east join so the ground layer has no holes at either seam. It carries
 * a moss-toned ground surfaced with the new `peat-moor` colour map paired
 * with a turf-cut depth map (registered alongside the other procedural
 * textures) so the peat-cut blocks and dark pools read as raised relief at
 * glancing sun, a small stone crofter's cottage at the south corner with a
 * thatched pitched roof and a slim chimney, a stack of three rectangular
 * peat-cuttings on a slate platform, a winding burn (small stream) crossed
 * by a slim wooden plank footbridge with rope rails, a scatter of seven
 * heather tufts in three bloom tints and a small tor of three mossy granite
 * boulders at the west edge.
 */
const PEAT_MOOR_POS: [number, number, number] = [-50, -0.022, 28];
const PEAT_MOOR_W = 18;
const PEAT_MOOR_D = 18;
const CROFTERS_COTTAGE_POS: [number, number, number] = [-52, 0, 33];
const PEAT_STACK_POS: [number, number, number] = [-47, 0, 32];
const PEAT_BURN_Z = 26.5;
const PEAT_BRIDGE_POS: [number, number, number] = [-48, 0, PEAT_BURN_Z];
const PEAT_BOULDER_TOR_POS: [number, number, number] = [-57, 0, 28];

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
  // Eleventh enhancement pass — outdoor stone pizza oven, a slatted potting
  // bench with a row of terracotta pots, a stone garden chess set, a
  // wisteria-bloom drape over the porch canopy (with companion bloom +
  // depth maps) and a southwest wheat-field scene extension bridging the
  // gap between the south heath and the west pond garden, complete with a
  // Dutch-style farm windmill, scattered wheat sheaves and a winding cart
  // trail. The wheat field colour map is paired with a bump map registered
  // alongside it so the windrow ridges read as relief at glancing sun.
  ovenBrick: "#a8553c",
  ovenBrickDark: "#7a3a26",
  ovenDome: "#c98a64",
  ovenMortar: "#b8a98a",
  ovenIron: "#221e1a",
  ovenEmber: "#f57a26",
  pottingPine: "#9b7a4e",
  pottingPineDark: "#6e5436",
  clayPot: "#c3674b",
  clayPotShade: "#8e4730",
  pottingMint: "#7fb094",
  chessSlabLight: "#ede2cd",
  chessSlabDark: "#3a2e26",
  chessPieceCream: "#f0e8d8",
  chessPieceOnyx: "#2b2622",
  wisteriaPurple: "#a585c8",
  wisteriaPurpleDark: "#5d4485",
  wisteriaLeaf: "#5e8a4a",
  wisteriaVine: "#5a4630",
  wheatGold: "#cda651",
  wheatGoldDark: "#a47e2a",
  wheatHusk: "#7e6432",
  wheatStubble: "#b69a5a",
  windmillSail: "#fbf6e7",
  windmillSailFrame: "#6e4a2c",
  windmillTower: "#8c6a44",
  windmillCap: "#9e3a36",
  cartDirt: "#6a5236",
  cartDirtDark: "#3f3022",
  // Twelfth enhancement pass — a lean-to greenhouse on the back lawn, a
  // row of Victorian gingerbread corbel brackets along the front and
  // back roof eaves, and a northwest woodland scene extension with a
  // pine grove (carried on a new `pine-bark` colour + depth map pair), a
  // mossy fallen log, a fairy mushroom ring and a wooden lookout tower.
  greenhouseFrame: "#f6efe2",
  greenhouseFrameShade: "#c2b9a4",
  greenhouseGlass: "#b9d8df",
  greenhouseGlassDark: "#5f8b95",
  greenhouseRoofTrim: "#a8835a",
  greenhouseSeedling: "#7fb084",
  greenhouseSeedlingDark: "#3d6f4a",
  corbelWood: "#fbeed9",
  corbelShade: "#b6986a",
  woodlandGrass: "#5f8348",
  woodlandGrassDark: "#3f5a30",
  woodlandSoil: "#4a3a26",
  pineFoliage: "#3a5e3a",
  pineFoliageDark: "#22422c",
  pineBark: "#5a3a26",
  pineBarkDark: "#33231a",
  pineCone: "#7a4f30",
  mushroomCap: "#c84a3f",
  mushroomCapDark: "#7a2620",
  mushroomStem: "#fbf3e2",
  mushroomSpot: "#fdf6f0",
  fallenLogWood: "#7c5536",
  fallenLogMoss: "#5e8a3a",
  fallenLogShade: "#3f3022",
  lookoutPost: "#6e4a2c",
  lookoutBoard: "#9b7a4e",
  lookoutRoof: "#5c3f2c",
  lookoutLadder: "#7a5236",
  woodlandFern: "#557a3a",
  woodlandFernShade: "#3a5226",
  // Thirteenth enhancement pass — a rose pergola with cross-beam lattice and
  // climbing roses on the back-west lawn, a dovecote tower on a slate platform
  // with white doves, a central roof cupola with a copper-patina spire, and a
  // southeast vineyard scene extension (vineyard rows, a stone wine press shed,
  // stacked oak barrels and slim cypress trees). The new `vineyard-soil` colour
  // map is paired with a row-ridge depth map registered alongside it so the
  // plough furrows read as relief at glancing sun.
  pergolaWood: "#9b6b3e",
  pergolaWoodDark: "#5e3f24",
  pergolaRose: "#ea7795",
  pergolaRoseDark: "#b54665",
  dovecoteWhite: "#f5ecdc",
  dovecoteRoof: "#8a4a4a",
  dovecoteTrim: "#3d2a1c",
  doveBody: "#fafafa",
  doveBeak: "#d0a23a",
  cupolaWall: "#fbeed9",
  cupolaTrim: "#e89bb5",
  cupolaRoof: "#5c3f2c",
  vineyardSoil: "#6e3f24",
  vineyardSoilDark: "#4a2a18",
  vineyardLeaf: "#5e8a3a",
  vineyardLeafDark: "#3d5a28",
  vineyardGrape: "#4a2a6a",
  vineyardGrapeHighlight: "#7a5aa4",
  vinePost: "#7c5536",
  vineWire: "#4a4540",
  wineShedStone: "#9c8a72",
  wineShedStoneDark: "#5e4f3a",
  wineShedRoof: "#7a3a2c",
  wineShedDoor: "#3a2218",
  wineBarrel: "#7a4f30",
  wineBarrelHoop: "#3a2a1c",
  cypressFoliage: "#3a5a3a",
  cypressFoliageDark: "#1f3a24",
  cypressTrunk: "#5e4530",
  // Fourteenth enhancement pass — a wrought-iron Victorian glider with a
  // striped canvas canopy, a brass armillary sphere on a fluted stone
  // pedestal (rings reuse the copper-patina pair), gable oculus windows
  // with copper-patina trim, and a southeast olive grove scene extension
  // (silver-leaved olives with gnarled twin trunks, a dry-stone wall, a
  // cluster of clay amphora urns and an old olive-press millstone). The
  // new `olive-grove` colour map is paired with a pebble depth map so the
  // pits and pebbles read as relief at glancing sun.
  gliderIron: "#1f1c1a",
  gliderIronHi: "#3a3636",
  gliderCanopyCream: "#f3ead4",
  gliderCanopyStripe: "#a83e30",
  gliderCushion: "#6d8aa6",
  gliderCushionTrim: "#3a4c63",
  armillaryStone: "#c0b59c",
  armillaryStoneDark: "#7a6f5a",
  armillaryGlobe: "#3a496a",
  oculusGlass: "#bcd9e8",
  oliveGround: "#a48b54",
  oliveGroundDark: "#6e5836",
  oliveTuft: "#7a8a4a",
  oliveTrunk: "#5e4530",
  oliveTrunkShade: "#3a2e1f",
  oliveFoliage: "#94a584",
  oliveFoliageSilver: "#c7d2ba",
  oliveFruitDark: "#3a4530",
  oliveFruitRipe: "#7c4a26",
  oliveWallStone: "#a89776",
  oliveWallStoneDark: "#6e5e44",
  amphoraClay: "#a85a2e",
  amphoraClayDark: "#7a3a1c",
  amphoraRim: "#5e2a14",
  millstoneStone: "#8a8278",
  millstoneCenter: "#3a3631",
  millstoneBase: "#5e564c",
  // Fifteenth enhancement pass — a pair of Adirondack chairs with a slatted
  // side table on the back lawn, a tall cascading-flower urn on a fluted
  // pedestal as a south-lawn focal piece, a verdigris brass door knocker and
  // house number plaque on the front wall (both reuse the copper-patina
  // pair) and a southwest lavender-field scene extension (cultivated rows
  // of lavender bushes with purple blooms, straw bee skeps on a slate
  // platform, a stone watering trough and a weathered wooden flower cart).
  // The new `lavender-field` colour map is paired with a row-crest depth
  // map registered alongside it so the bloom rows read as relief at
  // glancing sun.
  adirondackCedar: "#a07452",
  adirondackCedarDark: "#6b4a2e",
  adirondackSeat: "#c08c5a",
  sideTableTop: "#8a5c34",
  lemonadeGlass: "#fdf7c4",
  lemonadeYellow: "#f3c440",
  cascadeUrnClay: "#bf7548",
  cascadeUrnClayDark: "#7c4423",
  cascadeUrnPedestal: "#d5c4a2",
  cascadeUrnPedestalDark: "#7e6f50",
  cascadeFoliage: "#5e8a3a",
  cascadeFoliageDark: "#3d5e26",
  cascadeBloomCoral: "#ef6a5a",
  cascadeBloomYellow: "#f3c34a",
  cascadeBloomWhite: "#fbf3e2",
  knockerPlate: "#4a4540",
  plaquePine: "#c8a06a",
  plaqueText: "#2a2622",
  lavenderGround: "#6c8049",
  lavenderGroundDark: "#4c603a",
  lavenderBush: "#5e8045",
  lavenderBushDark: "#3a5430",
  lavenderBloom: "#9166c4",
  lavenderBloomDark: "#5d3a92",
  lavenderBloomHi: "#b990dc",
  beeSkep: "#cfa367",
  beeSkepDark: "#8a6738",
  beeSkepEntry: "#3a2818",
  troughStoneAged: "#9c8d7a",
  troughStoneAgedDark: "#5e544a",
  troughInteriorWater: "#5b91a4",
  flowerCartWood: "#7c5536",
  flowerCartWoodDark: "#4a3220",
  flowerCartTrim: "#9b3a3a",
  flowerCartWheel: "#5e4030",
  // Sixteenth enhancement pass — a polished mirror-finish gazing ball on a
  // swirling iron stand and a small stone cherub statue holding a basket
  // of blooms on the courtyard lawn; a pair of climbing-rose trellises on
  // the east and west side walls; and a far-north alpine foothills scene
  // extension with a snow-dusted log cabin, a grove of conifers, snowdrifts,
  // mossy boulders and a small frozen tarn. The new `alpine-foothills`
  // colour map is paired with a snowdrift-and-scree depth map registered
  // alongside the other procedural textures so the drifts and rock heads
  // read as raised relief at glancing sun.
  gazingBallChrome: "#5f8aa8",
  gazingBallHi: "#bcd9e8",
  gazingBallBase: "#1f1c1a",
  cherubMarble: "#f4ead6",
  cherubMarbleShade: "#c4b8a0",
  cherubBasket: "#a85a2e",
  cherubBloomPink: "#ef89a8",
  cherubBloomCream: "#fdf6f0",
  trellisLattice: "#fbeed9",
  trellisLatticeShade: "#a8956e",
  trellisRose: "#ef6a85",
  trellisRoseDark: "#a8344f",
  trellisLeaf: "#5e8a3a",
  trellisLeafDark: "#3d5a28",
  alpineSnow: "#f4f5f7",
  alpineSnowShade: "#c4cdd6",
  alpineRock: "#7a7268",
  alpineRockDark: "#3f3a36",
  alpineMoss: "#5e6a3a",
  cabinLog: "#7c5536",
  cabinLogDark: "#4a3220",
  cabinRoof: "#3a2a1c",
  cabinWindow: "#ffd989",
  cabinSmoke: "#dad6cf",
  tarnIce: "#a8c8d6",
  tarnIceDeep: "#5e8aa6",
  // Seventeenth enhancement pass — a wrought-iron Victorian tea table
  // set with two ornate chairs and a three-tier pastry stand on the
  // back-east lawn, a pair of stone owl sentinel statues on slate
  // plinths flanking the cobble path entrance (owl bodies reuse the
  // existing `marble` colour + bump pair so the stone reads with
  // veined relief on the shoulders), a stained-glass arched fanlight
  // panel centred above the front door (new `stained-glass` colour
  // map paired with a leaded-muntin depth map so the lead cames read
  // as raised relief on the glass plane), and a northeast autumn maple
  // grove scene extension with an auburn ground (new `autumn-canopy`
  // colour map paired with a leaf-litter depth map so the leaf piles
  // and exposed soil patches read as raised relief at glancing sun), a
  // grove of five maple trees with crimson / amber / gold foliage
  // layers, a small wooden hunting lodge with a stone chimney, a pair
  // of moss-jacketed fallen logs and a small stacked-stone cairn.
  teaTableIron: "#1f1c1a",
  teaTableIronHi: "#3a3636",
  teaTableTop: "#2a2622",
  teaPorcelain: "#fbf3e2",
  teaPorcelainTrim: "#c6a25a",
  teaPastry: "#f0b774",
  teaPastryDark: "#a86c2c",
  teaCake: "#f4ddc1",
  owlMarble: "#e8dec8",
  owlMarbleShade: "#a8997e",
  owlEye: "#f3a83a",
  owlBeak: "#5e3f2c",
  fanlightLead: "#3a3a3a",
  fanlightAmber: "#f0b664",
  fanlightRose: "#ef89a8",
  fanlightTeal: "#3f7780",
  fanlightGold: "#f4c542",
  fanlightGlow: "#fff1c4",
  mapleGround: "#9a5b2c",
  mapleGroundDark: "#5e3618",
  mapleLeafLitter: "#c8702a",
  mapleSoil: "#4a2e1a",
  mapleTrunk: "#5e4530",
  mapleTrunkShade: "#3a2818",
  mapleCrimson: "#b03830",
  mapleCrimsonDark: "#7a2620",
  mapleAmber: "#dc7a26",
  mapleGold: "#e8b338",
  mapleFoliage: "#a8543a",
  lodgeWood: "#7c5238",
  lodgeWoodDark: "#4a3220",
  lodgeRoof: "#3a2818",
  lodgeChimney: "#7a6d5c",
  lodgeWindow: "#ffd989",
  cairnStone: "#8a8278",
  cairnStoneDark: "#5e564c",
  // Eighteenth enhancement pass — a bronze knight sentinel statue on a
  // fluted marble pedestal on the east lawn (the bronze armour reuses
  // the existing `copper-patina` colour + bump pair so the verdigris
  // mottling reads as crusted relief), a raised wooden cold frame
  // planted with three translucent glass cloche bell jars sheltering
  // seedlings on the back lawn, a pair of carved Victorian bargeboards
  // with pendant drop finials trimming the front and back gable rakes,
  // and a northwest waterfall ravine scene extension with a tall
  // granite cliff face (new `granite-cliff` colour map paired with a
  // fissure depth map so the bedding cracks and lichen patches read
  // as raised relief at glancing sun), a tumbling three-tier
  // waterfall cascading into a fern-fringed plunge pool, a wooden
  // plank footbridge across the outflow stream, three alpine pines
  // clinging to the rim of the cliff and a scatter of mossy boulders
  // ringing the pool.
  knightBronze: "#5d8a6a",
  knightBronzeShade: "#2f5840",
  knightBronzeHi: "#9bc4a8",
  knightPedestalCream: "#ede2cd",
  knightPedestalShade: "#a8997e",
  knightAccent: "#c6a25a",
  cloches: "#cfe6ec",
  clochesGlow: "#f4fdfe",
  clocheFrame: "#b89466",
  clocheFrameShade: "#6e5436",
  clocheSoil: "#3f2e1c",
  clocheSeedling: "#6ea84b",
  clocheSeedlingDark: "#3d6e2a",
  bargeboardWood: "#fbeed9",
  bargeboardShade: "#b6986a",
  bargeboardFinial: "#e89bb5",
  ravineGround: "#7a7268",
  ravineGroundDark: "#4a4540",
  ravineGrass: "#5e7a4a",
  ravineCliff: "#7a746a",
  ravineCliffShade: "#3f3a36",
  ravineLichen: "#a8b06a",
  waterfallBlue: "#a8c8d6",
  waterfallHi: "#f4fafd",
  waterfallMist: "#e0e8ed",
  plungePoolDeep: "#3a5e74",
  plungePoolSurface: "#7eb6cf",
  ravinePineFoliage: "#3a5a3a",
  ravinePineTrunk: "#5a3a26",
  ravineBoulderMoss: "#5e8a3a",
  bridgePlank: "#7a5238",
  bridgePlankDark: "#4a3220",
  bridgeRope: "#a87f5a",
  // Nineteenth enhancement pass — a Victorian cast-bronze cupid fountain
  // on the back-southwest lawn (cupid figure reuses the existing
  // copper-patina colour + bump pair so the verdigris mottling reads as
  // crusted relief on the wings and limbs; tiered marble basins reuse the
  // existing marble pair so the rim seams read as veined relief), a pair
  // of ornate cast-iron gable peak finials atop the front and back
  // bargeboards (copper-patina pair on the spire), and a southwest
  // sunflower field scene extension bridging the gap south of the wheat
  // field and west of the south heath. The new `sunflower-field` colour
  // map is paired with a row depth map registered alongside it so the
  // planting rows and seed clumps read as raised relief at glancing sun.
  cupidBronze: "#5d8a6a",
  cupidBronzeShade: "#2f5840",
  cupidBronzeHi: "#9bc4a8",
  cupidBasinCream: "#ede2d0",
  cupidBasinShade: "#a89776",
  cupidWater: "#7eb6cf",
  cupidWaterHi: "#dff0f7",
  cupidVase: "#c3674b",
  gableFinialSpire: "#5d8a6a",
  gableFinialBase: "#3a3636",
  gableFinialPennant: "#c2403a",
  sunflowerGround: "#9b7a3a",
  sunflowerGroundDark: "#6c5328",
  sunflowerLeaf: "#5e8a3a",
  sunflowerLeafDark: "#3a5e26",
  sunflowerStem: "#4a6a2c",
  sunflowerPetal: "#e8b338",
  sunflowerPetalHi: "#f4d35a",
  sunflowerCenter: "#5a3a1c",
  sunflowerCenterHi: "#8a5a2a",
  sunflowerStrawBale: "#d6b85a",
  sunflowerStrawBaleDark: "#a87f2c",
  sunflowerShedWood: "#7c5536",
  sunflowerShedTrim: "#dbc89b",
  sunflowerShedRoof: "#5c3f2c",
  sunflowerShedDoor: "#3a2218",
  sunflowerFenceStake: "#a8845a",
  sunflowerTwine: "#dbc89b",
  // Twentieth enhancement pass — a Victorian iron birdcage aviary on a
  // fluted marble plinth (the iron cage bars, hoops and finial reuse the
  // existing `copper-patina` colour + bump pair so the verdigris mottling
  // reads as crusted relief; the plinth reuses the existing `marble`
  // colour + bump pair so the stone reads with veined relief), a row of
  // ornate Victorian iron ridge cresting pickets along the main roof
  // ridge (copper-patina pair on the cast metal pickets and scrolls),
  // and a southeast citrus grove scene extension bridging the gap south
  // of the vineyard and east of the south heath. The new `citrus-grove`
  // colour map is paired with a pebble depth map registered alongside it
  // so the fallen-fruit dabs and pale pebbles read as raised relief at
  // glancing sun.
  aviaryIron: "#5d8a6a",
  aviaryIronShade: "#2f5840",
  aviaryIronHi: "#9bc4a8",
  aviaryPlinth: "#ede2d0",
  aviaryPlinthShade: "#a89776",
  aviaryPerch: "#7a5238",
  aviaryBird: "#e8b338",
  aviaryBirdWing: "#c4863a",
  aviaryBirdBeak: "#3a2218",
  ridgeCresting: "#5d8a6a",
  ridgeCrestingShade: "#2f5840",
  ridgeCrestingHi: "#9bc4a8",
  citrusGround: "#c08a52",
  citrusGroundDark: "#7a5328",
  citrusGroundPale: "#dbb37a",
  citrusLeaf: "#3e6a32",
  citrusLeafDark: "#244a1c",
  citrusLeafHi: "#6e9c4a",
  citrusTrunk: "#5a3a26",
  citrusLemon: "#f2d44a",
  citrusLemonHi: "#fce888",
  citrusOrange: "#e87b32",
  citrusOrangeHi: "#f6a356",
  citrusPressStone: "#cdb78c",
  citrusPressStoneDark: "#8a7250",
  citrusPressRoof: "#a8553a",
  citrusPressDoor: "#5a3a26",
  citrusCrateWood: "#a07346",
  citrusCrateBand: "#5a3a22",
  citrusGroveWall: "#a99275",
  citrusGroveWallShade: "#6c5a45",
  vineyardSoilApron: "#8a623a",
  // Twenty-first enhancement pass — a whimsical Victorian carousel horse on a
  // fluted marble pedestal (the pole, harness studs and tassel rings reuse the
  // existing `copper-patina` colour + bump pair and the plinth reuses the
  // existing `marble` colour + bump pair), a pair of decorative bay windows
  // projecting from the east and west side walls (white-painted trim sashes
  // around tinted glass panes capped by slim peaked shingle hoods), and a
  // far-east desert oasis scene extension beyond the olive grove. The new
  // `desert-sand` colour map is paired with a dune-and-pebble depth map so
  // the dune crests and scattered pebbles read as raised relief at glancing
  // sun.
  carouselBody: "#fff3e0",
  carouselBodyShade: "#d9c3a4",
  carouselMane: "#e89bb5",
  carouselManeDark: "#a8577a",
  carouselSaddle: "#c84d6e",
  carouselSaddleTrim: "#e6b34a",
  carouselHoof: "#3a2a22",
  carouselEye: "#1a1410",
  carouselPole: "#5d8a6a",
  carouselPoleHi: "#9bc4a8",
  carouselPlinth: "#ede2d0",
  carouselPlinthShade: "#a89776",
  bayWindowFrame: "#fdfbf4",
  bayWindowTrim: "#e89bb5",
  bayWindowSill: "#fff5ec",
  bayWindowGlass: "#bcd9e8",
  bayWindowRoof: "#c95f88",
  bayWindowFlowerBox: "#7a4a2e",
  bayWindowBloom: "#ef89a8",
  desertSand: "#dcb673",
  desertSandShade: "#a07a45",
  desertSandHi: "#f3d6a4",
  duneShadow: "#7a5a35",
  palmTrunk: "#8a623a",
  palmTrunkShade: "#5a3a26",
  palmFrond: "#5d8a48",
  palmFrondShade: "#3a5a30",
  palmFrondHi: "#8ab95a",
  dateClusters: "#3a2218",
  dateClustersHi: "#6e4422",
  adobeWall: "#b6864a",
  adobeWallShade: "#7a522a",
  adobeWallHi: "#d4a26a",
  adobeRoofBeam: "#5a3a22",
  adobeDoor: "#3a2218",
  adobeArchTrim: "#fff5e8",
  obeliskStone: "#c4b078",
  obeliskStoneShade: "#7a6a48",
  obeliskGlyph: "#3a2a18",
  camelBody: "#c69862",
  camelBodyShade: "#8a6840",
  camelSaddle: "#c84d3a",
  camelTassel: "#e6b34a",
  oliveGroveApron: "#a89668",
  // Twenty-second enhancement pass — a Victorian wrought-iron flagpole with a
  // striped pennant flag on a fluted marble base (the pole, halyard ring and
  // finial ball reuse the existing `copper-patina` colour + bump pair and the
  // plinth reuses the existing `marble` colour + bump pair), a pair of
  // copper-sunburst rosettes on the front and back gable faces above the
  // existing oculus windows (the rays and central boss reuse the existing
  // `copper-patina` pair and the central disc reuses the existing `marble`
  // pair), and a far-southwest peat-bog moor scene extension south of the
  // lavender field. The new `peat-moor` colour map is paired with a turf-cut
  // depth map so the peat-cut blocks and dark pools read as raised relief at
  // glancing sun.
  flagpolePlinth: "#ede2d0",
  flagpolePlinthShade: "#a89776",
  flagpoleRope: "#cbb487",
  flagFieldCream: "#fdf4e2",
  flagFieldRose: "#ef89a8",
  flagFieldShade: "#a8577a",
  sunburstDisc: "#ede2d0",
  sunburstDiscShade: "#a89776",
  peatGround: "#5a6234",
  peatGroundShade: "#3a4220",
  peatBog: "#2a2418",
  peatStack: "#4a3a22",
  peatStackHi: "#7a5a32",
  peatStackSlate: "#6a655a",
  burnWater: "#5a8aa8",
  burnWaterShade: "#345a78",
  thatchStraw: "#b89860",
  thatchStrawShade: "#7a5a2c",
  crofterStone: "#9d9286",
  crofterStoneDark: "#6a635a",
  crofterDoor: "#3a2218",
  crofterChimney: "#8a8076",
  crofterGlow: "#ffd58a",
  heatherTuftRose: "#a35aa6",
  heatherTuftPink: "#d68ac8",
  heatherTuftWhite: "#f4eada",
  mossyBoulder: "#7a7a6a",
  mossyBoulderShade: "#4a4838",
  mossPatch: "#5a7a3a",
  lavenderApron: "#5a6a35",
  wheatStubbleApron: "#a08a4a",
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

/* ─────────────── eleventh-pass courtyard props ─────────────── */

/**
 * A wood-fired stone pizza oven — a brick base with a small firebox slot,
 * topped by a domed terracotta cooking chamber and a short brick chimney
 * trailing wisps of smoke. A small split-wood pile leans against the
 * base, and an iron tool rests against the firebox opening. Sized to
 * sit against the east lawn near the grape arbor.
 */
function buildPizzaOven(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const brick = std(C.ovenBrick, 0.85, { texture: "brick", textureScale: [2, 1.4], flatShading: true });
  const brickDark = std(C.ovenBrickDark, 0.9, { texture: "brick", textureScale: [1.4, 1], flatShading: true });
  const mortar = std(C.ovenMortar, 0.95, { flatShading: true });
  const dome = std(C.ovenDome, 0.7, { flatShading: true });
  const iron = std(C.ovenIron, 0.55, { metalness: 0.55, flatShading: true });
  const ember: MaterialDef = {
    color: C.ovenEmber,
    roughness: 0.55,
    emissive: "#c84a18",
  };
  const wood = std(C.logFlesh, 0.85, { texture: "wood", flatShading: true });
  const baseW = 1.6;
  const baseD = 1.4;
  const baseH = 1.05;
  const domeR = 0.72;
  const parts: SceneNode[] = [];
  // Solid stone hearth slab the oven sits on.
  parts.push(
    f.mesh("Oven Hearth Slab", box(baseW + 0.4, 0.1, baseD + 0.4), mortar, {
      position: [0, 0.05, 0],
    }, { receiveShadow: true }),
  );
  // Brick base — four short walls leaving a small recessed log alcove at the front.
  parts.push(
    f.mesh("Base Back", box(baseW, baseH, 0.18), brick, {
      position: [0, 0.1 + baseH / 2, -baseD / 2 + 0.09],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Base Front L", box(0.5, baseH, 0.18), brick, {
      position: [-(baseW / 2 - 0.25), 0.1 + baseH / 2, baseD / 2 - 0.09],
    }, { castShadow: true }),
    f.mesh("Base Front R", box(0.5, baseH, 0.18), brick, {
      position: [(baseW / 2 - 0.25), 0.1 + baseH / 2, baseD / 2 - 0.09],
    }, { castShadow: true }),
    f.mesh("Base Side L", box(0.18, baseH, baseD - 0.18), brick, {
      position: [-baseW / 2 + 0.09, 0.1 + baseH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Base Side R", box(0.18, baseH, baseD - 0.18), brick, {
      position: [baseW / 2 - 0.09, 0.1 + baseH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Cap slab between base and dome — the cooking floor.
  parts.push(
    f.mesh("Cooking Floor", box(baseW + 0.06, 0.1, baseD + 0.06), mortar, {
      position: [0, 0.1 + baseH + 0.05, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Dome — half sphere capping the oven.
  parts.push(
    f.mesh("Oven Dome", sphere(domeR, 14, 8), dome, {
      position: [0, 0.1 + baseH + 0.1, 0],
      scale: [1, 0.85, 1.05],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Dome ring trim where it meets the cooking floor.
  parts.push(
    f.mesh("Dome Ring", cylinder(domeR + 0.04, domeR + 0.04, 0.05, 18), brickDark, {
      position: [0, 0.1 + baseH + 0.1, 0],
    }, { castShadow: true }),
  );
  // Mouth arch — a darker recessed slot on the front of the dome with a
  // glowing ember disc inside, suggesting a live fire.
  parts.push(
    f.mesh("Oven Mouth", box(0.46, 0.34, 0.16), brickDark, {
      position: [0, 0.1 + baseH + 0.22, domeR - 0.02],
    }, { castShadow: true }),
    f.mesh("Mouth Inset", box(0.36, 0.26, 0.06), {
      color: "#1a0d05",
      roughness: 0.95,
    }, {
      position: [0, 0.1 + baseH + 0.22, domeR + 0.04],
    }),
    f.mesh("Oven Ember Glow", box(0.28, 0.06, 0.04), ember, {
      position: [0, 0.1 + baseH + 0.13, domeR + 0.06],
    }),
  );
  // Chimney — a short brick stack with a clay cap, set toward the back of the dome.
  parts.push(
    f.mesh("Chimney Stack", box(0.28, 0.6, 0.28), brick, {
      position: [0, 0.1 + baseH + domeR * 0.85 + 0.3, -domeR * 0.4],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Chimney Cap", box(0.36, 0.06, 0.36), brickDark, {
      position: [0, 0.1 + baseH + domeR * 0.85 + 0.63, -domeR * 0.4],
    }, { castShadow: true }),
    // A small wisp of smoke rising — implemented as two stacked translucent
    // light-grey blobs so it reads as drifting steam rather than solid mass.
    f.mesh("Smoke Wisp Low", sphere(0.22, 10, 7), {
      color: "#e0d8d0",
      roughness: 0.95,
      transparent: true,
      opacity: 0.42,
    }, {
      position: [0.05, 0.1 + baseH + domeR * 0.85 + 0.95, -domeR * 0.4 + 0.04],
      scale: [1, 0.7, 1],
    }),
    f.mesh("Smoke Wisp High", sphere(0.32, 10, 7), {
      color: "#eee6dd",
      roughness: 0.95,
      transparent: true,
      opacity: 0.3,
    }, {
      position: [0.18, 0.1 + baseH + domeR * 0.85 + 1.35, -domeR * 0.4 + 0.12],
      scale: [1.2, 0.6, 1.2],
    }),
  );
  // Stack of split firewood inside the alcove — five short logs end-on.
  for (let i = 0; i < 5; i++) {
    const lx = -0.18 + (i % 3) * 0.18;
    const ly = 0.18 + Math.floor(i / 3) * 0.14;
    parts.push(
      f.mesh(`Hearth Log ${i + 1}`, cylinder(0.07, 0.07, 0.16, 8), wood, {
        position: [lx, ly, baseD / 2 - 0.06],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true }),
    );
  }
  // A long iron peel (pizza paddle) leaning against the front face.
  parts.push(
    f.mesh("Peel Handle", cylinder(0.02, 0.02, 1.05, 6), std(C.toolHandle, 0.8, { texture: "wood" }), {
      position: [baseW / 2 - 0.12, 0.7, baseD / 2 + 0.18],
      rotation: [0.35, 0, 0.18],
    }, { castShadow: true }),
    f.mesh("Peel Paddle", box(0.22, 0.02, 0.3), iron, {
      position: [baseW / 2 - 0.04, 0.12, baseD / 2 + 0.4],
      rotation: [0, 0, 0],
    }, { castShadow: true }),
  );
  return f.group("Pizza Oven", parts, { position: pos, rotation: [0, -Math.PI / 6, 0] });
}

/**
 * A timber potting bench — a slatted-top work table on four legs with a
 * lower storage shelf, a row of small terracotta pots lined up along the
 * top, a leaning trowel and a sprig of fresh herbs in one of the pots.
 * Sits along the back yard, perpendicular to the picnic table.
 */
function buildPottingBench(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const woodLight = std(C.pottingPine, 0.85, { texture: "wood", flatShading: true });
  const woodDark = std(C.pottingPineDark, 0.85, { texture: "wood", flatShading: true });
  const pot = std(C.clayPot, 0.85, { flatShading: true });
  const potShade = std(C.clayPotShade, 0.9, { flatShading: true });
  const soil = std(C.soil, 0.95, { flatShading: true });
  const herb = std(C.pottingMint, 0.85, { flatShading: true });
  const metal = std(C.toolMetalDark, 0.6, { metalness: 0.5 });
  const benchW = 1.6;
  const benchD = 0.55;
  const benchH = 0.85;
  const parts: SceneNode[] = [];
  // Four legs.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        f.mesh("Bench Leg", box(0.07, benchH, 0.07), woodDark, {
          position: [sx * (benchW / 2 - 0.05), benchH / 2, sz * (benchD / 2 - 0.05)],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
  }
  // Lower storage shelf.
  parts.push(
    f.mesh("Lower Shelf", box(benchW - 0.08, 0.04, benchD - 0.04), woodDark, {
      position: [0, 0.22, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Slatted top — five slats with thin gaps between them.
  const slatN = 5;
  const slatW = (benchD - 0.06) / slatN;
  for (let i = 0; i < slatN; i++) {
    parts.push(
      f.mesh(`Top Slat ${i + 1}`, box(benchW, 0.04, slatW - 0.01), woodLight, {
        position: [0, benchH + 0.02, -benchD / 2 + 0.03 + slatW * (i + 0.5)],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Back splash board — a low backboard along the back edge.
  parts.push(
    f.mesh("Back Splash", box(benchW, 0.32, 0.04), woodLight, {
      position: [0, benchH + 0.18, -benchD / 2 + 0.02],
    }, { castShadow: true, receiveShadow: true }),
  );
  // A row of three terracotta pots on the top.
  function buildPot(x: number, withHerb: boolean): SceneNode {
    const pots: SceneNode[] = [
      f.mesh("Pot Body", cylinder(0.13, 0.1, 0.22, 12), pot, {
        position: [0, 0.11, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Pot Rim", cylinder(0.135, 0.135, 0.03, 12), potShade, {
        position: [0, 0.225, 0],
      }, { castShadow: true }),
      f.mesh("Pot Soil", cylinder(0.115, 0.115, 0.03, 12), soil, {
        position: [0, 0.21, 0],
      }),
    ];
    if (withHerb) {
      pots.push(
        f.mesh("Herb Cluster", sphere(0.14, 10, 7), herb, {
          position: [0, 0.34, 0],
          scale: [1, 0.7, 1],
        }, { castShadow: true }),
      );
    }
    return f.group("Pot", pots, { position: [x, benchH + 0.04, 0.04] });
  }
  parts.push(
    buildPot(-0.55, false),
    buildPot(-0.18, true),
    buildPot(0.22, false),
  );
  // A stack of two empty pots tipped on their side at the far right.
  parts.push(
    f.mesh("Tipped Pot Body", cylinder(0.13, 0.1, 0.22, 12), pot, {
      position: [benchW / 2 - 0.14, benchH + 0.14, 0.05],
      rotation: [Math.PI / 2.2, 0, 0],
    }, { castShadow: true }),
    f.mesh("Tipped Pot Rim", cylinder(0.135, 0.135, 0.03, 12), potShade, {
      position: [benchW / 2 - 0.14, benchH + 0.05, 0.18],
      rotation: [Math.PI / 2.2, 0, 0],
    }, { castShadow: true }),
  );
  // A leaning trowel against the right side of the bench.
  parts.push(
    f.mesh("Trowel Handle", cylinder(0.022, 0.022, 0.38, 6), std(C.toolHandle, 0.8, { texture: "wood" }), {
      position: [benchW / 2 + 0.08, 0.5, benchD / 2 - 0.08],
      rotation: [0, 0, -0.22],
    }, { castShadow: true }),
    f.mesh("Trowel Blade", box(0.08, 0.02, 0.16), metal, {
      position: [benchW / 2 + 0.18, 0.22, benchD / 2 - 0.08],
      rotation: [-0.3, 0, -0.22],
    }, { castShadow: true }),
  );
  // A small spill of loose soil on the shelf.
  parts.push(
    f.mesh("Shelf Soil Pile", sphere(0.14, 10, 6), soil, {
      position: [0.2, 0.26, 0.04],
      scale: [1.3, 0.4, 0.9],
    }),
  );
  return f.group("Potting Bench", parts, { position: pos, rotation: [0, Math.PI / 8, 0] });
}

/**
 * A stone garden chess set — a square marble-checkered slab on a fluted
 * column pedestal, ringed by two stone stools, with a quorum of carved
 * pieces (kings, queens, knights, pawns) arranged mid-game on the board.
 * The board uses the marble texture's bump map so the chequer lines read
 * as a relief seam between the squares.
 */
function buildGardenChess(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.stone, 0.92, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.bridgeStoneDark, 0.92, { flatShading: true });
  const marble: MaterialDef = {
    color: C.marbleCream,
    roughness: 0.55,
    texture: "marble",
    textureScale: [1, 1],
    bumpMap: "marble-bump",
    bumpScale: 0.04,
  };
  const cream = std(C.chessPieceCream, 0.55, { flatShading: true });
  const onyx = std(C.chessPieceOnyx, 0.45, { flatShading: true });
  const dark = std(C.chessSlabDark, 0.6, { flatShading: true });
  const tableSize = 0.95;
  const tableH = 0.78;
  const parts: SceneNode[] = [
    // Pedestal — a short fluted column, base disc and capital plate.
    f.mesh("Pedestal Base", cylinder(0.34, 0.4, 0.1, 14), stone, {
      position: [0, 0.05, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Pedestal Shaft", cylinder(0.22, 0.24, tableH - 0.2, 14), stone, {
      position: [0, (tableH - 0.2) / 2 + 0.1, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Pedestal Cap", cylinder(0.34, 0.32, 0.08, 14), stone, {
      position: [0, tableH - 0.04, 0],
    }, { castShadow: true }),
    // The board slab — marble top.
    f.mesh("Board Slab", box(tableSize, 0.08, tableSize), marble, {
      position: [0, tableH + 0.04, 0],
    }, { castShadow: true, receiveShadow: true }),
  ];
  // Render the 8x8 chequer pattern as alternating dark squares (the
  // marble slab itself is the light squares). Each dark square sits a
  // hair above the slab so it catches the sun.
  const cells = 8;
  const cellSize = (tableSize - 0.04) / cells;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if ((r + c) % 2 !== 0) continue;
      parts.push(
        f.mesh(`Sq ${r}-${c}`, box(cellSize, 0.012, cellSize), dark, {
          position: [
            -tableSize / 2 + 0.02 + cellSize * (c + 0.5),
            tableH + 0.087,
            -tableSize / 2 + 0.02 + cellSize * (r + 0.5),
          ],
        }, { receiveShadow: true }),
      );
    }
  }
  // A small selection of pieces mid-game — kings, queens, knights and pawns.
  function piecePawn(x: number, z: number, isCream: boolean): SceneNode {
    const mat = isCream ? cream : onyx;
    return f.group("Pawn", [
      f.mesh("Pawn Base", cylinder(0.04, 0.05, 0.025, 8), mat, { position: [0, 0.0125, 0] }, { castShadow: true }),
      f.mesh("Pawn Body", cylinder(0.025, 0.04, 0.075, 8), mat, { position: [0, 0.06, 0] }, { castShadow: true }),
      f.mesh("Pawn Head", sphere(0.034, 10, 7), mat, { position: [0, 0.12, 0] }, { castShadow: true }),
    ], { position: [x, tableH + 0.094, z] });
  }
  function pieceKing(x: number, z: number, isCream: boolean): SceneNode {
    const mat = isCream ? cream : onyx;
    return f.group("King", [
      f.mesh("King Base", cylinder(0.05, 0.06, 0.03, 8), mat, { position: [0, 0.015, 0] }, { castShadow: true }),
      f.mesh("King Shaft", cylinder(0.03, 0.045, 0.14, 8), mat, { position: [0, 0.1, 0] }, { castShadow: true }),
      f.mesh("King Head", sphere(0.04, 10, 7), mat, { position: [0, 0.19, 0] }, { castShadow: true }),
      f.mesh("Cross V", box(0.012, 0.06, 0.012), mat, { position: [0, 0.255, 0] }, { castShadow: true }),
      f.mesh("Cross H", box(0.04, 0.012, 0.012), mat, { position: [0, 0.255, 0] }, { castShadow: true }),
    ], { position: [x, tableH + 0.094, z] });
  }
  function pieceKnight(x: number, z: number, isCream: boolean, faceX = 1): SceneNode {
    const mat = isCream ? cream : onyx;
    return f.group("Knight", [
      f.mesh("Knight Base", cylinder(0.05, 0.06, 0.03, 8), mat, { position: [0, 0.015, 0] }, { castShadow: true }),
      f.mesh("Knight Body", cylinder(0.03, 0.045, 0.1, 8), mat, { position: [0, 0.08, 0] }, { castShadow: true }),
      // A stylised horse head — a slanted box pointing along faceX.
      f.mesh("Knight Head", box(0.05, 0.07, 0.08), mat, {
        position: [faceX * 0.025, 0.175, 0],
        rotation: [0, 0, -faceX * 0.35],
      }, { castShadow: true }),
      f.mesh("Knight Ear", box(0.018, 0.03, 0.018), mat, {
        position: [faceX * 0.005, 0.225, 0.03],
        rotation: [0, 0, -faceX * 0.35],
      }, { castShadow: true }),
    ], { position: [x, tableH + 0.094, z] });
  }
  function pieceQueen(x: number, z: number, isCream: boolean): SceneNode {
    const mat = isCream ? cream : onyx;
    return f.group("Queen", [
      f.mesh("Queen Base", cylinder(0.05, 0.06, 0.03, 8), mat, { position: [0, 0.015, 0] }, { castShadow: true }),
      f.mesh("Queen Body", cylinder(0.028, 0.045, 0.13, 8), mat, { position: [0, 0.095, 0] }, { castShadow: true }),
      f.mesh("Queen Crown", cylinder(0.04, 0.034, 0.04, 10), mat, { position: [0, 0.18, 0] }, { castShadow: true }),
      f.mesh("Queen Pearl", sphere(0.022, 10, 7), mat, { position: [0, 0.22, 0] }, { castShadow: true }),
    ], { position: [x, tableH + 0.094, z] });
  }
  // Helper to convert a board cell (0..7,0..7) to (x,z).
  function cellToXZ(cx: number, cz: number): [number, number] {
    return [
      -tableSize / 2 + 0.02 + cellSize * (cx + 0.5),
      -tableSize / 2 + 0.02 + cellSize * (cz + 0.5),
    ];
  }
  const c1 = cellToXZ(2, 6); parts.push(piecePawn(c1[0], c1[1], true));
  const c2 = cellToXZ(3, 6); parts.push(piecePawn(c2[0], c2[1], true));
  const c3 = cellToXZ(4, 4); parts.push(pieceKnight(c3[0], c3[1], true, 1));
  const c4 = cellToXZ(0, 5); parts.push(pieceKing(c4[0], c4[1], true));
  const c5 = cellToXZ(2, 5); parts.push(pieceQueen(c5[0], c5[1], true));
  const c6 = cellToXZ(5, 1); parts.push(piecePawn(c6[0], c6[1], false));
  const c7 = cellToXZ(4, 1); parts.push(piecePawn(c7[0], c7[1], false));
  const c8 = cellToXZ(3, 3); parts.push(pieceKnight(c8[0], c8[1], false, -1));
  const c9 = cellToXZ(7, 2); parts.push(pieceKing(c9[0], c9[1], false));
  const c10 = cellToXZ(5, 2); parts.push(pieceQueen(c10[0], c10[1], false));
  // A captured cream pawn lying on its side at one edge of the board.
  parts.push(
    f.mesh("Captured Pawn", cylinder(0.025, 0.04, 0.075, 8), cream, {
      position: [tableSize / 2 + 0.05, tableH + 0.11, 0.2],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  );
  // Two short stone stools flanking the table.
  for (const side of [-1, 1] as const) {
    parts.push(
      f.group("Garden Stool", [
        f.mesh("Stool Top", cylinder(0.22, 0.22, 0.07, 14), stoneDark, {
          position: [0, 0.34, 0],
        }, { castShadow: true, receiveShadow: true }),
        f.mesh("Stool Shaft", cylinder(0.14, 0.18, 0.3, 12), stone, {
          position: [0, 0.18, 0],
        }, { castShadow: true, receiveShadow: true }),
      ], { position: [side * 0.85, 0, 0] }),
    );
  }
  return f.group("Garden Chess", parts, { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/**
 * A wisteria-bloom drape across the porch canopy — three cascading panels
 * of soft purple racemes spilling over the canopy ridge, each panel
 * surfaced with the `wisteria-bloom` colour map paired with a depth map
 * so the cells of the bloom clusters read as relief instead of a flat
 * tile. A leafy vine runs along the canopy ridge as the anchor strand,
 * and three darker pendant teardrops hang lower than the panels to
 * emphasise the cascade.
 */
function buildPorchWisteria(f: NodeFactory): SceneNode {
  const canopyZ = FRONT_Z + 0.45;
  const ridgeY = 2.95;
  const canopyW = 2.7;
  const bloomMat: MaterialDef = {
    color: C.wisteriaPurple,
    roughness: 0.7,
    texture: "wisteria-bloom",
    textureScale: [1.4, 1.6],
    bumpMap: "wisteria-bloom-bump",
    bumpScale: 0.06,
    flatShading: false,
  };
  const bloomDeep = std(C.wisteriaPurpleDark, 0.75, { flatShading: true });
  const leaf = std(C.wisteriaLeaf, 0.85, { flatShading: true });
  const vine = std(C.wisteriaVine, 0.9, { texture: "bark", flatShading: true });
  const parts: SceneNode[] = [];
  // Anchor vine running along the canopy ridge.
  parts.push(
    f.mesh("Wisteria Vine", cylinder(0.04, 0.04, canopyW * 1.05, 8), vine, {
      position: [0, ridgeY + 0.08, canopyZ],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
  );
  // Three cascading bloom panels — one centred and two flanking.
  const panelW = 0.78;
  const panelH = 1.05;
  const panelOffsets: [number, number][] = [
    [-0.95, 0.04],
    [0.05, -0.02],
    [0.95, 0.04],
  ];
  panelOffsets.forEach(([x, zOff], idx) => {
    parts.push(
      f.mesh(`Bloom Panel ${idx + 1}`, plane(panelW, panelH), bloomMat, {
        position: [x, ridgeY - panelH / 2 + 0.04, canopyZ + 0.5 + zOff],
        rotation: [-0.18, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
    // A back-side panel facing the porch so the drape reads from both directions.
    parts.push(
      f.mesh(`Bloom Panel Back ${idx + 1}`, plane(panelW * 0.82, panelH * 0.9), bloomMat, {
        position: [x, ridgeY - panelH / 2 + 0.06, canopyZ - 0.45 + zOff * 0.5],
        rotation: [0.18, Math.PI, 0],
      }, { castShadow: true }),
    );
  });
  // Leafy vine drape — green spheres flattened to read as leaf clusters.
  const rng = mulberry32(0xb100ed);
  for (let i = 0; i < 16; i++) {
    const x = -canopyW / 2 + (canopyW + 0.2) * (i / 15) + (rng() - 0.5) * 0.1;
    const yOff = -0.04 + rng() * 0.16;
    const zOff = (rng() - 0.5) * 0.5;
    parts.push(
      f.mesh("Wisteria Leaf Cluster", sphere(0.16, 8, 6), leaf, {
        position: [x, ridgeY + yOff, canopyZ + 0.4 + zOff],
        scale: [1, 0.45, 0.95],
        rotation: [0, rng() * Math.PI, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Three darker pendant teardrops dangling lower than the panels.
  for (let i = 0; i < 3; i++) {
    const x = -0.95 + i * 0.95;
    parts.push(
      f.mesh(`Pendant ${i + 1}`, sphere(0.16, 10, 8), bloomDeep, {
        position: [x, ridgeY - 1.25, canopyZ + 0.62],
        scale: [0.6, 1.6, 0.6],
      }, { castShadow: true }),
    );
  }
  return f.group("Porch Wisteria", parts);
}

/* ─────────────── eleventh-pass SW wheat-field extension ─────────────── */

/**
 * A southwest wheat field — a golden cropland plane bridging the gap
 * between the west pond garden's south edge and the south heath's west
 * edge. The plane overlaps each neighbour by ~1.5 units so the ground
 * layer has no holes along the joins. Carries a Dutch-style four-sail
 * windmill, scattered wheat sheaves and stooks, a winding cart trail
 * extending the heath dirt path into the field and a low perimeter
 * stake-and-twine fence along the field's south edge.
 */
function buildSouthwestWheatField(f: NodeFactory): SceneNode {
  return f.group("Southwest Wheat Field", [
    // Main wheat ground plane — golden grain with paired bump map so
    // the wind rows catch glancing light.
    f.mesh(
      "Wheat Field Ground",
      plane(WHEAT_FIELD_W, WHEAT_FIELD_D),
      {
        color: C.wheatGold,
        roughness: 0.95,
        texture: "wheat-field",
        textureScale: [6, 4],
        bumpMap: "wheat-field-bump",
        bumpScale: 0.05,
      },
      { position: WHEAT_FIELD_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // North apron — overlaps the south heath west edge with a paler
    // stubble strip so the join reads as a harvested fringe.
    f.mesh(
      "Wheat North Apron",
      plane(WHEAT_FIELD_W, 2.5),
      std(C.wheatStubble, 0.95, { texture: "grass", textureScale: [8, 1] }),
      {
        position: [
          WHEAT_FIELD_POS[0],
          -0.006,
          WHEAT_FIELD_POS[2] - WHEAT_FIELD_D / 2 + 1.25,
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // South apron — overlaps the west pond garden's south edge with a
    // greener strip so the seam to the pond garden grass reads as one.
    f.mesh(
      "Wheat South Apron",
      plane(WHEAT_FIELD_W, 2.5),
      std(C.pondGardenGrass, 0.95, { texture: "grass", textureScale: [8, 1] }),
      {
        position: [
          WHEAT_FIELD_POS[0],
          -0.006,
          WHEAT_FIELD_POS[2] + WHEAT_FIELD_D / 2 - 1.25,
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildFarmWindmill(f, WINDMILL_POS),
    buildWheatSheaves(f),
    buildWheatFieldTrail(f),
    buildWheatFieldFence(f),
  ]);
}

/**
 * A Dutch-style four-sail tower windmill — a tapered round tower
 * topped by a small red cap with a cross of four lattice sails, each
 * sail a slatted rectangle on a wooden frame. The windmill sits at the
 * field's north edge so its silhouette reads against the heath behind.
 */
function buildFarmWindmill(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const tower = std(C.windmillTower, 0.85, { texture: "brick", textureScale: [1.5, 2], flatShading: true });
  const towerDark = std(C.cartDirtDark, 0.92, { flatShading: true });
  const cap = std(C.windmillCap, 0.8, { texture: "shingle", textureScale: [2, 1] });
  const frame = std(C.windmillSailFrame, 0.8, { texture: "wood", flatShading: true });
  const sail = std(C.windmillSail, 0.85, { flatShading: true });
  const door = std(C.stableDoor, 0.7, { texture: "wood" });
  const towerH = 3.6;
  const baseR = 0.85;
  const topR = 0.55;
  const parts: SceneNode[] = [
    // Stone footing.
    f.mesh("Mill Footing", cylinder(baseR + 0.1, baseR + 0.15, 0.15, 16), towerDark, {
      position: [0, 0.075, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Tower — a tapered cylinder.
    f.mesh("Mill Tower", cylinder(topR, baseR, towerH, 18), tower, {
      position: [0, towerH / 2 + 0.15, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Cap (the roof). A flattened cone for a domed pitch.
    f.mesh("Mill Cap", cone(topR + 0.12, 0.7, 18), cap, {
      position: [0, towerH + 0.5, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Cap finial.
    f.mesh("Cap Finial", cylinder(0.05, 0.05, 0.4, 8), frame, {
      position: [0, towerH + 1.0, 0],
    }, { castShadow: true }),
    // Door at the base on the south face.
    f.mesh("Mill Door", box(0.38, 0.7, 0.05), door, {
      position: [0, 0.5, baseR + 0.02],
    }, { castShadow: true }),
    f.mesh("Mill Door Frame", box(0.46, 0.78, 0.06), frame, {
      position: [0, 0.5, baseR + 0.005],
    }, { castShadow: true }),
    // Two small windows — short slits on the tower's east and west faces.
    f.mesh("Mill Window E", box(0.08, 0.22, 0.16), {
      color: "#a8c4d8",
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.6,
    }, {
      position: [baseR - 0.04, 1.7, 0],
    }),
    f.mesh("Mill Window W", box(0.08, 0.22, 0.16), {
      color: "#a8c4d8",
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.6,
    }, {
      position: [-baseR + 0.04, 1.7, 0],
    }),
  ];
  // Sail assembly — a hub block plus four crossed sails, oriented so the
  // axle runs along the +Z direction (windmill faces south).
  const hubY = towerH + 0.05;
  const hubZ = topR + 0.18;
  parts.push(
    // Hub block.
    f.mesh("Sail Hub", cylinder(0.16, 0.16, 0.34, 12), frame, {
      position: [0, hubY, hubZ],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  );
  // Four sails arranged in an X pattern around the hub. Each sail is a
  // long thin slatted rectangle on a wooden spar, with the lattice
  // suggested by a few diagonal slats. We use a slight tilt off vertical
  // so the assembly reads as caught mid-rotation instead of perfectly
  // square.
  const sailL = 1.7;
  const sailW = 0.42;
  const tiltZ = 0.18; // small twist so the cross is not a perfect plus sign.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + tiltZ;
    // Spar — runs from hub outward.
    parts.push(
      f.mesh(`Sail Spar ${i + 1}`, box(0.06, sailL, 0.06), frame, {
        position: [
          Math.sin(a) * (sailL / 2 + 0.16),
          hubY + Math.cos(a) * (sailL / 2 + 0.16),
          hubZ + 0.18,
        ],
        rotation: [0, 0, -a],
      }, { castShadow: true }),
    );
    // Sail panel — a thin canvas rectangle offset to one side of the spar.
    parts.push(
      f.mesh(`Sail Canvas ${i + 1}`, box(sailW, sailL * 0.9, 0.02), sail, {
        position: [
          Math.sin(a) * (sailL / 2 + 0.16) + Math.cos(a) * (sailW / 2 + 0.04),
          hubY + Math.cos(a) * (sailL / 2 + 0.16) - Math.sin(a) * (sailW / 2 + 0.04),
          hubZ + 0.22,
        ],
        rotation: [0, 0, -a],
      }, { castShadow: true, receiveShadow: true }),
    );
    // Three lattice slats per sail.
    for (let s = 0; s < 3; s++) {
      const t = -0.32 + s * 0.32;
      parts.push(
        f.mesh(`Sail Slat ${i + 1}-${s + 1}`, box(sailW + 0.04, 0.025, 0.02), frame, {
          position: [
            Math.sin(a) * (sailL / 2 + 0.16) + Math.cos(a) * (sailW / 2 + 0.04) + Math.sin(a) * t,
            hubY + Math.cos(a) * (sailL / 2 + 0.16) - Math.sin(a) * (sailW / 2 + 0.04) + Math.cos(a) * t,
            hubZ + 0.235,
          ],
          rotation: [0, 0, -a],
        }, { castShadow: true }),
      );
    }
  }
  return f.group("Farm Windmill", parts, { position: pos, rotation: [0, Math.PI / 6, 0] });
}

/**
 * Scattered wheat sheaves on the field — small cones of wheat with thin
 * stem ribs, instanced for cheap rendering. A few are arranged as stooks
 * (three or four sheaves leaning together) for visual variety.
 */
function buildWheatSheaves(f: NodeFactory): SceneNode {
  const sheafMat = std(C.wheatGold, 0.95, { flatShading: true });
  const huskMat = std(C.wheatHusk, 0.92, { flatShading: true });
  const rng = mulberry32(0x1eaf12);
  const xMin = WHEAT_FIELD_POS[0] - WHEAT_FIELD_W / 2 + 2;
  const xMax = WHEAT_FIELD_POS[0] + WHEAT_FIELD_W / 2 - 2;
  const zMin = WHEAT_FIELD_POS[2] - WHEAT_FIELD_D / 2 + 2.5;
  const zMax = WHEAT_FIELD_POS[2] + WHEAT_FIELD_D / 2 - 2.5;
  const sheaves: SceneNode[] = [];
  const standalone: Transform[] = [];
  const husks: Transform[] = [];
  // A few clustered stooks of three sheaves apiece.
  for (let stook = 0; stook < 4; stook++) {
    let cx = 0, cz = 0, ok = false;
    for (let attempt = 0; attempt < 30 && !ok; attempt++) {
      cx = xMin + rng() * (xMax - xMin);
      cz = zMin + rng() * (zMax - zMin);
      if (Math.hypot(cx - WINDMILL_POS[0], cz - WINDMILL_POS[2]) < 2.2) continue;
      // Avoid the cart trail corridor (north-south stripe near the windmill).
      if (Math.abs(cx - (WINDMILL_POS[0] + 1.5)) < 1.2) continue;
      ok = true;
    }
    if (!ok) continue;
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2;
      standalone.push({
        position: [cx + Math.cos(a) * 0.18, 0.32, cz + Math.sin(a) * 0.18],
        rotation: [Math.cos(a) * 0.25, rng() * Math.PI, Math.sin(a) * 0.25],
        scale: [1, 1, 1],
      });
      husks.push({
        position: [cx + Math.cos(a) * 0.18, 0.55, cz + Math.sin(a) * 0.18],
        rotation: [Math.cos(a) * 0.25, rng() * Math.PI, Math.sin(a) * 0.25],
        scale: [1, 1, 1],
      });
    }
  }
  // Lone scattered sheaves elsewhere in the field.
  let attempts = 0;
  while (standalone.length < 30 && attempts < 240) {
    attempts++;
    const x = xMin + rng() * (xMax - xMin);
    const z = zMin + rng() * (zMax - zMin);
    if (Math.hypot(x - WINDMILL_POS[0], z - WINDMILL_POS[2]) < 1.8) continue;
    if (Math.abs(x - (WINDMILL_POS[0] + 1.5)) < 1.0) continue;
    standalone.push({
      position: [x, 0.32, z],
      rotation: [0, rng() * Math.PI, 0],
      scale: [1, 1, 1],
    });
    husks.push({
      position: [x, 0.55, z],
      rotation: [0, rng() * Math.PI, 0],
      scale: [1, 1, 1],
    });
  }
  sheaves.push(
    f.instanced(
      "Wheat Sheaf Body",
      cylinder(0.08, 0.16, 0.42, 8),
      sheafMat,
      standalone,
      { castShadow: true, receiveShadow: true },
    ),
    f.instanced(
      "Wheat Sheaf Husk",
      cone(0.14, 0.22, 8),
      huskMat,
      husks,
      { castShadow: true },
    ),
  );
  return f.group("Wheat Sheaves", sheaves);
}

/**
 * A meandering cart trail across the wheat field — a series of slightly
 * overlapping dirt-coloured planes shaped into a soft S-curve from the
 * field's south edge up toward the windmill.
 */
function buildWheatFieldTrail(f: NodeFactory): SceneNode {
  const dirt = std(C.cartDirt, 0.95, { texture: "grass", textureScale: [2, 1] });
  const rng = mulberry32(0xc417d8);
  const segments: SceneNode[] = [];
  const startZ = WHEAT_FIELD_POS[2] + WHEAT_FIELD_D / 2 - 0.5;
  const endZ = WINDMILL_POS[2] + 0.8;
  const step = 0.8;
  let curveX = WINDMILL_POS[0] + 2.5;
  for (let z = startZ; z >= endZ; z -= step) {
    // Drift slightly toward the windmill as we approach it.
    const tWindmill = (startZ - z) / (startZ - endZ);
    const target = WINDMILL_POS[0] + 1.2;
    curveX = curveX * 0.85 + target * 0.15 + (rng() - 0.5) * 0.18;
    const w = 0.95 + (1 - tWindmill) * 0.3;
    segments.push(
      f.mesh(
        "Cart Trail Segment",
        plane(w, step * 1.15),
        dirt,
        {
          position: [curveX, -0.004, z],
          rotation: [-Math.PI / 2, 0, (rng() - 0.5) * 0.08],
        },
        { receiveShadow: true },
      ),
    );
  }
  // A pair of long thin wheel ruts darker than the trail to suggest
  // a recently-passed hay cart.
  for (const offset of [-0.2, 0.2]) {
    segments.push(
      f.mesh(
        "Wheel Rut",
        plane(0.12, Math.abs(endZ - startZ)),
        std(C.cartDirtDark, 0.95),
        {
          position: [WINDMILL_POS[0] + 2.0 + offset, -0.003, (startZ + endZ) / 2],
          rotation: [-Math.PI / 2, 0, 0],
        },
      ),
    );
  }
  return f.group("Wheat Field Trail", segments);
}

/**
 * A low stake-and-twine fence along the field's south edge — a series
 * of short wooden posts joined by a single horizontal twine rail. The
 * fence is shorter than the pasture / yard fences so it reads as a
 * temporary field marker rather than a permanent boundary.
 */
function buildWheatFieldFence(f: NodeFactory): SceneNode {
  const wood = std(C.windmillSailFrame, 0.9, { texture: "wood", flatShading: true });
  const twine = std(C.ropeJute, 0.9, { flatShading: true });
  const posts: Transform[] = [];
  const postH = 0.55;
  const xMin = WHEAT_FIELD_POS[0] - WHEAT_FIELD_W / 2 + 1.5;
  const xMax = WHEAT_FIELD_POS[0] + WHEAT_FIELD_W / 2 - 1.5;
  const z = WHEAT_FIELD_POS[2] + WHEAT_FIELD_D / 2 - 1.2;
  for (let x = xMin; x <= xMax + 1e-3; x += 1.4) {
    posts.push({ position: [x, postH / 2, z], rotation: [0, 0, 0], scale: [1, 1, 1] });
  }
  return f.group("Wheat Field Fence", [
    f.instanced(
      "Stake",
      box(0.05, postH, 0.05),
      wood,
      posts,
      { castShadow: true, receiveShadow: true },
    ),
    // A single horizontal twine rail strung between the posts.
    f.mesh(
      "Twine Rail",
      cylinder(0.012, 0.012, xMax - xMin, 6),
      twine,
      {
        position: [(xMin + xMax) / 2, postH - 0.06, z],
        rotation: [0, 0, Math.PI / 2],
      },
      { castShadow: true },
    ),
  ]);
}

/* ─────────────── twelfth-pass courtyard / house props ─────────────── */

/**
 * A small lean-to greenhouse on the back lawn — a white-painted timber
 * frame with a sloped translucent roof, four glass-pane walls, an open
 * door and a row of three potted seedlings inside. Modest in size so it
 * reads as a hobbyist glasshouse rather than a working nursery.
 */
function buildGreenhouse(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const frame = std(C.greenhouseFrame, 0.55, { texture: "wood", textureScale: [1, 1] });
  const frameDark = std(C.greenhouseFrameShade, 0.85, { flatShading: true });
  const trim = std(C.greenhouseRoofTrim, 0.85, { texture: "wood", flatShading: true });
  const slab = std(C.stone, 0.95, { texture: "cobblestone", flatShading: true });
  const soil = std(C.soil, 0.95, { flatShading: true });
  const pot = std(C.terracotta, 0.85, { flatShading: true });
  const leaf = std(C.greenhouseSeedling, 0.85, { flatShading: true });
  const leafDark = std(C.greenhouseSeedlingDark, 0.85, { flatShading: true });
  const glass: MaterialDef = {
    color: C.greenhouseGlass,
    roughness: 0.15,
    metalness: 0.25,
    transparent: true,
    opacity: 0.42,
  };
  const glassDeep: MaterialDef = {
    color: C.greenhouseGlassDark,
    roughness: 0.18,
    metalness: 0.25,
    transparent: true,
    opacity: 0.5,
  };
  const w = 1.6;
  const d = 1.2;
  const wallH = 1.05;
  const ridgeRise = 0.45;
  const parts: SceneNode[] = [];
  // Stone slab footing.
  parts.push(
    f.mesh("Greenhouse Footing", box(w + 0.18, 0.08, d + 0.18), slab, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
  );
  // Four corner posts.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        f.mesh("Corner Post", box(0.06, wallH + ridgeRise * (sz === 1 ? 1 : 0), 0.06), frame, {
          position: [sx * (w / 2 - 0.04), 0.08 + (wallH + ridgeRise * (sz === 1 ? 1 : 0)) / 2, sz * (d / 2 - 0.04)],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
  }
  // Top rails — north (low) and south (high) plus side rails sloping up.
  parts.push(
    f.mesh("Rail North", box(w, 0.05, 0.06), frame, {
      position: [0, 0.08 + wallH, -d / 2 + 0.04],
    }, { castShadow: true }),
    f.mesh("Rail South", box(w, 0.05, 0.06), frame, {
      position: [0, 0.08 + wallH + ridgeRise, d / 2 - 0.04],
    }, { castShadow: true }),
  );
  // Two side rails slope from low (back) to high (front) — boxes tilted along X.
  const sideLen = Math.hypot(d, ridgeRise) + 0.02;
  const sideTilt = Math.atan2(ridgeRise, d);
  for (const sx of [-1, 1]) {
    parts.push(
      f.mesh("Side Rail", box(0.05, 0.05, sideLen), frame, {
        position: [sx * (w / 2 - 0.04), 0.08 + wallH + ridgeRise / 2, 0],
        rotation: [-sideTilt, 0, 0],
      }, { castShadow: true }),
    );
  }
  // North wall (low) — a single glass panel between the rails.
  parts.push(
    f.mesh("Wall N Glass", box(w - 0.1, wallH - 0.04, 0.04), glassDeep, {
      position: [0, 0.08 + wallH / 2, -d / 2 + 0.04],
    }, { castShadow: false }),
    // A horizontal mullion across the panel for a paned reading.
    f.mesh("Wall N Mullion", box(w - 0.05, 0.04, 0.06), frame, {
      position: [0, 0.08 + wallH / 2, -d / 2 + 0.04],
    }, { castShadow: true }),
  );
  // South wall (high) — split into two panels around the open door.
  const doorW = 0.5;
  const sideW = (w - doorW) / 2;
  parts.push(
    f.mesh("Wall S Glass L", box(sideW - 0.06, wallH + ridgeRise - 0.04, 0.04), glassDeep, {
      position: [-doorW / 2 - sideW / 2 + 0.03, 0.08 + (wallH + ridgeRise) / 2, d / 2 - 0.04],
    }, { castShadow: false }),
    f.mesh("Wall S Glass R", box(sideW - 0.06, wallH + ridgeRise - 0.04, 0.04), glassDeep, {
      position: [doorW / 2 + sideW / 2 - 0.03, 0.08 + (wallH + ridgeRise) / 2, d / 2 - 0.04],
    }, { castShadow: false }),
    // Two horizontal mullions, splitting each pane into a top and bottom light.
    f.mesh("Wall S Mullion L", box(sideW - 0.04, 0.04, 0.06), frame, {
      position: [-doorW / 2 - sideW / 2 + 0.03, 0.08 + (wallH + ridgeRise) / 2, d / 2 - 0.04],
    }, { castShadow: true }),
    f.mesh("Wall S Mullion R", box(sideW - 0.04, 0.04, 0.06), frame, {
      position: [doorW / 2 + sideW / 2 - 0.03, 0.08 + (wallH + ridgeRise) / 2, d / 2 - 0.04],
    }, { castShadow: true }),
  );
  // East/west walls — tilted trapezoid glass panels with a horizontal mullion.
  for (const sx of [-1, 1]) {
    parts.push(
      f.mesh("Side Glass", plane(sideLen - 0.06, wallH * 0.9), glassDeep, {
        position: [sx * (w / 2 - 0.05), 0.08 + wallH * 0.65, 0],
        rotation: [0, sx * Math.PI / 2, 0],
      }, { castShadow: false }),
      f.mesh("Side Mullion", box(0.04, 0.04, sideLen - 0.04), frame, {
        position: [sx * (w / 2 - 0.05), 0.08 + wallH * 0.5, 0],
      }, { castShadow: true }),
    );
  }
  // Sloped translucent roof panel — a single tilted box of glass.
  parts.push(
    f.mesh("Roof Glass", box(w + 0.1, 0.03, sideLen + 0.04), glass, {
      position: [0, 0.08 + wallH + ridgeRise / 2 + 0.04, 0],
      rotation: [-sideTilt, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Two glazing bars (mullions) running down the slope.
    f.mesh("Roof Bar L", box(0.04, 0.03, sideLen + 0.04), trim, {
      position: [-0.42, 0.08 + wallH + ridgeRise / 2 + 0.06, 0],
      rotation: [-sideTilt, 0, 0],
    }, { castShadow: true }),
    f.mesh("Roof Bar R", box(0.04, 0.03, sideLen + 0.04), trim, {
      position: [0.42, 0.08 + wallH + ridgeRise / 2 + 0.06, 0],
      rotation: [-sideTilt, 0, 0],
    }, { castShadow: true }),
    // A ridge cap along the high-south edge.
    f.mesh("Roof Ridge Cap", box(w + 0.12, 0.04, 0.08), trim, {
      position: [0, 0.08 + wallH + ridgeRise + 0.04, d / 2 - 0.03],
    }, { castShadow: true }),
  );
  // Open door — a single glass panel hinged ajar.
  parts.push(
    f.mesh("Door Glass", box(doorW - 0.04, wallH + ridgeRise - 0.06, 0.03), glassDeep, {
      position: [doorW / 2 + 0.18, 0.08 + (wallH + ridgeRise) / 2, d / 2 + 0.18],
      rotation: [0, -0.55, 0],
    }, { castShadow: false }),
    f.mesh("Door Frame", box(doorW, wallH + ridgeRise, 0.04), frame, {
      position: [doorW / 2 + 0.18, 0.08 + (wallH + ridgeRise) / 2, d / 2 + 0.18],
      rotation: [0, -0.55, 0],
    }, { castShadow: true }),
    f.mesh("Door Handle", sphere(0.025, 8, 6), frameDark, {
      position: [doorW / 2 + 0.18 + Math.cos(-0.55) * (doorW / 2 - 0.06) + Math.sin(-0.55) * 0.02, 0.08 + wallH * 0.6, d / 2 + 0.18 - Math.sin(-0.55) * (doorW / 2 - 0.06) + Math.cos(-0.55) * 0.02],
    }, { castShadow: true }),
  );
  // Inside: a long bench of soil with three potted seedlings on top.
  parts.push(
    f.mesh("Bench Soil Box", box(w - 0.32, 0.08, 0.4), soil, {
      position: [0, 0.16, -0.18],
    }, { receiveShadow: true }),
  );
  for (let i = 0; i < 3; i++) {
    const px = -0.45 + i * 0.45;
    const pz = -0.18;
    parts.push(
      f.mesh("Seedling Pot", cylinder(0.1, 0.08, 0.14, 10), pot, {
        position: [px, 0.27, pz],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Seedling Soil", cylinder(0.085, 0.085, 0.02, 10), soil, {
        position: [px, 0.345, pz],
      }),
      // Two leaf clusters per pot — light + dark for a tonal lift.
      f.mesh("Seedling Leaves Light", sphere(0.1, 8, 6), leaf, {
        position: [px - 0.03, 0.42, pz - 0.02],
        scale: [1, 0.6, 1],
      }, { castShadow: true }),
      f.mesh("Seedling Leaves Dark", sphere(0.08, 8, 6), leafDark, {
        position: [px + 0.04, 0.4, pz + 0.04],
        scale: [1, 0.55, 1],
      }, { castShadow: true }),
      // A slender stem cylinder peeking out the top.
      f.mesh("Seedling Stem", cylinder(0.008, 0.008, 0.16, 5), leafDark, {
        position: [px, 0.48, pz],
      }, { castShadow: true }),
    );
  }
  return f.group("Greenhouse", parts, { position: pos, rotation: [0, -Math.PI / 7, 0] });
}

/**
 * A row of Victorian gingerbread corbel brackets along the front and back
 * roof eaves — small carved wooden brackets that tuck under the eave
 * cornice at regular intervals. Each bracket is a stepped scroll shape
 * (top plate + diagonal kicker + drop finial) carried on a pair of thin
 * filigree slats so the silhouette reads as a millwork ornament rather
 * than a structural support.
 */
function buildEaveCorbels(f: NodeFactory): SceneNode {
  const wood = std(C.corbelWood, 0.7, { texture: "wood", textureScale: [0.6, 0.6] });
  const shade = std(C.corbelShade, 0.8, { texture: "wood", flatShading: true });
  const eaveY = ROOF_TOP - 0.05;
  const wallOffset = 0.08;
  const positions: number[] = [-3.0, -2.0, -1.0, 1.0, 2.0, 3.0];
  const corbels: SceneNode[] = [];
  function bracket(name: string, x: number, z: number, faceFront: boolean): SceneNode {
    const flip = faceFront ? 1 : -1;
    const parts: SceneNode[] = [
      // Top plate — a small horizontal cornice the bracket "hangs" from.
      f.mesh("Cornice Plate", box(0.32, 0.05, 0.18), wood, {
        position: [0, 0, 0],
      }, { castShadow: true }),
      // Main scroll — a tapered box angled in toward the wall.
      f.mesh("Scroll Body", box(0.14, 0.34, 0.16), wood, {
        position: [0, -0.18, flip * 0.04],
        rotation: [flip * -0.2, 0, 0],
      }, { castShadow: true }),
      // A small mid-step suggesting an inner curve.
      f.mesh("Scroll Step", box(0.14, 0.07, 0.1), shade, {
        position: [0, -0.34, flip * 0.07],
      }, { castShadow: true }),
      // Drop finial — a small turned blob at the bottom.
      f.mesh("Drop Finial", sphere(0.05, 10, 8), shade, {
        position: [0, -0.42, flip * 0.08],
      }, { castShadow: true }),
      // Two thin filigree slats flanking the scroll.
      f.mesh("Filigree L", box(0.012, 0.3, 0.08), shade, {
        position: [-0.085, -0.2, flip * 0.05],
        rotation: [flip * -0.18, 0, 0],
      }, { castShadow: true }),
      f.mesh("Filigree R", box(0.012, 0.3, 0.08), shade, {
        position: [0.085, -0.2, flip * 0.05],
        rotation: [flip * -0.18, 0, 0],
      }, { castShadow: true }),
    ];
    return f.group(name, parts, { position: [x, eaveY, z] });
  }
  for (const x of positions) {
    corbels.push(bracket(`Front Corbel ${x.toFixed(0)}`, x, FRONT_Z + wallOffset, true));
    corbels.push(bracket(`Back Corbel ${x.toFixed(0)}`, x, BACK_Z - wallOffset, false));
  }
  return f.group("Eave Corbels", corbels);
}

/* ─────────────── twelfth-pass NW woodland extension ─────────────── */

/**
 * A northwest woodland plane — a coniferous-forest-toned ground bridging
 * the gap between the back meadow's west edge and the west pond garden's
 * north edge. The plane overlaps each neighbour by ~2 units along its
 * joins so the ground layer has no holes. It carries a small pine grove
 * with the new `pine-bark` colour + depth map pair, a mossy fallen log,
 * a fairy mushroom ring of red toadstools and a wooden ranger lookout
 * tower on four stilts with a peaked shingle roof.
 */
function buildNorthwestWoodland(f: NodeFactory): SceneNode {
  return f.group("Northwest Woodland", [
    // The woodland ground plane itself — a darker, mossier green than the
    // meadow so the eye reads a shaded forest-floor transition. A subtle
    // heather bump scales the carpet so glancing sun catches loose duff.
    f.mesh(
      "Woodland Ground",
      plane(NW_WOODLAND_W, NW_WOODLAND_D),
      std(C.woodlandGrass, 0.96, {
        texture: "grass",
        textureScale: [10, 16],
        bumpMap: "heather-bump",
        bumpScale: 0.03,
      }),
      { position: NW_WOODLAND_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // East apron — overlaps the back meadow's west edge with a slightly
    // greener strip so the join reads as a forest fringe.
    f.mesh(
      "Woodland East Apron",
      plane(2.5, NW_WOODLAND_D),
      std(C.meadowGrassDark, 0.95, { texture: "grass", textureScale: [1, 10] }),
      {
        position: [
          NW_WOODLAND_POS[0] + NW_WOODLAND_W / 2 - 1.25,
          -0.008,
          NW_WOODLAND_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // South apron — overlaps the pond garden's north edge with a darker
    // moss-toned strip so the seam reads as one continuous understorey.
    f.mesh(
      "Woodland South Apron",
      plane(NW_WOODLAND_W, 2.5),
      std(C.mossGreen, 0.95, { texture: "grass", textureScale: [10, 1] }),
      {
        position: [
          NW_WOODLAND_POS[0],
          -0.008,
          NW_WOODLAND_POS[2] + NW_WOODLAND_D / 2 - 1.25,
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildPineGrove(f),
    buildFallenLog(f, FALLEN_LOG_POS),
    buildMushroomRing(f, MUSHROOM_RING_POS),
    buildLookoutTower(f, LOOKOUT_TOWER_POS),
    buildWoodlandFerns(f),
  ]);
}

/**
 * A small grove of tall conifers — 9 trees with a stacked-cone foliage
 * profile and a tapered trunk surfaced with the new `pine-bark` colour
 * map paired with a depth (bump) map so the ridged bark reads as relief
 * at glancing sun. Trees deterministically scatter across the woodland
 * plane, avoiding the lookout tower, the fallen log and the mushroom
 * ring.
 */
function buildPineGrove(f: NodeFactory): SceneNode {
  const trunkMat = std(C.pineBark, 0.95, {
    texture: "pine-bark",
    textureScale: [1, 4],
    bumpMap: "pine-bark-bump",
    bumpScale: 0.05,
    flatShading: false,
  });
  const foliage = std(C.pineFoliage, 0.85, { flatShading: true });
  const foliageShade = std(C.pineFoliageDark, 0.9, { flatShading: true });
  const cone = std(C.pineCone, 0.85, { flatShading: true });
  const rng = mulberry32(0xb1ec0e);
  const trees: SceneNode[] = [];
  const placed: { x: number; z: number }[] = [];
  const xMin = NW_WOODLAND_POS[0] - NW_WOODLAND_W / 2 + 2;
  const xMax = NW_WOODLAND_POS[0] + NW_WOODLAND_W / 2 - 2;
  const zMin = NW_WOODLAND_POS[2] - NW_WOODLAND_D / 2 + 2;
  const zMax = NW_WOODLAND_POS[2] + NW_WOODLAND_D / 2 - 2;
  let attempts = 0;
  while (trees.length < 9 && attempts < 400) {
    attempts++;
    const x = xMin + rng() * (xMax - xMin);
    const z = zMin + rng() * (zMax - zMin);
    if (Math.hypot(x - LOOKOUT_TOWER_POS[0], z - LOOKOUT_TOWER_POS[2]) < 3.0) continue;
    if (Math.hypot(x - FALLEN_LOG_POS[0], z - FALLEN_LOG_POS[2]) < 2.0) continue;
    if (Math.hypot(x - MUSHROOM_RING_POS[0], z - MUSHROOM_RING_POS[2]) < 2.0) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 2.4)) continue;
    placed.push({ x, z });

    const trunkH = 1.0 + rng() * 0.45;
    const s = 1.2 + rng() * 0.5;
    const tilt = (rng() - 0.5) * 0.04;
    const parts: SceneNode[] = [
      f.mesh("Trunk", cylinder(0.12, 0.18, trunkH, 10), trunkMat, {
        position: [0, trunkH / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Three stacked cones for the foliage skirt.
      f.mesh("Lower Cone", { type: "cone", radius: 0.85, height: 1.05, radialSegments: 9 }, foliage, {
        position: [0, trunkH + 0.45, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Mid Cone", { type: "cone", radius: 0.62, height: 0.85, radialSegments: 9 }, foliageShade, {
        position: [0, trunkH + 0.98, 0],
      }, { castShadow: true }),
      f.mesh("Top Cone", { type: "cone", radius: 0.4, height: 0.65, radialSegments: 9 }, foliage, {
        position: [0, trunkH + 1.45, 0],
      }, { castShadow: true }),
    ];
    // A single small cone hanging off one branch — a pine cone decoration.
    if (rng() > 0.4) {
      parts.push(
        f.mesh("Pine Cone", cylinder(0.05, 0.02, 0.1, 6), cone, {
          position: [0.38, trunkH + 0.62, 0.05],
          rotation: [0, 0, Math.PI],
        }, { castShadow: true }),
      );
    }
    trees.push(
      f.group(
        `Pine ${trees.length + 1}`,
        parts,
        { position: [x, 0, z], scale: [s, s, s], rotation: [tilt, rng() * Math.PI, tilt] },
      ),
    );
  }
  return f.group("Pine Grove", trees);
}

/**
 * A wooden ranger lookout tower — a square cabin perched on four stilts
 * with a peaked shingle roof, a railed observation deck and a leaning
 * ladder. Sized to read as a small fire-watch shelter rather than a
 * permanent post.
 */
function buildLookoutTower(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const post = std(C.lookoutPost, 0.95, {
    texture: "pine-bark",
    textureScale: [1, 3],
    bumpMap: "pine-bark-bump",
    bumpScale: 0.04,
  });
  const board = std(C.lookoutBoard, 0.9, { texture: "wood", textureScale: [1.5, 1], flatShading: true });
  const trim = std(C.windmillSailFrame, 0.85, { texture: "wood", flatShading: true });
  const roof = std(C.lookoutRoof, 0.85, { texture: "shingle", textureScale: [2, 2] });
  const ladder = std(C.lookoutLadder, 0.9, { texture: "wood", flatShading: true });
  const glass: MaterialDef = {
    color: "#a4cfdb",
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.45,
  };
  const cabinW = 1.4;
  const cabinD = 1.4;
  const cabinH = 1.0;
  const stiltH = 1.6;
  const roofRise = 0.7;
  const parts: SceneNode[] = [];
  // Four stilts.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        f.mesh("Stilt", cylinder(0.08, 0.1, stiltH, 8), post, {
          position: [sx * (cabinW / 2 - 0.08), stiltH / 2, sz * (cabinD / 2 - 0.08)],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
  }
  // Two diagonal cross braces between the front legs for visual stability.
  parts.push(
    f.mesh("Brace L", box(0.05, 0.05, Math.hypot(stiltH, cabinW - 0.16)), post, {
      position: [0, stiltH / 2, cabinD / 2 - 0.08],
      rotation: [0, 0, Math.atan2(stiltH, cabinW - 0.16) - Math.PI / 2],
      scale: [1, 1, 0.65],
    }, { castShadow: true }),
    f.mesh("Brace R", box(0.05, 0.05, Math.hypot(stiltH, cabinW - 0.16)), post, {
      position: [0, stiltH / 2, -cabinD / 2 + 0.08],
      rotation: [0, 0, -(Math.atan2(stiltH, cabinW - 0.16) - Math.PI / 2)],
      scale: [1, 1, 0.65],
    }, { castShadow: true }),
  );
  // Cabin floor / deck.
  parts.push(
    f.mesh("Cabin Floor", box(cabinW + 0.12, 0.08, cabinD + 0.12), board, {
      position: [0, stiltH + 0.04, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Four cabin walls — board-and-batten panels.
  parts.push(
    f.mesh("Wall N", box(cabinW, cabinH, 0.06), board, {
      position: [0, stiltH + 0.08 + cabinH / 2, -cabinD / 2 + 0.03],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall S", box(cabinW, cabinH * 0.4, 0.06), board, {
      position: [0, stiltH + 0.08 + cabinH * 0.2, cabinD / 2 - 0.03],
    }, { castShadow: true }),
    f.mesh("Wall E", box(0.06, cabinH, cabinD), board, {
      position: [cabinW / 2 - 0.03, stiltH + 0.08 + cabinH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall W", box(0.06, cabinH, cabinD), board, {
      position: [-cabinW / 2 + 0.03, stiltH + 0.08 + cabinH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // A wide front observation window — a glass panel filling the south wall.
  parts.push(
    f.mesh("Front Window", box(cabinW - 0.2, cabinH * 0.55, 0.04), glass, {
      position: [0, stiltH + 0.08 + cabinH * 0.65, cabinD / 2 - 0.05],
    }, { castShadow: false }),
    f.mesh("Window Mullion", box(cabinW - 0.2, 0.04, 0.05), trim, {
      position: [0, stiltH + 0.08 + cabinH * 0.65, cabinD / 2 - 0.05],
    }, { castShadow: true }),
    // A horizontal handrail across the front opening.
    f.mesh("Front Rail", cylinder(0.025, 0.025, cabinW - 0.2, 8), trim, {
      position: [0, stiltH + 0.08 + cabinH * 0.4, cabinD / 2 - 0.02],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
  );
  // Peaked roof — two slabs meeting at a ridge.
  const slope = Math.atan2(roofRise, cabinW / 2);
  const hyp = Math.hypot(roofRise, cabinW / 2);
  parts.push(
    f.mesh("Roof L", box(hyp + 0.15, 0.06, cabinD + 0.2), roof, {
      position: [-cabinW / 4 - 0.02, stiltH + 0.08 + cabinH + roofRise / 2, 0],
      rotation: [0, 0, slope],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof R", box(hyp + 0.15, 0.06, cabinD + 0.2), roof, {
      position: [cabinW / 4 + 0.02, stiltH + 0.08 + cabinH + roofRise / 2, 0],
      rotation: [0, 0, -slope],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof Ridge", cylinder(0.04, 0.04, cabinD + 0.2, 6), trim, {
      position: [0, stiltH + 0.08 + cabinH + roofRise + 0.02, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  );
  // Leaning ladder from the ground up to the front of the cabin floor.
  const ladderTopY = stiltH + 0.08;
  const ladderLen = Math.hypot(ladderTopY, 0.65);
  const ladderTilt = Math.atan2(ladderTopY, 0.65);
  parts.push(
    f.mesh("Ladder Rail L", box(0.04, 0.04, ladderLen), ladder, {
      position: [-0.18, ladderTopY / 2 + 0.04, cabinD / 2 + 0.34],
      rotation: [Math.PI / 2 - ladderTilt, 0, 0],
    }, { castShadow: true }),
    f.mesh("Ladder Rail R", box(0.04, 0.04, ladderLen), ladder, {
      position: [0.18, ladderTopY / 2 + 0.04, cabinD / 2 + 0.34],
      rotation: [Math.PI / 2 - ladderTilt, 0, 0],
    }, { castShadow: true }),
  );
  // Rungs evenly spaced along the ladder.
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    parts.push(
      f.mesh("Ladder Rung", cylinder(0.018, 0.018, 0.4, 6), ladder, {
        position: [0, t * ladderTopY + 0.04, cabinD / 2 + 0.34 + (0.5 - t) * 0.65],
        rotation: [0, 0, Math.PI / 2],
      }, { castShadow: true }),
    );
  }
  return f.group("Lookout Tower", parts, { position: pos, rotation: [0, Math.PI / 5, 0] });
}

/**
 * A mossy fallen log — a long horizontal cylinder lying on the forest
 * floor with a brighter mossy cap along its top and a few small split
 * shards at one end suggesting it cracked when it fell.
 */
function buildFallenLog(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.fallenLogWood, 0.95, {
    texture: "pine-bark",
    textureScale: [3, 1],
    bumpMap: "pine-bark-bump",
    bumpScale: 0.04,
    flatShading: false,
  });
  const moss = std(C.fallenLogMoss, 0.9, { flatShading: true });
  const shade = std(C.fallenLogShade, 0.95, { flatShading: true });
  const logLen = 2.6;
  const logR = 0.28;
  const parts: SceneNode[] = [
    // Main log body lying on its side.
    f.mesh("Log Body", cylinder(logR, logR, logLen, 14), wood, {
      position: [0, logR, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true, receiveShadow: true }),
    // Darker rim caps at the cut ends.
    f.mesh("Cap End A", cylinder(logR * 0.95, logR * 0.95, 0.04, 14), shade, {
      position: [logLen / 2 + 0.02, logR, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    f.mesh("Cap End B", cylinder(logR * 0.95, logR * 0.95, 0.04, 14), shade, {
      position: [-logLen / 2 - 0.02, logR, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    // Mossy ridge running along the top — a flattened sphere.
    f.mesh("Moss Crown", sphere(logR * 0.78, 12, 8), moss, {
      position: [0, logR + logR * 0.4, 0],
      scale: [logLen / (logR * 0.78) * 0.85, 0.6, 1.05],
    }, { castShadow: true, receiveShadow: true }),
  ];
  // A few small bark splinters scattered at one end.
  const rng = mulberry32(0xfa17e7);
  for (let i = 0; i < 4; i++) {
    parts.push(
      f.mesh("Splinter", box(0.18 + rng() * 0.08, 0.04, 0.06), shade, {
        position: [logLen / 2 + 0.2 + rng() * 0.18, 0.03, (rng() - 0.5) * 0.5],
        rotation: [0, rng() * Math.PI, 0],
      }, { castShadow: true }),
    );
  }
  return f.group("Fallen Log", parts, { position: pos, rotation: [0, Math.PI / 4, 0] });
}

/**
 * A fairy ring of seven red-capped mushrooms — small toadstools with
 * cream stems, white spotted caps and a smaller stragler in the centre
 * of the ring. Each mushroom is a stem cylinder plus a flattened sphere
 * cap. The ring sits on the woodland floor as a folkloric accent.
 */
function buildMushroomRing(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stem = std(C.mushroomStem, 0.85, { flatShading: true });
  const cap = std(C.mushroomCap, 0.65, { flatShading: true });
  const capDark = std(C.mushroomCapDark, 0.85, { flatShading: true });
  const spot = std(C.mushroomSpot, 0.85, { flatShading: true });
  const mossPatch = std(C.fallenLogMoss, 0.95, { flatShading: true });
  const parts: SceneNode[] = [];
  // A soft moss patch the ring sits on.
  parts.push(
    f.mesh("Ring Moss Patch", cylinder(1.05, 1.05, 0.04, 16), mossPatch, {
      position: [0, 0.02, 0],
    }, { receiveShadow: true }),
  );
  const rng = mulberry32(0xfa17ee);
  const ringR = 0.85;
  const n = 7;
  function mushroom(name: string, mx: number, mz: number, scale: number, dark: boolean): SceneNode {
    const stemH = 0.22 * scale;
    const capR = 0.16 * scale;
    const small: SceneNode[] = [
      f.mesh("Stem", cylinder(0.04 * scale, 0.05 * scale, stemH, 10), stem, {
        position: [0, stemH / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Cap", sphere(capR, 12, 8), dark ? capDark : cap, {
        position: [0, stemH + capR * 0.6, 0],
        scale: [1, 0.55, 1],
      }, { castShadow: true, receiveShadow: true }),
    ];
    // Three white spots on the cap, positioned around the dome.
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2 + rng() * 0.4;
      const r = capR * (0.55 + rng() * 0.25);
      small.push(
        f.mesh("Spot", sphere(capR * 0.18, 8, 6), spot, {
          position: [Math.cos(a) * r, stemH + capR * 0.78, Math.sin(a) * r],
          scale: [1, 0.4, 1],
        }),
      );
    }
    return f.group(name, small, { position: [mx, 0.04, mz], rotation: [0, rng() * Math.PI, 0] });
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const r = ringR + (rng() - 0.5) * 0.06;
    parts.push(
      mushroom(`Toadstool ${i + 1}`, Math.cos(a) * r, Math.sin(a) * r, 0.95 + rng() * 0.3, rng() < 0.18),
    );
  }
  // One small stragler near the centre.
  parts.push(mushroom("Centre Toadstool", 0.05, -0.08, 0.7, true));
  return f.group("Mushroom Ring", parts, { position: pos });
}

/**
 * A scatter of small woodland ferns across the forest floor — short
 * rounded clumps in two foliage tones, instanced for cheap rendering.
 * Ferns avoid the trees, the log, the mushroom ring and the lookout
 * tower so the silhouettes don't compete.
 */
function buildWoodlandFerns(f: NodeFactory): SceneNode {
  const fernMat = std(C.woodlandFern, 0.9, { flatShading: true });
  const fernShade = std(C.woodlandFernShade, 0.9, { flatShading: true });
  const rng = mulberry32(0xfe2090a);
  const fernsLight: Transform[] = [];
  const fernsDark: Transform[] = [];
  const xMin = NW_WOODLAND_POS[0] - NW_WOODLAND_W / 2 + 2;
  const xMax = NW_WOODLAND_POS[0] + NW_WOODLAND_W / 2 - 2;
  const zMin = NW_WOODLAND_POS[2] - NW_WOODLAND_D / 2 + 2;
  const zMax = NW_WOODLAND_POS[2] + NW_WOODLAND_D / 2 - 2;
  let attempts = 0;
  while (fernsLight.length + fernsDark.length < 64 && attempts < 600) {
    attempts++;
    const x = xMin + rng() * (xMax - xMin);
    const z = zMin + rng() * (zMax - zMin);
    if (Math.hypot(x - LOOKOUT_TOWER_POS[0], z - LOOKOUT_TOWER_POS[2]) < 1.6) continue;
    if (Math.hypot(x - FALLEN_LOG_POS[0], z - FALLEN_LOG_POS[2]) < 1.4) continue;
    if (Math.hypot(x - MUSHROOM_RING_POS[0], z - MUSHROOM_RING_POS[2]) < 1.4) continue;
    const s = 0.18 + rng() * 0.16;
    const t: Transform = {
      position: [x, s * 0.4, z],
      rotation: [0, rng() * Math.PI, 0],
      scale: [s, s * 0.7, s],
    };
    if (rng() < 0.6) fernsLight.push(t);
    else fernsDark.push(t);
  }
  return f.group("Woodland Ferns", [
    f.instanced(
      "Fern Light",
      sphere(1, 8, 6),
      fernMat,
      fernsLight,
      { castShadow: true, receiveShadow: true },
    ),
    f.instanced(
      "Fern Dark",
      sphere(1, 8, 6),
      fernShade,
      fernsDark,
      { castShadow: true, receiveShadow: true },
    ),
  ]);
}

/* ─────────────── thirteenth-pass courtyard props ─────────────── */

/**
 * A wooden rose pergola — a rectangular open-air arbor on four square posts
 * with a cross-beam lattice spanning the top, draped with climbing roses
 * (pink bloom clusters) and a slim wooden bench beneath. Sized to read as a
 * shaded sitting nook on the back-west lawn rather than a passageway.
 */
function buildRosePergola(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const post = std(C.pergolaWood, 0.85, { texture: "wood", textureScale: [0.5, 2], flatShading: false });
  const postShade = std(C.pergolaWoodDark, 0.9, { flatShading: true });
  const slat = std(C.pergolaWood, 0.85, { texture: "wood", flatShading: true });
  const rose = std(C.pergolaRose, 0.7, { flatShading: true });
  const roseDark = std(C.pergolaRoseDark, 0.75, { flatShading: true });
  const leaf = std(C.vineyardLeaf, 0.85, { flatShading: true });
  const w = 2.4;
  const d = 1.6;
  const postH = 2.2;
  const parts: SceneNode[] = [];
  // Four square corner posts on a slim stone footing.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        f.mesh("Pergola Footing", box(0.18, 0.06, 0.18), postShade, {
          position: [sx * (w / 2 - 0.08), 0.03, sz * (d / 2 - 0.08)],
        }, { receiveShadow: true }),
        f.mesh("Pergola Post", box(0.1, postH, 0.1), post, {
          position: [sx * (w / 2 - 0.08), postH / 2 + 0.06, sz * (d / 2 - 0.08)],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
  }
  // Two main beams along the length of the pergola.
  for (const sz of [-1, 1]) {
    parts.push(
      f.mesh("Pergola Beam", box(w + 0.18, 0.08, 0.12), post, {
        position: [0, postH + 0.06, sz * (d / 2 - 0.08)],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Lattice slats across the top — six narrow boards spanning the width.
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const z = -d / 2 + 0.12 + (d - 0.24) * t;
    parts.push(
      f.mesh("Pergola Slat", box(w + 0.12, 0.04, 0.08), slat, {
        position: [0, postH + 0.14, z],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Climbing rose vines — twisting along the front-left and back-right posts.
  const vinePoints: [number, number][] = [
    [-w / 2 + 0.08, d / 2 - 0.08],
    [w / 2 - 0.08, -d / 2 + 0.08],
  ];
  for (const [vx, vz] of vinePoints) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const wob = Math.sin(t * Math.PI * 3) * 0.08;
      parts.push(
        f.mesh("Vine Leaf", sphere(0.12, 8, 6), leaf, {
          position: [vx + wob, 0.3 + t * (postH - 0.2), vz + Math.cos(t * Math.PI * 3) * 0.08],
          scale: [1, 0.7, 1],
        }, { castShadow: true }),
      );
    }
  }
  // A scatter of rose bloom clusters along the top lattice.
  const rng = mulberry32(0xeada1e);
  for (let i = 0; i < 14; i++) {
    const bx = -w / 2 + 0.2 + rng() * (w - 0.4);
    const bz = -d / 2 + 0.2 + rng() * (d - 0.4);
    const r = 0.1 + rng() * 0.05;
    const colour = rng() < 0.65 ? rose : roseDark;
    parts.push(
      f.mesh("Rose Cluster", sphere(r, 8, 6), colour, {
        position: [bx, postH + 0.22 + rng() * 0.08, bz],
        scale: [1, 0.7, 1],
      }, { castShadow: true }),
    );
  }
  // A slim slatted bench tucked along the back beam.
  parts.push(
    f.mesh("Bench Seat", box(w - 0.4, 0.06, 0.34), slat, {
      position: [0, 0.42, -d / 2 + 0.22],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Bench Back", box(w - 0.4, 0.36, 0.05), slat, {
      position: [0, 0.62, -d / 2 + 0.08],
    }, { castShadow: true, receiveShadow: true }),
  );
  for (const lx of [-(w - 0.4) / 2 + 0.05, (w - 0.4) / 2 - 0.05]) {
    parts.push(
      f.mesh("Bench Leg", box(0.06, 0.4, 0.32), postShade, {
        position: [lx, 0.2, -d / 2 + 0.22],
      }, { castShadow: true }),
    );
  }
  return f.group("Rose Pergola", parts, { position: pos, rotation: [0, Math.PI / 6, 0] });
}

/**
 * An ornamental dovecote — a tall slim square pillar on a slate platform with
 * four small arched bird openings, a peaked shingle roof and three white doves
 * (two perched on the entrance ledge, one perched on the roof finial). Sized
 * to read as a delicate garden ornament rather than a working dove house.
 */
function buildDovecote(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wall = std(C.dovecoteWhite, 0.6, { texture: "plaster-pink", textureScale: [1, 2] });
  const trim = std(C.dovecoteTrim, 0.85, { flatShading: true });
  const roof = std(C.dovecoteRoof, 0.85, { texture: "shingle", textureScale: [1, 1] });
  const slate = std(C.slatePlate, 0.95, { texture: "cobblestone", flatShading: true });
  const dove = std(C.doveBody, 0.7, { flatShading: false });
  const beak = std(C.doveBeak, 0.85, { flatShading: true });
  const parts: SceneNode[] = [];
  // Hexagonal slate platform base.
  parts.push(
    f.mesh("Dovecote Base", cylinder(0.55, 0.6, 0.12, 6), slate, {
      position: [0, 0.06, 0],
    }, { receiveShadow: true }),
  );
  // Central pole/pillar — a slim square shaft with stepped courses.
  const shaftH = 2.0;
  parts.push(
    f.mesh("Dovecote Shaft", box(0.36, shaftH, 0.36), wall, {
      position: [0, 0.12 + shaftH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Stepped cornice band near the top of the shaft.
    f.mesh("Cornice Band", box(0.46, 0.06, 0.46), trim, {
      position: [0, 0.12 + shaftH - 0.12, 0],
    }, { castShadow: true }),
    f.mesh("Cornice Cap", box(0.5, 0.05, 0.5), wall, {
      position: [0, 0.12 + shaftH - 0.04, 0],
    }, { castShadow: true }),
  );
  // Four small arched bird openings — one on each face, near the top.
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    const x = Math.sin(angle) * 0.185;
    const z = Math.cos(angle) * 0.185;
    parts.push(
      f.mesh("Bird Hole", box(0.14, 0.16, 0.04), trim, {
        position: [x, 0.12 + shaftH - 0.4, z],
        rotation: [0, angle, 0],
      }, { castShadow: true }),
      // Small entrance ledge under each opening.
      f.mesh("Ledge", box(0.22, 0.03, 0.08), trim, {
        position: [Math.sin(angle) * 0.22, 0.12 + shaftH - 0.5, Math.cos(angle) * 0.22],
        rotation: [0, angle, 0],
      }, { castShadow: true }),
    );
  }
  // Peaked four-sided shingle roof — a tall pyramid sitting atop the shaft.
  const roofH = 0.7;
  parts.push(
    f.mesh("Dovecote Roof", cone(0.42, roofH, 4), roof, {
      position: [0, 0.12 + shaftH + roofH / 2, 0],
      rotation: [0, Math.PI / 4, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A turned finial spire on top.
    f.mesh("Roof Spire", cylinder(0.018, 0.03, 0.18, 6), trim, {
      position: [0, 0.12 + shaftH + roofH + 0.09, 0],
    }, { castShadow: true }),
    f.mesh("Spire Orb", sphere(0.04, 10, 6), trim, {
      position: [0, 0.12 + shaftH + roofH + 0.22, 0],
    }, { castShadow: true }),
  );
  // Two doves perched on entrance ledges, one on the spire.
  const doves: [number, number, number, number][] = [
    [0.22, 0.12 + shaftH - 0.46, 0, 0],
    [0, 0.12 + shaftH - 0.46, 0.22, Math.PI / 2],
    [0, 0.12 + shaftH + roofH + 0.28, 0, Math.PI / 4],
  ];
  for (const [dx, dy, dz, rot] of doves) {
    parts.push(
      f.group("Dove", [
        f.mesh("Dove Body", sphere(0.07, 10, 8), dove, {
          position: [0, 0, 0],
          scale: [1, 0.8, 1.5],
        }, { castShadow: true }),
        f.mesh("Dove Head", sphere(0.045, 8, 6), dove, {
          position: [0, 0.04, 0.08],
        }, { castShadow: true }),
        f.mesh("Dove Beak", cone(0.012, 0.04, 5), beak, {
          position: [0, 0.04, 0.12],
          rotation: [Math.PI / 2, 0, 0],
        }, { castShadow: true }),
      ], { position: [dx, dy, dz], rotation: [0, rot, 0] }),
    );
  }
  return f.group("Dovecote", parts, { position: pos });
}

/* ─────────────── thirteenth-pass house detail ─────────────── */

/**
 * A central roof cupola (belvedere) — a small square turret with four arched
 * windows, a peaked shingle roof and a copper-patina spire finial, sitting
 * centred on the main roof ridge. Reads as a lantern crown rather than a
 * working tower.
 */
function buildRoofCupola(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wall = std(C.cupolaWall, 0.7, { texture: "plaster-pink", textureScale: [1, 1.2] });
  const trim = std(C.cupolaTrim, 0.65, { flatShading: false });
  const roof = std(C.cupolaRoof, 0.85, { texture: "shingle", textureScale: [1, 1] });
  const spireMetal = std(C.copperPatina, 0.55, {
    texture: "copper-patina",
    textureScale: [1, 2],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.04,
    metalness: 0.55,
  });
  const glass: MaterialDef = {
    color: "#bcd9e8",
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.55,
  };
  const baseW = 1.4;
  const baseH = 0.16;
  const wallH = 0.85;
  const roofRise = 0.55;
  const parts: SceneNode[] = [];
  // Stepped square base sitting on the ridge.
  parts.push(
    f.mesh("Cupola Base", box(baseW + 0.18, baseH, baseW + 0.18), trim, {
      position: [0, baseH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Cupola Base Inner", box(baseW + 0.08, baseH * 0.6, baseW + 0.08), wall, {
      position: [0, baseH + 0.04, 0],
    }, { castShadow: true }),
  );
  // Four cupola walls — each with a tall arched window.
  const wallY = baseH + 0.08 + wallH / 2;
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    const x = Math.sin(angle) * (baseW / 2 - 0.04);
    const z = Math.cos(angle) * (baseW / 2 - 0.04);
    parts.push(
      f.mesh("Cupola Wall", box(baseW - 0.08, wallH, 0.08), wall, {
        position: [x, wallY, z],
        rotation: [0, angle, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Arched window — a glass panel with a top mullion.
      f.mesh("Cupola Window", box(0.36, wallH * 0.7, 0.05), glass, {
        position: [x, wallY + 0.02, z],
        rotation: [0, angle, 0],
      }, { castShadow: false }),
      f.mesh("Window Mullion", box(0.4, 0.04, 0.06), trim, {
        position: [x, wallY + wallH * 0.05, z],
        rotation: [0, angle, 0],
      }, { castShadow: true }),
    );
  }
  // Corner pilasters — slim trim strips at each vertical edge.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        f.mesh("Cupola Pilaster", box(0.06, wallH + 0.04, 0.06), trim, {
          position: [sx * (baseW / 2 - 0.04), wallY, sz * (baseW / 2 - 0.04)],
        }, { castShadow: true }),
      );
    }
  }
  // Cornice cap above the walls.
  const cornY = baseH + 0.08 + wallH;
  parts.push(
    f.mesh("Cupola Cornice", box(baseW + 0.06, 0.06, baseW + 0.06), trim, {
      position: [0, cornY + 0.03, 0],
    }, { castShadow: true }),
  );
  // Peaked four-sided shingle roof (a square pyramid).
  parts.push(
    f.mesh("Cupola Roof", cone(baseW * 0.72, roofRise, 4), roof, {
      position: [0, cornY + 0.06 + roofRise / 2, 0],
      rotation: [0, Math.PI / 4, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Copper-patina spire finial — a stepped column ending in a small orb.
  const spireBase = cornY + 0.06 + roofRise;
  parts.push(
    f.mesh("Spire Base", cylinder(0.06, 0.08, 0.1, 8), spireMetal, {
      position: [0, spireBase + 0.05, 0],
    }, { castShadow: true }),
    f.mesh("Spire Shaft", cylinder(0.025, 0.04, 0.42, 8), spireMetal, {
      position: [0, spireBase + 0.31, 0],
    }, { castShadow: true }),
    f.mesh("Spire Orb", sphere(0.08, 12, 8), spireMetal, {
      position: [0, spireBase + 0.6, 0],
    }, { castShadow: true }),
    f.mesh("Spire Cap", cone(0.04, 0.16, 8), spireMetal, {
      position: [0, spireBase + 0.78, 0],
    }, { castShadow: true }),
  );
  return f.group("Roof Cupola", parts, { position: pos });
}

/* ─────────────── thirteenth-pass SE vineyard extension ─────────────── */

/**
 * A southeast vineyard plane — a tilled cinnamon-earth field bridging the
 * gap between the side orchard's south edge and the south heath's east edge,
 * carrying rows of grape trellises, a stone wine press shed, stacked oak
 * wine barrels and a pair of cypress trees. The plane overlaps each
 * neighbour by ~1.5 units along its joins so the ground layer has no holes.
 */
function buildSoutheastVineyard(f: NodeFactory): SceneNode {
  return f.group("Southeast Vineyard", [
    // The vineyard ground plane — tilled cinnamon-brown soil with the new
    // `vineyard-soil` colour map paired with a row-ridge depth map so the
    // plough furrows read as relief at glancing sun.
    f.mesh(
      "Vineyard Ground",
      plane(SE_VINEYARD_W, SE_VINEYARD_D),
      std(C.vineyardSoil, 0.95, {
        texture: "vineyard-soil",
        textureScale: [4, 3],
        bumpMap: "vineyard-soil-bump",
        bumpScale: 0.05,
      }),
      { position: SE_VINEYARD_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // North apron — overlaps the side orchard's south edge with a strip of
    // orchard-toned grass so the join reads as a vineyard headland.
    f.mesh(
      "Vineyard North Apron",
      plane(SE_VINEYARD_W, 2.4),
      std(C.orchardGrass, 0.95, { texture: "grass", textureScale: [10, 1] }),
      {
        position: [
          SE_VINEYARD_POS[0],
          -0.01,
          SE_VINEYARD_POS[2] - SE_VINEYARD_D / 2 + 1.2,
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // West apron — overlaps the south heath's east edge with a heather-toned
    // strip so the join reads seamlessly into the moor.
    f.mesh(
      "Vineyard West Apron",
      plane(2.4, SE_VINEYARD_D),
      std(C.heathGround, 0.95, { texture: "heather", textureScale: [1, 10] }),
      {
        position: [
          SE_VINEYARD_POS[0] - SE_VINEYARD_W / 2 + 1.2,
          -0.01,
          SE_VINEYARD_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildVineyardRows(f),
    buildWinePressShed(f, WINE_SHED_POS),
    buildWineBarrels(f, WINE_BARRELS_POS),
    buildCypressPair(f),
  ]);
}

/**
 * Five rows of grape trellises running across the vineyard — each row is a
 * line of slim wooden posts strung between with horizontal wire and draped
 * with grape leaves and cobalt-purple grape clusters. Rows route around the
 * wine shed and the cypress trees so they look like a working planting.
 */
function buildVineyardRows(f: NodeFactory): SceneNode {
  const post = std(C.vinePost, 0.9, { texture: "wood", flatShading: true });
  const wire = std(C.vineWire, 0.6, { metalness: 0.5 });
  const leaf = std(C.vineyardLeaf, 0.85, { flatShading: true });
  const leafDark = std(C.vineyardLeafDark, 0.9, { flatShading: true });
  const grape = std(C.vineyardGrape, 0.7, { flatShading: false });
  const grapeBright = std(C.vineyardGrapeHighlight, 0.7, { flatShading: false });
  const rows = 5;
  const rowSpacing = 1.6;
  const rowLen = 14;
  const postSpacing = 2.0;
  const postH = 1.4;
  const baseZ = SE_VINEYARD_POS[2] - rowSpacing * (rows - 1) / 2 + 1;
  const groups: SceneNode[] = [];
  const rng = mulberry32(0x71ed01);
  for (let r = 0; r < rows; r++) {
    const z = baseZ + r * rowSpacing;
    const rowX = SE_VINEYARD_POS[0] - rowLen / 2 - 0.4;
    // Route the rows so they bend around the wine shed.
    const dropOut = z > WINE_SHED_POS[2] - 2 && z < WINE_SHED_POS[2] + 2.4;
    const xStart = dropOut ? rowX : rowX - 1.2;
    const xEnd = xStart + rowLen + (dropOut ? -3 : 0);
    const parts: SceneNode[] = [];
    // Posts spaced along the row.
    const nPosts = Math.floor((xEnd - xStart) / postSpacing) + 1;
    for (let p = 0; p < nPosts; p++) {
      const x = xStart + p * postSpacing;
      parts.push(
        f.mesh("Vine Post", box(0.06, postH, 0.06), post, {
          position: [x, postH / 2, 0],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
    // Three horizontal wires at staggered heights connecting posts end-to-end.
    for (let w = 0; w < 3; w++) {
      const y = postH * (0.35 + w * 0.22);
      const len = (nPosts - 1) * postSpacing;
      parts.push(
        f.mesh("Trellis Wire", cylinder(0.008, 0.008, len, 5), wire, {
          position: [xStart + len / 2, y, 0],
          rotation: [0, 0, Math.PI / 2],
        }, { castShadow: false }),
      );
    }
    // Leaf clusters strung along the wires — two leaves per post-segment.
    for (let p = 0; p < nPosts - 1; p++) {
      const segX = xStart + (p + 0.5) * postSpacing + (rng() - 0.5) * 0.12;
      const lightLeaf = rng() < 0.55 ? leaf : leafDark;
      parts.push(
        f.mesh("Vine Leaf", sphere(0.22, 8, 6), lightLeaf, {
          position: [segX, postH * 0.78, 0],
          scale: [1.2, 0.4, 1.2],
        }, { castShadow: true, receiveShadow: true }),
        f.mesh("Vine Leaf Lower", sphere(0.18, 8, 6), leafDark, {
          position: [segX + 0.18, postH * 0.55, 0],
          scale: [1.0, 0.4, 1.0],
        }, { castShadow: true }),
      );
      // A grape cluster hanging below the wires.
      const colour = rng() < 0.6 ? grape : grapeBright;
      parts.push(
        f.mesh("Grape Cluster", sphere(0.1, 10, 8), colour, {
          position: [segX - 0.05, postH * 0.32, 0.04],
          scale: [1, 1.6, 1],
        }, { castShadow: true }),
        // A small leaf perched above the cluster.
        f.mesh("Cluster Leaf", sphere(0.08, 8, 6), leafDark, {
          position: [segX - 0.05, postH * 0.5, 0.04],
          scale: [1, 0.4, 1],
        }, { castShadow: true }),
      );
    }
    groups.push(f.group(`Vine Row ${r + 1}`, parts, { position: [0, 0, z] }));
  }
  return f.group("Vineyard Rows", groups);
}

/**
 * A small rustic stone wine press shed — a square stone-walled cottage with a
 * single shuttered door, a peaked terracotta-tile roof and a slim chimney on
 * one side. Sized to read as a working press shed rather than a residence.
 */
function buildWinePressShed(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wall = std(C.wineShedStone, 0.95, { texture: "cobblestone", textureScale: [2, 2], flatShading: false });
  const wallShade = std(C.wineShedStoneDark, 0.95, { flatShading: true });
  const roof = std(C.wineShedRoof, 0.85, { texture: "shingle", textureScale: [2.5, 2] });
  const door = std(C.wineShedDoor, 0.9, { texture: "wood", flatShading: true });
  const trim = std(C.cupolaTrim, 0.7, { flatShading: false });
  const chimney = std(C.brick, 0.95, { texture: "brick", textureScale: [1, 2] });
  const w = 2.8;
  const d = 2.4;
  const wallH = 1.8;
  const roofRise = 0.9;
  const parts: SceneNode[] = [];
  // Footing course — a slightly wider stone base.
  parts.push(
    f.mesh("Shed Footing", box(w + 0.18, 0.18, d + 0.18), wallShade, {
      position: [0, 0.09, 0],
    }, { receiveShadow: true }),
  );
  // Four stone walls.
  parts.push(
    f.mesh("Wall N", box(w, wallH, 0.16), wall, {
      position: [0, 0.18 + wallH / 2, -d / 2 + 0.08],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall S", box(w, wallH, 0.16), wall, {
      position: [0, 0.18 + wallH / 2, d / 2 - 0.08],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall E", box(0.16, wallH, d), wall, {
      position: [w / 2 - 0.08, 0.18 + wallH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall W", box(0.16, wallH, d), wall, {
      position: [-w / 2 + 0.08, 0.18 + wallH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Arched wooden door on the south wall.
  parts.push(
    f.mesh("Shed Door", box(0.72, 1.3, 0.06), door, {
      position: [0, 0.18 + 0.65, d / 2 - 0.04],
    }, { castShadow: true }),
    f.mesh("Door Frame", box(0.84, 1.4, 0.08), wallShade, {
      position: [0, 0.18 + 0.7, d / 2 - 0.05],
    }, { castShadow: true }),
    f.mesh("Door Handle", sphere(0.028, 8, 6), trim, {
      position: [0.18, 0.18 + 0.6, d / 2 - 0.02],
    }, { castShadow: true }),
  );
  // A small square window on the east wall.
  parts.push(
    f.mesh("Shed Window", box(0.06, 0.42, 0.42), trim, {
      position: [w / 2 - 0.04, 0.18 + 1.1, 0],
    }, { castShadow: true }),
    f.mesh("Shed Window Pane", box(0.04, 0.34, 0.34), {
      color: "#bcd9e8", roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.55,
    }, {
      position: [w / 2 - 0.06, 0.18 + 1.1, 0],
    }, { castShadow: false }),
  );
  // Peaked roof — two slabs meeting at a ridge along Z.
  const slope = Math.atan2(roofRise, w / 2);
  const hyp = Math.hypot(roofRise, w / 2);
  parts.push(
    f.mesh("Roof L", box(hyp + 0.18, 0.1, d + 0.24), roof, {
      position: [-w / 4 - 0.03, 0.18 + wallH + roofRise / 2, 0],
      rotation: [0, 0, slope],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof R", box(hyp + 0.18, 0.1, d + 0.24), roof, {
      position: [w / 4 + 0.03, 0.18 + wallH + roofRise / 2, 0],
      rotation: [0, 0, -slope],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof Ridge", cylinder(0.06, 0.06, d + 0.24, 6), wallShade, {
      position: [0, 0.18 + wallH + roofRise + 0.05, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  );
  // Gable ends — small triangular plaster fills above the walls.
  const gablePoly: GeometryDef = {
    type: "buffer",
    attributes: {
      position: [
        -w / 2, -roofRise / 2, 0,
        w / 2, -roofRise / 2, 0,
        0, roofRise / 2, 0,
      ],
      normal: [0, 0, -1, 0, 0, -1, 0, 0, -1],
    },
  };
  parts.push(
    f.mesh("Gable N", gablePoly, { color: C.wineShedStone, roughness: 0.85, side: "double", texture: "cobblestone" }, {
      position: [0, 0.18 + wallH + roofRise / 2, -d / 2 + 0.02],
    }, { castShadow: true }),
    f.mesh("Gable S", gablePoly, { color: C.wineShedStone, roughness: 0.85, side: "double", texture: "cobblestone" }, {
      position: [0, 0.18 + wallH + roofRise / 2, d / 2 - 0.02],
      rotation: [0, Math.PI, 0],
    }, { castShadow: true }),
  );
  // Small brick chimney on the back-left corner.
  parts.push(
    f.mesh("Shed Chimney", box(0.28, 0.9, 0.28), chimney, {
      position: [-w / 2 + 0.25, 0.18 + wallH + 0.45, -d / 2 + 0.35],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Chimney Crown", box(0.36, 0.06, 0.36), wallShade, {
      position: [-w / 2 + 0.25, 0.18 + wallH + 0.93, -d / 2 + 0.35],
    }, { castShadow: true }),
  );
  return f.group("Wine Press Shed", parts, { position: pos, rotation: [0, -Math.PI / 8, 0] });
}

/**
 * A small stack of four oak wine barrels beside the press shed — two on the
 * ground, two on top, with iron bands and a leaning wooden cooper's mallet
 * on the rearmost barrel.
 */
function buildWineBarrels(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.wineBarrel, 0.85, { texture: "wood", textureScale: [1, 2], flatShading: false });
  const hoop = std(C.wineBarrelHoop, 0.5, { metalness: 0.6, flatShading: true });
  const mallet = std(C.pergolaWoodDark, 0.9, { texture: "wood", flatShading: true });
  const barrelR = 0.32;
  const barrelL = 0.74;
  const parts: SceneNode[] = [];
  // Four barrels — two on the ground (touching), two stacked above.
  const positions: [number, number, number][] = [
    [-barrelR - 0.02, barrelR, 0],
    [barrelR + 0.02, barrelR, 0],
    [0, barrelR * 2 + 0.08, 0],
    [0, barrelR * 2 + 0.08, -barrelL - 0.06],
  ];
  for (let i = 0; i < positions.length; i++) {
    const [x, y, z] = positions[i]!;
    parts.push(
      f.mesh("Barrel Body", cylinder(barrelR, barrelR * 0.9, barrelL, 14), wood, {
        position: [x, y, z],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
    // Two iron hoops near each end of the barrel.
    for (const offs of [-barrelL * 0.35, barrelL * 0.35]) {
      parts.push(
        f.mesh("Barrel Hoop", cylinder(barrelR + 0.012, barrelR + 0.012, 0.04, 14), hoop, {
          position: [x, y, z + offs],
          rotation: [Math.PI / 2, 0, 0],
        }, { castShadow: true }),
      );
    }
    // A central iron band on the belly.
    parts.push(
      f.mesh("Barrel Belly Band", cylinder(barrelR * 0.98, barrelR * 0.98, 0.05, 14), hoop, {
        position: [x, y, z],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true }),
    );
  }
  // A cooper's mallet leaning against the rearmost upper barrel.
  parts.push(
    f.mesh("Mallet Handle", cylinder(0.018, 0.022, 0.55, 8), mallet, {
      position: [0.32, barrelR * 2 + 0.34, -barrelL - 0.06],
      rotation: [0.4, 0, 0.6],
    }, { castShadow: true }),
    f.mesh("Mallet Head", cylinder(0.07, 0.07, 0.16, 10), mallet, {
      position: [0.48, barrelR * 2 + 0.62, -barrelL - 0.06],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
  );
  return f.group("Wine Barrels", parts, { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/**
 * A pair of slim cypress trees flanking the approach from the orchard side
 * of the vineyard — tall narrow conical foliage on a short brown trunk.
 */
function buildCypressPair(f: NodeFactory): SceneNode {
  const trunk = std(C.cypressTrunk, 0.95, { texture: "bark", textureScale: [1, 3], flatShading: true });
  const foliage = std(C.cypressFoliage, 0.9, { flatShading: true });
  const foliageDark = std(C.cypressFoliageDark, 0.9, { flatShading: true });
  function tree(name: string, x: number, z: number, scale: number): SceneNode {
    const trunkH = 0.35 * scale;
    return f.group(name, [
      f.mesh("Trunk", cylinder(0.08, 0.12, trunkH, 8), trunk, {
        position: [0, trunkH / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Three stacked tall cones for a narrow cypress silhouette.
      f.mesh("Lower Foliage", cone(0.42, 1.6 * scale, 9), foliage, {
        position: [0, trunkH + 0.8 * scale, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Mid Foliage", cone(0.32, 1.1 * scale, 9), foliageDark, {
        position: [0, trunkH + 1.7 * scale, 0],
      }, { castShadow: true }),
      f.mesh("Top Foliage", cone(0.2, 0.7 * scale, 9), foliage, {
        position: [0, trunkH + 2.35 * scale, 0],
      }, { castShadow: true }),
    ], { position: [x, 0, z] });
  }
  return f.group("Cypress Pair", [
    tree("Cypress L", SE_VINEYARD_POS[0] - SE_VINEYARD_W / 2 + 3, SE_VINEYARD_POS[2] - SE_VINEYARD_D / 2 + 2, 1.05),
    tree("Cypress R", SE_VINEYARD_POS[0] - SE_VINEYARD_W / 2 + 3, SE_VINEYARD_POS[2] + SE_VINEYARD_D / 2 - 2, 1.15),
  ]);
}

/* ─────────────── fourteenth-pass courtyard props ─────────────── */

/**
 * A wrought-iron Victorian two-seater garden glider — a curved cradle frame
 * holds a slatted iron bench on chains, dressed with a pair of cushions and
 * crowned by a striped canvas canopy. Sized to read as a romantic side-lawn
 * piece rather than a structural arbour.
 */
function buildVictorianGlider(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const iron = std(C.gliderIron, 0.5, { metalness: 0.45, flatShading: false });
  const ironHi = std(C.gliderIronHi, 0.55, { metalness: 0.4 });
  const canopy = std(C.gliderCanopyCream, 0.85, { texture: "awning-stripe", textureScale: [1.4, 1] });
  const cushion = std(C.gliderCushion, 0.78, { flatShading: false });
  const cushionTrim = std(C.gliderCushionTrim, 0.85, { flatShading: true });
  const w = 1.6;
  const d = 0.7;
  const seatY = 0.46;
  const parts: SceneNode[] = [];
  // A-frame cradle stands at each end — two angled iron uprights meeting a
  // crossbar at the top, with a flared foot at the bottom.
  for (const sx of [-1, 1] as const) {
    parts.push(
      // Outer angled upright (top leans toward the centre, foot flares out).
      f.mesh("Glider Upright Outer", cylinder(0.025, 0.025, 1.9, 6), iron, {
        position: [sx * (w / 2 + 0.05), 0.95, 0],
        rotation: [0, 0, -sx * 0.16],
      }, { castShadow: true }),
      // Inner angled upright — the cradle's diagonal brace.
      f.mesh("Glider Upright Inner", cylinder(0.022, 0.022, 1.75, 6), iron, {
        position: [sx * (w / 2 - 0.05), 0.88, 0],
        rotation: [0, 0, sx * 0.18],
      }, { castShadow: true }),
      // Flared foot — short horizontal box across both upright bottoms.
      f.mesh("Glider Foot", box(0.36, 0.05, 0.16), ironHi, {
        position: [sx * (w / 2 - 0.02), 0.025, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Decorative scroll at the foot's outside corner.
      f.mesh("Foot Scroll", sphere(0.045, 8, 6), ironHi, {
        position: [sx * (w / 2 + 0.16), 0.06, 0],
      }, { castShadow: true }),
    );
  }
  // Top crossbar joining the two A-frames — runs along the length.
  parts.push(
    f.mesh("Glider Top Bar", cylinder(0.03, 0.03, w + 0.2, 6), iron, {
      position: [0, 1.9, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
  );
  // Chains hanging from the crossbar that suspend the bench (front + back).
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        f.mesh("Glider Chain", cylinder(0.012, 0.012, 1.4, 4), ironHi, {
          position: [sx * (w / 2 - 0.18), 1.2, sz * (d / 2 - 0.04)],
        }, { castShadow: false }),
      );
    }
  }
  // Bench seat — a slim plank slung between the chains.
  parts.push(
    f.mesh("Bench Seat", box(w - 0.2, 0.05, d), iron, {
      position: [0, seatY, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Bench back — a leaning slatted backrest.
    f.mesh("Bench Back", box(w - 0.2, 0.42, 0.04), iron, {
      position: [0, seatY + 0.25, -d / 2 + 0.04],
      rotation: [-0.18, 0, 0],
    }, { castShadow: true }),
    // Three decorative back slats — vertical thin rods.
    f.mesh("Back Slat L", box(0.018, 0.36, 0.018), ironHi, {
      position: [-(w - 0.4) / 2, seatY + 0.22, -d / 2 + 0.04],
    }, { castShadow: true }),
    f.mesh("Back Slat C", box(0.018, 0.36, 0.018), ironHi, {
      position: [0, seatY + 0.22, -d / 2 + 0.04],
    }, { castShadow: true }),
    f.mesh("Back Slat R", box(0.018, 0.36, 0.018), ironHi, {
      position: [(w - 0.4) / 2, seatY + 0.22, -d / 2 + 0.04],
    }, { castShadow: true }),
  );
  // Two cushions on the seat and one bolster against the back.
  parts.push(
    f.mesh("Seat Cushion L", box((w - 0.32) / 2, 0.08, d - 0.1), cushion, {
      position: [-(w / 2 - 0.22) / 1, seatY + 0.07, 0.04],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Seat Cushion R", box((w - 0.32) / 2, 0.08, d - 0.1), cushion, {
      position: [(w / 2 - 0.22) / 1, seatY + 0.07, 0.04],
    }, { castShadow: true, receiveShadow: true }),
    // Piping trim around each cushion — thin dark strip.
    f.mesh("Cushion Piping L", box((w - 0.32) / 2 + 0.02, 0.02, d - 0.06), cushionTrim, {
      position: [-(w / 2 - 0.22), seatY + 0.03, 0.04],
    }, { castShadow: false }),
    f.mesh("Cushion Piping R", box((w - 0.32) / 2 + 0.02, 0.02, d - 0.06), cushionTrim, {
      position: [(w / 2 - 0.22), seatY + 0.03, 0.04],
    }, { castShadow: false }),
    // Back bolster — long sausage cushion against the back slats.
    f.mesh("Back Bolster", cylinder(0.07, 0.07, w - 0.36, 8), cushion, {
      position: [0, seatY + 0.18, -d / 2 + 0.12],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
  );
  // Striped canvas canopy — a pitched roof crowning the top crossbar.
  const canopyW = w + 0.45;
  const canopyD = d + 0.45;
  parts.push(
    f.mesh("Canopy L", box(canopyW, 0.04, canopyD * 0.55), canopy, {
      position: [0, 2.06, -canopyD * 0.22],
      rotation: [-0.3, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Canopy R", box(canopyW, 0.04, canopyD * 0.55), canopy, {
      position: [0, 2.06, canopyD * 0.22],
      rotation: [0.3, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Canopy front scallop — three small drape bumps along the front edge.
    f.mesh("Canopy Scallop L", sphere(0.06, 8, 6), canopy, {
      position: [-canopyW / 3, 1.95, canopyD * 0.45],
      scale: [1.2, 0.6, 0.6],
    }, { castShadow: false }),
    f.mesh("Canopy Scallop C", sphere(0.06, 8, 6), canopy, {
      position: [0, 1.95, canopyD * 0.45],
      scale: [1.2, 0.6, 0.6],
    }, { castShadow: false }),
    f.mesh("Canopy Scallop R", sphere(0.06, 8, 6), canopy, {
      position: [canopyW / 3, 1.95, canopyD * 0.45],
      scale: [1.2, 0.6, 0.6],
    }, { castShadow: false }),
    // Ridge cap — a slim iron rod along the canopy peak.
    f.mesh("Canopy Ridge", cylinder(0.012, 0.012, canopyW, 4), iron, {
      position: [0, 2.1, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
  );
  return f.group("Victorian Glider", parts, { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/**
 * An ornamental brass armillary sphere on a fluted stone pedestal — three
 * intersecting copper-patina rings (equator + two meridians) around a small
 * dark sphere, with an offset gnomon arrow. The rings carry the existing
 * `copper-patina` colour map paired with its depth map so the verdigris
 * mottling reads as crusted relief on the metal arcs.
 */
function buildArmillarySphere(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.armillaryStone, 0.85, { texture: "cobblestone", textureScale: [1, 1], flatShading: false });
  const stoneShade = std(C.armillaryStoneDark, 0.9, { flatShading: true });
  const ring = std(C.copperPatina, 0.55, {
    texture: "copper-patina",
    textureScale: [3, 1],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.04,
    metalness: 0.35,
  });
  const globe = std(C.armillaryGlobe, 0.5, { metalness: 0.45 });
  const parts: SceneNode[] = [];
  // Square footing + fluted column + capital — classical pedestal stack.
  parts.push(
    f.mesh("Pedestal Footing", box(0.7, 0.12, 0.7), stoneShade, {
      position: [0, 0.06, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Pedestal Base", box(0.56, 0.08, 0.56), stone, {
      position: [0, 0.16, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Pedestal Shaft", cylinder(0.18, 0.21, 0.95, 10), stone, {
      position: [0, 0.68, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Vertical flutes — six slim recess columns evenly spaced around the shaft.
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      f.mesh("Flute", cylinder(0.018, 0.022, 0.85, 5), stoneShade, {
        position: [Math.sin(a) * 0.19, 0.66, Math.cos(a) * 0.19],
      }, { castShadow: false }),
    );
  }
  parts.push(
    f.mesh("Pedestal Capital", box(0.56, 0.08, 0.56), stone, {
      position: [0, 1.2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Capital Cap", box(0.4, 0.04, 0.4), stoneShade, {
      position: [0, 1.26, 0],
    }, { castShadow: true }),
  );
  // Three intersecting metal rings — equator (XZ plane), prime meridian
  // (XY plane) and tilted secondary meridian (rotated about the polar axis).
  // Each ring is built as a circle of short instanced segment boxes so the
  // arc reads as continuous from a normal viewing distance.
  const ringY = 1.7;
  const ringR = 0.36;
  const segCount = 24;
  const seg = (Math.PI * 2 * ringR) / segCount;
  function ringSegments(rotX: number, rotY: number): Transform[] {
    const out: Transform[] = [];
    const cx = Math.cos(rotX);
    const sx = Math.sin(rotX);
    const cy = Math.cos(rotY);
    const sy = Math.sin(rotY);
    for (let i = 0; i < segCount; i++) {
      const a = (i / segCount) * Math.PI * 2;
      // Local circle point lies in XY before rotation.
      const lx = Math.cos(a) * ringR;
      const ly = Math.sin(a) * ringR;
      const lz = 0;
      // Apply X rotation (about local X), then Y rotation.
      const y1 = ly * cx - lz * sx;
      const z1 = ly * sx + lz * cx;
      const x1 = lx;
      const x2 = x1 * cy + z1 * sy;
      const z2 = -x1 * sy + z1 * cy;
      out.push({
        position: [x2, ringY + y1, z2],
        // Each segment box's local long axis (X) is rotated to align with
        // the tangent of the circle at angle a, with the ring's own
        // orientation (rotX about X, rotY about Y) layered on top.
        rotation: [rotX, rotY, a + Math.PI / 2],
        scale: [seg, 0.038, 0.038],
      });
    }
    return out;
  }
  parts.push(
    // Equator — instanced ring lying in XZ.
    f.instanced("Equator Ring", box(1, 1, 1), ring, ringSegments(Math.PI / 2, 0), {
      castShadow: true,
    }),
    // Prime meridian — vertical ring in XY.
    f.instanced("Prime Meridian", box(1, 1, 1), ring, ringSegments(0, 0), {
      castShadow: true,
    }),
    // Tilted secondary meridian — vertical ring yawed 45° about Y.
    f.instanced("Tilted Meridian", box(1, 1, 1), ring, ringSegments(0, Math.PI / 4), {
      castShadow: true,
    }),
    // Polar axis rod — runs through the equator's centre.
    f.mesh("Polar Axis", cylinder(0.014, 0.014, ringR * 2.5, 6), ring, {
      position: [0, ringY, 0],
      rotation: [0, 0, -0.4],
    }, { castShadow: true }),
    // Central globe.
    f.mesh("Central Globe", sphere(0.075, 12, 8), globe, {
      position: [0, ringY, 0],
    }, { castShadow: true }),
    // Gnomon arrow — a slim rod with a tiny pyramid tip pointing outward.
    f.mesh("Gnomon Rod", cylinder(0.008, 0.008, ringR + 0.18, 4), ring, {
      position: [Math.cos(0.4) * (ringR / 2 + 0.06), ringY + Math.sin(0.4) * (ringR / 2 + 0.06), 0],
      rotation: [0, 0, Math.PI / 2 - 0.4],
    }, { castShadow: false }),
    f.mesh("Gnomon Tip", cone(0.022, 0.05, 5), ring, {
      position: [Math.cos(0.4) * (ringR + 0.22), ringY + Math.sin(0.4) * (ringR + 0.22), 0],
      rotation: [0, 0, -(Math.PI / 2 - 0.4)],
    }, { castShadow: false }),
  );
  return f.group("Armillary Sphere", parts, { position: pos, rotation: [0, -Math.PI / 6, 0] });
}

/* ─────────────── fourteenth-pass house detail ─────────────── */

/**
 * A round oculus window centred in a gable — a wide copper-patina trim
 * band ringing a tinted glass disc, with two thin radial muntins forming
 * a cross. Used twice (once for the front gable, once for the back) so
 * the house ridge reads as a properly trimmed Victorian gable.
 */
function buildGableOculus(
  f: NodeFactory,
  pos: [number, number, number],
  yaw: number,
): SceneNode {
  const trim = std(C.copperPatina, 0.55, {
    texture: "copper-patina",
    textureScale: [2, 1],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.04,
    metalness: 0.35,
  });
  const glass: MaterialDef = {
    color: C.oculusGlass,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.55,
  };
  const trimR = 0.36;
  const glassR = 0.28;
  const parts: SceneNode[] = [
    // Copper-patina trim disc — a thin disc behind the glass, sized
    // wider than the glass so its rim shows as a ring around the pane.
    f.mesh("Oculus Trim", cylinder(trimR, trimR, 0.05, 28), trim, {
      position: [0, 0, -0.03],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
    // Tinted glass disc, slightly proud of the trim so the rim is visible.
    f.mesh("Oculus Glass", cylinder(glassR, glassR, 0.04, 28), glass, {
      position: [0, 0, 0.005],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
    // Cross muntins — two slim trim bars forming a + over the glass.
    f.mesh("Muntin H", box(glassR * 2, 0.025, 0.04), trim, {
      position: [0, 0, 0.035],
    }, { castShadow: false }),
    f.mesh("Muntin V", box(0.025, glassR * 2, 0.04), trim, {
      position: [0, 0, 0.035],
    }, { castShadow: false }),
    // Central trim boss covering the cross intersection.
    f.mesh("Muntin Boss", sphere(0.05, 10, 7), trim, {
      position: [0, 0, 0.06],
    }, { castShadow: false }),
  ];
  return f.group("Gable Oculus", parts, { position: pos, rotation: [0, yaw, 0] });
}

/** Pair of gable oculus windows — one centred in the front gable, one in the back. */
function buildGableOculi(f: NodeFactory): SceneNode {
  return f.group("Gable Oculi", [
    buildGableOculus(f, FRONT_OCULUS_POS, 0),
    buildGableOculus(f, BACK_OCULUS_POS, Math.PI),
  ]);
}

/* ─────────────── fourteenth-pass scene extension ─────────────── */

/**
 * Southeast olive grove ground plane and props — mirrors the side orchard's
 * east edge with a Mediterranean character. Carries an olive-grove ground
 * surface (with companion depth map), a dry-stone retaining wall along the
 * orchard join, a grove of silver-leaved olive trees, a south-corner cluster
 * of clay amphora urns and a focal stone millstone wheel.
 */
function buildSoutheastOliveGrove(f: NodeFactory): SceneNode {
  return f.group("Southeast Olive Grove", [
    // Olive grove ground plane — sun-bleached khaki earth with the new
    // `olive-grove` colour map paired with a pebble depth map so the
    // scattered olive pits and pale pebbles read as relief at glancing sun.
    f.mesh(
      "Olive Grove Ground",
      plane(OLIVE_GROVE_W, OLIVE_GROVE_D),
      std(C.oliveGround, 0.95, {
        texture: "olive-grove",
        textureScale: [4, 6],
        bumpMap: "olive-grove-bump",
        bumpScale: 0.04,
      }),
      { position: OLIVE_GROVE_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // West apron — overlaps the side orchard's east edge with a strip of
    // orchard-grass tone so the join feathers into the orchard's pasture.
    f.mesh(
      "Olive Grove West Apron",
      plane(2.4, OLIVE_GROVE_D),
      std(C.orchardGrass, 0.95, { texture: "grass", textureScale: [1, 12] }),
      {
        position: [
          OLIVE_GROVE_POS[0] - OLIVE_GROVE_W / 2 + 1.2,
          -0.01,
          OLIVE_GROVE_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildOliveGroveWall(f),
    buildOliveTrees(f),
    buildAmphoraCluster(f, AMPHORA_CLUSTER_POS),
    buildOliveMillstone(f, OLIVE_MILLSTONE_POS),
  ]);
}

/**
 * Dry-stone retaining wall along the olive grove's west edge — two courses
 * of irregular field stones capped by a wider course of flat capstones. A
 * 1.4-unit gap in the middle lets a doll walk between the orchard and the
 * olive grove.
 */
function buildOliveGroveWall(f: NodeFactory): SceneNode {
  const stone = std(C.oliveWallStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.oliveWallStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const capstone = std(C.oliveWallStoneDark, 0.92, { flatShading: true });
  const rng = mulberry32(0x017ec01e);
  const zMin = OLIVE_GROVE_POS[2] - OLIVE_GROVE_D / 2 + 1;
  const zMax = OLIVE_GROVE_POS[2] + OLIVE_GROVE_D / 2 - 1;
  const gapHalf = 0.7;
  const gapZ = OLIVE_GROVE_POS[2];
  const stones: Transform[] = [];
  const stonesDark: Transform[] = [];
  const courseHeights = [0.18, 0.45];
  for (const y of courseHeights) {
    let z = zMin;
    while (z < zMax) {
      const w = 0.42 + rng() * 0.36;
      if (Math.abs(z - gapZ) < gapHalf || Math.abs(z + w - gapZ) < gapHalf) {
        z += w;
        continue;
      }
      const inst: Transform = {
        position: [OLIVE_GROVE_WALL_X + (rng() - 0.5) * 0.1, y, z + w / 2],
        rotation: [0, rng() * 0.3 - 0.15, 0],
        scale: [w, 0.26, 0.4 + rng() * 0.16],
      };
      (rng() < 0.38 ? stonesDark : stones).push(inst);
      z += w * 0.97;
    }
  }
  const caps: Transform[] = [];
  let cz = zMin;
  while (cz < zMax) {
    const w = 0.55 + rng() * 0.3;
    if (Math.abs(cz - gapZ) < gapHalf || Math.abs(cz + w - gapZ) < gapHalf) {
      cz += w;
      continue;
    }
    caps.push({
      position: [OLIVE_GROVE_WALL_X, 0.62, cz + w / 2],
      rotation: [0, rng() * 0.18 - 0.09, 0],
      scale: [w, 0.1, 0.58],
    });
    cz += w * 0.99;
  }
  return f.group("Olive Grove Wall", [
    f.instanced("Wall Stones", box(1, 1, 1), stone, stones, {
      castShadow: true, receiveShadow: true,
    }),
    f.instanced("Wall Stones Dark", box(1, 1, 1), stoneDark, stonesDark, {
      castShadow: true, receiveShadow: true,
    }),
    f.instanced("Wall Capstones", box(1, 1, 1), capstone, caps, {
      castShadow: true, receiveShadow: true,
    }),
  ]);
}

/**
 * A grove of six silver-leaved olive trees with gnarled twin trunks. Each
 * tree pairs two leaning trunks meeting at a low canopy, with three overlapping
 * silvered-green foliage spheres and a sparse scatter of dark olive fruits.
 * Layouts are deterministic and route around the wall, the amphora cluster
 * and the central millstone.
 */
function buildOliveTrees(f: NodeFactory): SceneNode {
  const trunk = std(C.oliveTrunk, 0.95, { texture: "bark", textureScale: [1, 2], flatShading: true });
  const trunkShade = std(C.oliveTrunkShade, 0.95, { flatShading: true });
  const foliage = std(C.oliveFoliage, 0.85, { flatShading: true });
  const foliageSilver = std(C.oliveFoliageSilver, 0.8, { flatShading: true });
  const fruitDark = std(C.oliveFruitDark, 0.6, { flatShading: false });
  const fruitRipe = std(C.oliveFruitRipe, 0.6, { flatShading: false });
  // Deterministic positions inside the grove, all comfortably east of the wall.
  const layouts: { x: number; z: number; s: number; r: number }[] = [
    { x: 45, z: -6, s: 1.0, r: 0.3 },
    { x: 47, z: 2, s: 1.1, r: -0.2 },
    { x: 46, z: 11, s: 0.95, r: 0.8 },
    { x: 53, z: -3, s: 1.05, r: 1.4 },
    { x: 55, z: 7, s: 1.15, r: -0.5 },
    { x: 57, z: -8, s: 0.9, r: 2.1 },
  ];
  const trees: SceneNode[] = [];
  for (let i = 0; i < layouts.length; i++) {
    const lay = layouts[i]!;
    const rng = mulberry32(0x017e0 + i * 23);
    const parts: SceneNode[] = [
      // Lower base / root ball — squat darker mound at ground.
      f.mesh("Root Ball", sphere(0.32, 10, 7), trunkShade, {
        position: [0, 0.12, 0],
        scale: [1.2, 0.4, 1.2],
      }, { castShadow: true, receiveShadow: true }),
      // Twin trunks — two cylinders leaning slightly outward.
      f.mesh("Trunk L", cylinder(0.1, 0.14, 0.95, 7), trunk, {
        position: [-0.1, 0.55, 0],
        rotation: [0, 0, 0.16],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Trunk R", cylinder(0.09, 0.13, 1.0, 7), trunk, {
        position: [0.11, 0.55, 0.05],
        rotation: [0.05, 0, -0.18],
      }, { castShadow: true, receiveShadow: true }),
      // A gnarled knot where the trunks meet — a small darker bulge.
      f.mesh("Trunk Knot", sphere(0.18, 10, 7), trunkShade, {
        position: [0, 1.02, 0],
        scale: [1.1, 0.7, 1.1],
      }, { castShadow: true }),
      // Three overlapping silver-green foliage canopies — softer than the
      // apple trees, flatter and broader for a Mediterranean silhouette.
      f.mesh("Canopy A", sphere(0.78, 12, 9), foliageSilver, {
        position: [0, 1.6, 0],
        scale: [1.2, 0.7, 1.2],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Canopy B", sphere(0.62, 12, 9), foliage, {
        position: [0.32, 1.85, -0.18],
        scale: [1.1, 0.6, 1.1],
      }, { castShadow: true }),
      f.mesh("Canopy C", sphere(0.55, 12, 9), foliageSilver, {
        position: [-0.34, 1.78, 0.22],
        scale: [1.05, 0.6, 1.05],
      }, { castShadow: true }),
    ];
    // A small sparse cloud of dark olive fruits inside the canopy.
    const fruitCount = 14;
    const fruitInstances: Transform[] = [];
    const fruitRipeInstances: Transform[] = [];
    for (let p = 0; p < fruitCount; p++) {
      const a = rng() * Math.PI * 2;
      const radius = 0.45 + rng() * 0.35;
      const fx = Math.cos(a) * radius;
      const fz = Math.sin(a) * radius * 0.85;
      const fy = 1.45 + rng() * 0.55;
      const inst: Transform = {
        position: [fx, fy, fz],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      };
      (rng() < 0.3 ? fruitRipeInstances : fruitInstances).push(inst);
    }
    parts.push(
      f.instanced("Olive Fruits", sphere(0.04, 6, 5), fruitDark, fruitInstances, {
        castShadow: false,
      }),
      f.instanced("Olive Fruits Ripe", sphere(0.04, 6, 5), fruitRipe, fruitRipeInstances, {
        castShadow: false,
      }),
    );
    trees.push(
      f.group(`Olive Tree ${i + 1}`, parts, {
        position: [lay.x, 0, lay.z],
        rotation: [0, lay.r, 0],
        scale: [lay.s, lay.s, lay.s],
      }),
    );
  }
  return f.group("Olive Trees", trees);
}

/**
 * A cluster of three clay amphora urns leaning against each other on a flat
 * slate base. Each amphora has a swelled body, a narrow neck and two small
 * handles. Used as a south-corner focal cluster in the olive grove.
 */
function buildAmphoraCluster(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const clay = std(C.amphoraClay, 0.85, { flatShading: false });
  const clayDark = std(C.amphoraClayDark, 0.9, { flatShading: true });
  const rim = std(C.amphoraRim, 0.9, { flatShading: true });
  const slate = std(C.slatePlate, 0.95, { texture: "cobblestone", flatShading: true });
  function amphora(
    name: string,
    x: number,
    z: number,
    tilt: number,
    rot: number,
    scale: number,
  ): SceneNode {
    const h = 0.95 * scale;
    return f.group(name, [
      // Pointed foot — a small cone tucked under the body.
      f.mesh("Amphora Foot", cone(0.06 * scale, 0.12 * scale, 6), clayDark, {
        position: [0, 0.06 * scale, 0],
        rotation: [Math.PI, 0, 0],
      }, { castShadow: true }),
      // Swelled body — a stretched sphere for the amphora belly.
      f.mesh("Amphora Body", sphere(0.22 * scale, 12, 8), clay, {
        position: [0, 0.38 * scale, 0],
        scale: [1.0, 1.4, 1.0],
      }, { castShadow: true, receiveShadow: true }),
      // Narrow neck — a short cylinder above the body.
      f.mesh("Amphora Neck", cylinder(0.1 * scale, 0.13 * scale, 0.22 * scale, 10), clay, {
        position: [0, h - 0.18 * scale, 0],
      }, { castShadow: true }),
      // Flared rim.
      f.mesh("Amphora Rim", cylinder(0.13 * scale, 0.11 * scale, 0.05 * scale, 10), rim, {
        position: [0, h - 0.04 * scale, 0],
      }, { castShadow: true }),
      // Two small handles arcing from neck to shoulder — each handle is a
      // short curved span approximated by three slim cylinders forming an
      // arch from the shoulder up to the neck.
      ...(["L", "R"] as const).flatMap((side) => {
        const sx = side === "L" ? -1 : 1;
        const topY = h - 0.14 * scale;
        const midY = h - 0.06 * scale;
        const baseY = h - 0.26 * scale;
        const handleX = sx * 0.18 * scale;
        const innerX = sx * 0.13 * scale;
        return [
          f.mesh(`Handle ${side} Lower`, cylinder(0.014 * scale, 0.014 * scale, 0.14 * scale, 5), clay, {
            position: [(handleX + innerX) / 2, (baseY + midY) / 2, 0],
            rotation: [0, 0, sx * 0.7],
          }, { castShadow: true }),
          f.mesh(`Handle ${side} Top`, cylinder(0.014 * scale, 0.014 * scale, 0.07 * scale, 5), clay, {
            position: [(handleX + innerX) / 2 + sx * 0.005 * scale, (midY + topY) / 2, 0],
            rotation: [0, 0, sx * -0.5],
          }, { castShadow: true }),
        ];
      }),
      // A faint dark drip down the body — paints a small weathering streak.
      f.mesh("Amphora Drip", box(0.018 * scale, 0.4 * scale, 0.018 * scale), clayDark, {
        position: [0.18 * scale, 0.45 * scale, 0],
      }, { castShadow: false }),
    ], { position: [x, 0, z], rotation: [tilt, rot, 0] });
  }
  return f.group("Amphora Cluster", [
    // Slate base plate that the amphorae rest on.
    f.mesh("Amphora Base", cylinder(0.55, 0.58, 0.08, 8), slate, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    // Three amphorae arranged in a small triangle, one leaning against another.
    amphora("Amphora A", -0.18, 0.05, 0, 0.2, 1.0),
    amphora("Amphora B", 0.18, -0.04, -0.18, 1.1, 0.92),
    amphora("Amphora C", 0.04, 0.22, 0.06, 2.4, 1.05),
  ], { position: pos });
}

/**
 * An old olive-press millstone — a stout stone disc with a darker recess
 * around its central hub, resting flat on a wider slate base ringed with a
 * few decorative pebbles. Reads as a Mediterranean garden focal piece.
 */
function buildOliveMillstone(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.millstoneStone, 0.95, { texture: "cobblestone", textureScale: [1, 1], flatShading: false });
  const stoneDark = std(C.millstoneCenter, 0.95, { flatShading: true });
  const slate = std(C.millstoneBase, 0.95, { texture: "cobblestone", flatShading: true });
  const pebble = std(C.dryStone, 0.95, { flatShading: true });
  const parts: SceneNode[] = [
    // Wider slate base plate.
    f.mesh("Millstone Base", cylinder(0.85, 0.9, 0.1, 14), slate, {
      position: [0, 0.05, 0],
    }, { receiveShadow: true }),
    // The millstone disc itself — a stout broad cylinder lying flat.
    f.mesh("Millstone Disc", cylinder(0.6, 0.62, 0.22, 16), stone, {
      position: [0, 0.21, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Central recessed hub — a smaller dark disc sitting on top.
    f.mesh("Millstone Hub", cylinder(0.14, 0.16, 0.06, 10), stoneDark, {
      position: [0, 0.35, 0],
    }, { castShadow: true }),
    // A radial groove worn across the disc — slim dark band.
    f.mesh("Millstone Groove", box(1.2, 0.02, 0.05), stoneDark, {
      position: [0, 0.32, 0],
      rotation: [0, 0.3, 0],
    }, { castShadow: false }),
  ];
  // A ring of small decorative pebbles around the slate base.
  const pebbleCount = 9;
  const pebbleInstances: Transform[] = [];
  const rng = mulberry32(0x017e51c);
  for (let i = 0; i < pebbleCount; i++) {
    const a = (i / pebbleCount) * Math.PI * 2 + rng() * 0.15;
    const r = 0.95 + rng() * 0.12;
    pebbleInstances.push({
      position: [Math.cos(a) * r, 0.08, Math.sin(a) * r],
      rotation: [0, rng() * Math.PI, 0],
      scale: [0.18 + rng() * 0.08, 0.1, 0.18 + rng() * 0.08],
    });
  }
  parts.push(
    f.instanced("Millstone Pebbles", sphere(1, 8, 6), pebble, pebbleInstances, {
      castShadow: true, receiveShadow: true,
    }),
  );
  return f.group("Olive Millstone", parts, { position: pos });
}

/* ─────────────── fifteenth-pass courtyard props ─────────────── */

/**
 * A pair of cedar Adirondack chairs facing each other across a small
 * slatted side table. Each chair is built from a back panel of seven
 * vertical slats, a sloped seat plank, two flared armrests on short
 * supports and four legs. A side table between them carries a lemonade
 * pitcher and two short glasses for an outdoor-living tableau.
 */
function buildAdirondackPair(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const cedar = std(C.adirondackCedar, 0.85, { texture: "wood", textureScale: [0.6, 1.2] });
  const cedarDark = std(C.adirondackCedarDark, 0.9, { texture: "wood", textureScale: [0.6, 1.2] });
  const seat = std(C.adirondackSeat, 0.85, { texture: "wood", textureScale: [0.5, 1.2] });
  const glass: MaterialDef = {
    color: C.lemonadeGlass,
    roughness: 0.2,
    metalness: 0.15,
    transparent: true,
    opacity: 0.65,
  };
  const lemon = std(C.lemonadeYellow, 0.55);
  function chair(yaw: number, sx: number): SceneNode {
    const parts: SceneNode[] = [];
    // Four chair legs — front pair short, back pair taller to support
    // the high back panel.
    parts.push(
      f.mesh("Leg FL", box(0.05, 0.32, 0.05), cedarDark, {
        position: [-0.28, 0.16, 0.36],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Leg FR", box(0.05, 0.32, 0.05), cedarDark, {
        position: [0.28, 0.16, 0.36],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Leg BL", box(0.05, 0.46, 0.05), cedarDark, {
        position: [-0.28, 0.23, -0.32],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Leg BR", box(0.05, 0.46, 0.05), cedarDark, {
        position: [0.28, 0.23, -0.32],
      }, { castShadow: true, receiveShadow: true }),
    );
    // Seat — a sloped plank that tilts down at the back, supported by
    // the rear edge of the leg block.
    parts.push(
      f.mesh("Seat Plank", box(0.66, 0.04, 0.7), seat, {
        position: [0, 0.36, 0.02],
        rotation: [-0.12, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      // A short front rail under the seat.
      f.mesh("Seat Front Rail", box(0.66, 0.05, 0.05), cedarDark, {
        position: [0, 0.32, 0.36],
      }, { castShadow: true }),
    );
    // Back panel — five vertical slats fanning out slightly at the top.
    const slatCount = 5;
    const backY = 0.7;
    for (let i = 0; i < slatCount; i++) {
      const t = (i - (slatCount - 1) / 2) / ((slatCount - 1) / 2);
      const fan = t * 0.06;
      parts.push(
        f.mesh(`Back Slat ${i}`, box(0.08, 0.6, 0.03), cedar, {
          position: [t * 0.24, backY, -0.32],
          rotation: [-0.16, fan, 0],
        }, { castShadow: true }),
      );
    }
    // Top crest rail joining the back slats.
    parts.push(
      f.mesh("Back Crest", box(0.66, 0.06, 0.04), cedarDark, {
        position: [0, 0.96, -0.36],
        rotation: [-0.16, 0, 0],
      }, { castShadow: true }),
    );
    // Two flared armrests resting on a short upright on each side.
    for (const side of [-1, 1] as const) {
      parts.push(
        f.mesh("Arm Support", box(0.05, 0.16, 0.05), cedarDark, {
          position: [side * 0.32, 0.44, 0.16],
        }, { castShadow: true }),
        f.mesh("Armrest", box(0.1, 0.04, 0.78), cedar, {
          position: [side * 0.34, 0.54, 0],
        }, { castShadow: true, receiveShadow: true }),
      );
    }
    return f.group("Adirondack Chair", parts, {
      position: [sx * 0.62, 0, 0],
      rotation: [0, yaw, 0],
    });
  }
  const parts: SceneNode[] = [
    // Two chairs facing each other along the X axis.
    chair(-Math.PI / 2, -1),
    chair(Math.PI / 2, 1),
    // Slatted side table sitting between the chairs.
    f.mesh("Table Top", box(0.4, 0.04, 0.5), seat, {
      position: [0, 0.34, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Three slats running across the top for a slatted look.
    f.mesh("Table Slat L", box(0.4, 0.05, 0.12), cedarDark, {
      position: [0, 0.355, -0.16],
    }, { castShadow: false }),
    f.mesh("Table Slat C", box(0.4, 0.05, 0.12), cedarDark, {
      position: [0, 0.355, 0],
    }, { castShadow: false }),
    f.mesh("Table Slat R", box(0.4, 0.05, 0.12), cedarDark, {
      position: [0, 0.355, 0.16],
    }, { castShadow: false }),
    // Four legs.
    f.mesh("Table Leg FL", box(0.04, 0.32, 0.04), cedarDark, {
      position: [-0.16, 0.16, 0.2],
    }, { castShadow: true }),
    f.mesh("Table Leg FR", box(0.04, 0.32, 0.04), cedarDark, {
      position: [0.16, 0.16, 0.2],
    }, { castShadow: true }),
    f.mesh("Table Leg BL", box(0.04, 0.32, 0.04), cedarDark, {
      position: [-0.16, 0.16, -0.2],
    }, { castShadow: true }),
    f.mesh("Table Leg BR", box(0.04, 0.32, 0.04), cedarDark, {
      position: [0.16, 0.16, -0.2],
    }, { castShadow: true }),
    // Lemonade pitcher — a small frosted cylinder with a yellow drink core
    // and a tiny handle box on its side.
    f.mesh("Pitcher Body", cylinder(0.075, 0.085, 0.22, 12), glass, {
      position: [0, 0.47, -0.08],
    }, { castShadow: true }),
    f.mesh("Pitcher Drink", cylinder(0.066, 0.076, 0.18, 12), lemon, {
      position: [0, 0.46, -0.08],
    }, { castShadow: false }),
    f.mesh("Pitcher Handle", box(0.02, 0.12, 0.02), glass, {
      position: [0.08, 0.49, -0.08],
    }, { castShadow: false }),
    // Two short tumbler glasses with a faint yellow fill.
    f.mesh("Glass A Body", cylinder(0.04, 0.045, 0.1, 10), glass, {
      position: [0.1, 0.41, 0.1],
    }, { castShadow: true }),
    f.mesh("Glass A Fill", cylinder(0.035, 0.04, 0.07, 10), lemon, {
      position: [0.1, 0.4, 0.1],
    }, { castShadow: false }),
    f.mesh("Glass B Body", cylinder(0.04, 0.045, 0.1, 10), glass, {
      position: [-0.1, 0.41, 0.1],
    }, { castShadow: true }),
    f.mesh("Glass B Fill", cylinder(0.035, 0.04, 0.07, 10), lemon, {
      position: [-0.1, 0.4, 0.1],
    }, { castShadow: false }),
  ];
  return f.group("Adirondack Pair", parts, { position: pos, rotation: [0, Math.PI / 6, 0] });
}

/**
 * A tall ornamental cascading-flower urn on a fluted stone pedestal — a
 * broad terracotta urn brimming with overflowing foliage and a sparse
 * mix of coral, yellow and cream bloom dabs that cascade over the rim.
 * Used as a focal piece on the south lawn near the path's first bend.
 */
function buildCascadeUrn(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const clay = std(C.cascadeUrnClay, 0.85, { texture: "burlap", textureScale: [1, 1] });
  const clayDark = std(C.cascadeUrnClayDark, 0.9, { flatShading: true });
  const pedestal = std(C.cascadeUrnPedestal, 0.95, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.03,
    flatShading: false,
  });
  const pedestalDark = std(C.cascadeUrnPedestalDark, 0.95, { flatShading: true });
  const foliage = std(C.cascadeFoliage, 0.85, { flatShading: true });
  const foliageDark = std(C.cascadeFoliageDark, 0.9, { flatShading: true });
  const bloomCoral = std(C.cascadeBloomCoral, 0.6);
  const bloomYellow = std(C.cascadeBloomYellow, 0.6);
  const bloomWhite = std(C.cascadeBloomWhite, 0.6);
  const parts: SceneNode[] = [];
  // Pedestal — square footing, fluted column shaft and a capital cap.
  parts.push(
    f.mesh("Pedestal Footing", box(0.62, 0.1, 0.62), pedestalDark, {
      position: [0, 0.05, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Pedestal Base", box(0.5, 0.08, 0.5), pedestal, {
      position: [0, 0.14, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Pedestal Shaft", cylinder(0.18, 0.21, 0.7, 12), pedestal, {
      position: [0, 0.54, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Six slim flute recess columns around the shaft.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      f.mesh("Flute", cylinder(0.02, 0.024, 0.62, 5), pedestalDark, {
        position: [Math.sin(a) * 0.19, 0.55, Math.cos(a) * 0.19],
      }, { castShadow: false }),
    );
  }
  parts.push(
    f.mesh("Pedestal Capital", box(0.5, 0.08, 0.5), pedestal, {
      position: [0, 0.94, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Pedestal Cap", box(0.34, 0.04, 0.34), pedestalDark, {
      position: [0, 1.0, 0],
    }, { castShadow: true }),
  );
  // Urn body — a swelled terracotta vessel with a flared rim and a
  // darker drip wash along the lower belly.
  const urnY = 1.18;
  parts.push(
    f.mesh("Urn Foot", cylinder(0.13, 0.16, 0.08, 12), clayDark, {
      position: [0, urnY - 0.16, 0],
    }, { castShadow: true }),
    f.mesh("Urn Belly", sphere(0.28, 14, 10), clay, {
      position: [0, urnY, 0],
      scale: [1.0, 0.85, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Urn Neck", cylinder(0.22, 0.24, 0.16, 14), clay, {
      position: [0, urnY + 0.24, 0],
    }, { castShadow: true }),
    f.mesh("Urn Rim", cylinder(0.27, 0.24, 0.05, 14), clayDark, {
      position: [0, urnY + 0.34, 0],
    }, { castShadow: true }),
    // A faint weathering streak down the belly.
    f.mesh("Urn Drip", box(0.022, 0.32, 0.022), clayDark, {
      position: [0.22, urnY - 0.05, 0],
    }, { castShadow: false }),
  );
  // Foliage mound — three overlapping flattened spheres on top of the urn
  // with the canopy spilling slightly past the rim.
  const foliageY = urnY + 0.45;
  parts.push(
    f.mesh("Foliage Crown", sphere(0.32, 14, 10), foliage, {
      position: [0, foliageY, 0],
      scale: [1.2, 0.9, 1.2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Foliage Inner", sphere(0.26, 12, 9), foliageDark, {
      position: [0, foliageY + 0.04, 0],
      scale: [1.0, 0.8, 1.0],
    }, { castShadow: true }),
    f.mesh("Foliage Side L", sphere(0.22, 12, 9), foliage, {
      position: [-0.22, foliageY - 0.04, 0.1],
      scale: [1.0, 0.7, 1.0],
    }, { castShadow: true }),
    f.mesh("Foliage Side R", sphere(0.22, 12, 9), foliageDark, {
      position: [0.22, foliageY - 0.06, -0.1],
      scale: [1.0, 0.7, 1.0],
    }, { castShadow: true }),
  );
  // Bloom dabs — sparse instanced spheres in three colours scattered across
  // the foliage crown for a cottage-garden cascade.
  const coralInstances: Transform[] = [];
  const yellowInstances: Transform[] = [];
  const whiteInstances: Transform[] = [];
  const bloomRng = mulberry32(0x015abf01);
  const bloomCount = 26;
  for (let i = 0; i < bloomCount; i++) {
    const a = bloomRng() * Math.PI * 2;
    const radius = 0.16 + bloomRng() * 0.22;
    const yOff = bloomRng() * 0.22;
    const inst: Transform = {
      position: [
        Math.cos(a) * radius,
        foliageY + 0.04 + yOff,
        Math.sin(a) * radius * 0.85,
      ],
      rotation: [0, bloomRng() * Math.PI, 0],
      scale: [1, 1, 1],
    };
    const which = bloomRng();
    if (which < 0.4) coralInstances.push(inst);
    else if (which < 0.75) yellowInstances.push(inst);
    else whiteInstances.push(inst);
  }
  // Cascading bloom dabs that spill below the rim — a few extras hanging
  // outside the urn's rim line.
  for (let i = 0; i < 8; i++) {
    const side = i / 8 * Math.PI * 2;
    const inst: Transform = {
      position: [
        Math.cos(side) * 0.28,
        foliageY - 0.18 - bloomRng() * 0.16,
        Math.sin(side) * 0.24,
      ],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    const which = bloomRng();
    if (which < 0.45) coralInstances.push(inst);
    else if (which < 0.78) yellowInstances.push(inst);
    else whiteInstances.push(inst);
  }
  parts.push(
    f.instanced("Coral Blooms", sphere(0.04, 6, 5), bloomCoral, coralInstances, {
      castShadow: false,
    }),
    f.instanced("Yellow Blooms", sphere(0.038, 6, 5), bloomYellow, yellowInstances, {
      castShadow: false,
    }),
    f.instanced("White Blooms", sphere(0.04, 6, 5), bloomWhite, whiteInstances, {
      castShadow: false,
    }),
  );
  return f.group("Cascade Urn", parts, { position: pos, rotation: [0, Math.PI / 5, 0] });
}

/* ─────────────── fifteenth-pass house detail ─────────────── */

/**
 * A verdigris brass door knocker mounted on the front wall beside the
 * arched doorway — a small square back plate with a hinged hoop ring
 * and a striker plate. Reuses the `copper-patina` colour + bump pair so
 * the metal shows crusted relief at glancing afternoon sun.
 */
function buildDoorKnocker(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const patina = std(C.copperPatina, 0.55, {
    texture: "copper-patina",
    textureScale: [1, 1],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.05,
    metalness: 0.45,
  });
  const plate = std(C.knockerPlate, 0.6, { metalness: 0.4 });
  const parts: SceneNode[] = [
    // Dark backplate against the wall, framing the knocker.
    f.mesh("Knocker Backplate", box(0.16, 0.16, 0.02), plate, {
      position: [0, 0, 0],
    }, { castShadow: true }),
    // Patina hinge mount — a small horizontal cap at the top of the plate.
    f.mesh("Knocker Mount", box(0.1, 0.04, 0.03), patina, {
      position: [0, 0.06, 0.02],
    }, { castShadow: true }),
    // Ring — a circle of eight small instanced segment boxes approximating
    // a hoop hanging from the mount.
  ];
  const ringR = 0.05;
  const segCount = 12;
  const seg = (Math.PI * 2 * ringR) / segCount;
  const ringInstances: Transform[] = [];
  // Place the ring just below the mount, hanging straight down.
  for (let i = 0; i < segCount; i++) {
    const a = (i / segCount) * Math.PI * 2;
    ringInstances.push({
      position: [Math.cos(a) * ringR, Math.sin(a) * ringR - 0.02, 0.025],
      rotation: [0, 0, a + Math.PI / 2],
      scale: [seg, 0.018, 0.018],
    });
  }
  parts.push(
    f.instanced("Knocker Ring", box(1, 1, 1), patina, ringInstances, {
      castShadow: true,
    }),
    // Striker stud — a small bump on the backplate beneath the ring where
    // the ring lands when knocked.
    f.mesh("Knocker Striker", sphere(0.013, 8, 6), patina, {
      position: [0, -0.08, 0.025],
    }, { castShadow: false }),
  );
  return f.group("Door Knocker", parts, { position: pos });
}

/**
 * A small house number plaque mounted on the front wall above the door
 * knocker — a stained-pine board with three carved-out copper numerals.
 */
function buildHousePlaque(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const pine = std(C.plaquePine, 0.85, { texture: "wood", textureScale: [0.6, 1] });
  const trim = std(C.copperPatina, 0.55, {
    texture: "copper-patina",
    textureScale: [1, 1],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.04,
    metalness: 0.35,
  });
  const text = std(C.plaqueText, 0.7);
  const parts: SceneNode[] = [
    // Plaque body — a small horizontal pine board.
    f.mesh("Plaque Body", box(0.32, 0.14, 0.025), pine, {
      position: [0, 0, 0],
    }, { castShadow: true }),
    // Patina trim border — a slightly larger frame behind the body.
    f.mesh("Plaque Trim", box(0.36, 0.18, 0.018), trim, {
      position: [0, 0, -0.01],
    }, { castShadow: true }),
    // Two patina trim screw bosses at the corners.
    f.mesh("Plaque Screw L", sphere(0.012, 6, 5), trim, {
      position: [-0.15, 0.07, 0.01],
    }, { castShadow: false }),
    f.mesh("Plaque Screw R", sphere(0.012, 6, 5), trim, {
      position: [0.15, 0.07, 0.01],
    }, { castShadow: false }),
    f.mesh("Plaque Screw BL", sphere(0.012, 6, 5), trim, {
      position: [-0.15, -0.07, 0.01],
    }, { castShadow: false }),
    f.mesh("Plaque Screw BR", sphere(0.012, 6, 5), trim, {
      position: [0.15, -0.07, 0.01],
    }, { castShadow: false }),
    // Three carved-out numerals "1", "0", "1" represented as slim recessed
    // boxes — the leading 1 is a short vertical bar, the 0 is two ovals
    // approximated by slim boxes forming a rectangle, and the trailing 1
    // mirrors the leading one.
    f.mesh("Digit 1 L", box(0.018, 0.07, 0.012), text, {
      position: [-0.085, 0, 0.014],
    }, { castShadow: false }),
    // "0" - assembled as four thin segment boxes around an oval centre.
    f.mesh("Digit 0 Top", box(0.045, 0.018, 0.012), text, {
      position: [0, 0.025, 0.014],
    }, { castShadow: false }),
    f.mesh("Digit 0 Bottom", box(0.045, 0.018, 0.012), text, {
      position: [0, -0.025, 0.014],
    }, { castShadow: false }),
    f.mesh("Digit 0 Left", box(0.018, 0.07, 0.012), text, {
      position: [-0.022, 0, 0.014],
    }, { castShadow: false }),
    f.mesh("Digit 0 Right", box(0.018, 0.07, 0.012), text, {
      position: [0.022, 0, 0.014],
    }, { castShadow: false }),
    f.mesh("Digit 1 R", box(0.018, 0.07, 0.012), text, {
      position: [0.085, 0, 0.014],
    }, { castShadow: false }),
  ];
  return f.group("House Plaque", parts, { position: pos });
}

/** A small fitting group bundling the door knocker and house number plaque. */
function buildFrontDoorFittings(f: NodeFactory): SceneNode {
  return f.group("Front Door Fittings", [
    buildDoorKnocker(f, DOOR_KNOCKER_POS),
    buildHousePlaque(f, HOUSE_PLAQUE_POS),
  ]);
}

/* ─────────────── fifteenth-pass scene extension ─────────────── */

/**
 * Southwest lavender field ground plane and props — mirrors the southeast
 * olive grove's footprint on the west side of the lawn. Carries the new
 * `lavender-field` colour map paired with a row-crest depth map so the
 * bloom rows read as relief at glancing sun, a mirror dry-stone retaining
 * wall along the pond-garden edge, five rows of cultivated lavender
 * bushes, a south-corner cluster of straw bee skeps and a focal stone
 * watering trough with a weathered wooden flower cart at the north end.
 */
function buildSouthwestLavenderField(f: NodeFactory): SceneNode {
  return f.group("Southwest Lavender Field", [
    // Lavender field ground plane — cultivated sage earth surfaced with the
    // new colour + depth map pair.
    f.mesh(
      "Lavender Field Ground",
      plane(LAVENDER_FIELD_W, LAVENDER_FIELD_D),
      std(C.lavenderGround, 0.95, {
        texture: "lavender-field",
        textureScale: [4, 6],
        bumpMap: "lavender-field-bump",
        bumpScale: 0.04,
      }),
      { position: LAVENDER_FIELD_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // East apron — overlaps the pond garden's west edge with a pond-garden
    // grass tone so the join feathers cleanly under raking light.
    f.mesh(
      "Lavender Field East Apron",
      plane(2.4, LAVENDER_FIELD_D),
      std(C.pondGardenGrass, 0.95, { texture: "grass", textureScale: [1, 12] }),
      {
        position: [
          LAVENDER_FIELD_POS[0] + LAVENDER_FIELD_W / 2 - 1.2,
          -0.01,
          LAVENDER_FIELD_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildLavenderWall(f),
    buildLavenderRows(f),
    buildBeeSkepCluster(f, BEE_SKEP_CLUSTER_POS),
    buildStoneTrough(f, STONE_TROUGH_POS),
    buildFlowerCart(f, FLOWER_CART_POS),
  ]);
}

/**
 * Mirror dry-stone retaining wall along the lavender field's east edge —
 * two courses of irregular field stones capped by a wider course of flat
 * capstones, with a 1.4-unit gap in the middle for a doll-width passage
 * between the pond garden and the lavender field.
 */
function buildLavenderWall(f: NodeFactory): SceneNode {
  const stone = std(C.dryStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.dryStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const capstone = std(C.dryStoneDark, 0.92, { flatShading: true });
  const rng = mulberry32(0x015b9a01);
  const zMin = LAVENDER_FIELD_POS[2] - LAVENDER_FIELD_D / 2 + 1;
  const zMax = LAVENDER_FIELD_POS[2] + LAVENDER_FIELD_D / 2 - 1;
  const gapHalf = 0.7;
  const gapZ = LAVENDER_FIELD_POS[2];
  const stones: Transform[] = [];
  const stonesDark: Transform[] = [];
  const courseHeights = [0.18, 0.45];
  for (const y of courseHeights) {
    let z = zMin;
    while (z < zMax) {
      const w = 0.42 + rng() * 0.36;
      if (Math.abs(z - gapZ) < gapHalf || Math.abs(z + w - gapZ) < gapHalf) {
        z += w;
        continue;
      }
      const inst: Transform = {
        position: [LAVENDER_WALL_X + (rng() - 0.5) * 0.1, y, z + w / 2],
        rotation: [0, rng() * 0.3 - 0.15, 0],
        scale: [w, 0.26, 0.4 + rng() * 0.16],
      };
      (rng() < 0.38 ? stonesDark : stones).push(inst);
      z += w * 0.97;
    }
  }
  const caps: Transform[] = [];
  let cz = zMin;
  while (cz < zMax) {
    const w = 0.55 + rng() * 0.3;
    if (Math.abs(cz - gapZ) < gapHalf || Math.abs(cz + w - gapZ) < gapHalf) {
      cz += w;
      continue;
    }
    caps.push({
      position: [LAVENDER_WALL_X, 0.62, cz + w / 2],
      rotation: [0, rng() * 0.18 - 0.09, 0],
      scale: [w, 0.1, 0.58],
    });
    cz += w * 0.99;
  }
  return f.group("Lavender Field Wall", [
    f.instanced("Wall Stones", box(1, 1, 1), stone, stones, {
      castShadow: true, receiveShadow: true,
    }),
    f.instanced("Wall Stones Dark", box(1, 1, 1), stoneDark, stonesDark, {
      castShadow: true, receiveShadow: true,
    }),
    f.instanced("Wall Capstones", box(1, 1, 1), capstone, caps, {
      castShadow: true, receiveShadow: true,
    }),
  ]);
}

/**
 * Five rows of cultivated lavender bushes spanning the field. Each bush
 * is a low silver-green dome topped by a denser ring of purple bloom
 * spheres so the row reads as a cushion of lavender heads at distance.
 * Rows route around the wall, the south-corner bee-skep cluster, the
 * central watering trough and the north-corner flower cart.
 */
function buildLavenderRows(f: NodeFactory): SceneNode {
  const foliage = std(C.lavenderBush, 0.85, { flatShading: true });
  const foliageDark = std(C.lavenderBushDark, 0.9, { flatShading: true });
  const bloom = std(C.lavenderBloom, 0.6, { flatShading: false });
  const bloomDark = std(C.lavenderBloomDark, 0.7, { flatShading: false });
  const bloomHi = std(C.lavenderBloomHi, 0.55, { flatShading: false });
  const rng = mulberry32(0x015b1ea2);
  const rowCount = 5;
  const rowSpacing = 1.5;
  const xCenter = LAVENDER_FIELD_POS[0] - 2.5;
  const bushPerRow = 7;
  const groups: SceneNode[] = [];
  // Keep-out radii for the props that sit on the field, to skip bushes that
  // would overlap them.
  const keepOuts: { x: number; z: number; r: number }[] = [
    { x: BEE_SKEP_CLUSTER_POS[0], z: BEE_SKEP_CLUSTER_POS[2], r: 1.6 },
    { x: STONE_TROUGH_POS[0], z: STONE_TROUGH_POS[2], r: 1.4 },
    { x: FLOWER_CART_POS[0], z: FLOWER_CART_POS[2], r: 1.8 },
  ];
  const allBushInstances: Transform[] = [];
  const allBushDarkInstances: Transform[] = [];
  const allBloomInstances: Transform[] = [];
  const allBloomDarkInstances: Transform[] = [];
  const allBloomHiInstances: Transform[] = [];
  for (let r = 0; r < rowCount; r++) {
    const x = xCenter + (r - (rowCount - 1) / 2) * rowSpacing;
    for (let i = 0; i < bushPerRow; i++) {
      const t = (i - (bushPerRow - 1) / 2) / ((bushPerRow - 1) / 2);
      const z = LAVENDER_FIELD_POS[2] + t * 9;
      // Skip bushes that would clash with the keep-outs.
      let skip = false;
      for (const k of keepOuts) {
        const dx = x - k.x;
        const dz = z - k.z;
        if (dx * dx + dz * dz < k.r * k.r) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      const scale = 0.85 + rng() * 0.25;
      const rot = rng() * Math.PI * 2;
      // The cushion of the bush.
      allBushInstances.push({
        position: [x + (rng() - 0.5) * 0.1, 0.22 * scale, z + (rng() - 0.5) * 0.1],
        rotation: [0, rot, 0],
        scale: [0.45 * scale, 0.32 * scale, 0.45 * scale],
      });
      // A slightly darker shaded sub-bush sitting beneath.
      allBushDarkInstances.push({
        position: [x + (rng() - 0.5) * 0.08, 0.16 * scale, z + (rng() - 0.5) * 0.08],
        rotation: [0, rot + 0.3, 0],
        scale: [0.5 * scale, 0.2 * scale, 0.5 * scale],
      });
      // Purple bloom dabs crowning the top of the cushion.
      const dabCount = 8;
      for (let d = 0; d < dabCount; d++) {
        const a = (d / dabCount) * Math.PI * 2 + rng() * 0.2;
        const radius = 0.22 + rng() * 0.1;
        const inst: Transform = {
          position: [
            x + Math.cos(a) * radius * scale,
            0.42 * scale + rng() * 0.06,
            z + Math.sin(a) * radius * scale,
          ],
          rotation: [0, rng() * Math.PI, 0],
          scale: [1, 1, 1],
        };
        const which = rng();
        if (which < 0.55) allBloomInstances.push(inst);
        else if (which < 0.85) allBloomDarkInstances.push(inst);
        else allBloomHiInstances.push(inst);
      }
    }
  }
  groups.push(
    f.instanced("Lavender Cushions", sphere(1, 10, 7), foliage, allBushInstances, {
      castShadow: true, receiveShadow: true,
    }),
    f.instanced("Lavender Cushions Shade", sphere(1, 10, 7), foliageDark, allBushDarkInstances, {
      castShadow: true,
    }),
    f.instanced("Lavender Blooms", sphere(0.06, 6, 5), bloom, allBloomInstances, {
      castShadow: false,
    }),
    f.instanced("Lavender Blooms Dark", sphere(0.058, 6, 5), bloomDark, allBloomDarkInstances, {
      castShadow: false,
    }),
    f.instanced("Lavender Blooms Bright", sphere(0.062, 6, 5), bloomHi, allBloomHiInstances, {
      castShadow: false,
    }),
  );
  return f.group("Lavender Rows", groups);
}

/**
 * A trio of straw bee skeps — traditional dome-shaped beehives — on a
 * slate platform with a sparse scatter of fallen bloom petals around the
 * base. Each skep is a stack of three burlap-textured discs of decreasing
 * radius forming the characteristic coiled-rope dome silhouette, with a
 * small dark entry hole at the base front.
 */
function buildBeeSkepCluster(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const skep = std(C.beeSkep, 0.95, { texture: "burlap", textureScale: [0.6, 0.6] });
  const skepDark = std(C.beeSkepDark, 0.95, { flatShading: true });
  const entry = std(C.beeSkepEntry, 0.6);
  const slate = std(C.slatePlate, 0.95, { texture: "cobblestone", flatShading: true });
  function skepUnit(x: number, z: number, scale: number, yaw: number): SceneNode {
    const tiers = [
      { r: 0.32, h: 0.16 },
      { r: 0.26, h: 0.18 },
      { r: 0.2, h: 0.18 },
      { r: 0.12, h: 0.12 },
    ];
    const parts: SceneNode[] = [];
    let y = 0;
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i]!;
      parts.push(
        f.mesh(`Skep Tier ${i}`, cylinder(tier.r * 0.85, tier.r, tier.h, 12), skep, {
          position: [0, y + tier.h / 2, 0],
          scale: [scale, scale, scale],
        }, { castShadow: true, receiveShadow: true }),
      );
      y += tier.h * 0.9;
    }
    // A small crown finial on top.
    parts.push(
      f.mesh("Skep Crown", sphere(0.05, 8, 6), skepDark, {
        position: [0, y * scale + 0.04, 0],
      }, { castShadow: true }),
      // Dark entry hole at the bottom front.
      f.mesh("Skep Entry", box(0.06, 0.04, 0.02), entry, {
        position: [0, 0.06 * scale, tiers[0]!.r * scale * 0.85],
      }, { castShadow: false }),
    );
    return f.group("Bee Skep", parts, {
      position: [x, 0, z],
      rotation: [0, yaw, 0],
    });
  }
  return f.group("Bee Skep Cluster", [
    // Slate base plate the skeps stand on.
    f.mesh("Skep Base", cylinder(0.85, 0.9, 0.08, 12), slate, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    skepUnit(-0.35, 0.05, 1.0, 0.4),
    skepUnit(0.4, -0.1, 0.95, -0.3),
    skepUnit(0.05, 0.45, 0.9, 1.2),
  ], { position: pos });
}

/**
 * A focal antique stone watering trough on a slate plinth — a long,
 * weathered rectangular basin with a recessed water surface. A small
 * iron spigot lip at the south end suggests where the trough was
 * traditionally filled.
 */
function buildStoneTrough(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.troughStoneAged, 0.95, { texture: "cobblestone", textureScale: [1.2, 1], flatShading: false });
  const stoneDark = std(C.troughStoneAgedDark, 0.95, { flatShading: true });
  const water: MaterialDef = {
    color: C.troughInteriorWater,
    roughness: 0.32,
    metalness: 0.18,
    transparent: true,
    opacity: 0.7,
  };
  const iron = std(C.gliderIron, 0.55, { metalness: 0.4 });
  const parts: SceneNode[] = [
    // Slate plinth — a wider flat base under the trough.
    f.mesh("Trough Plinth", box(1.7, 0.08, 0.85), stoneDark, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    // Trough outer body — a long rectangular block.
    f.mesh("Trough Body", box(1.5, 0.42, 0.65), stone, {
      position: [0, 0.29, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Recessed water basin — a slightly inset darker block carved into the
    // top of the body, with a translucent water surface on top.
    f.mesh("Trough Interior", box(1.34, 0.36, 0.49), stoneDark, {
      position: [0, 0.31, 0],
    }, { receiveShadow: true }),
    f.mesh("Trough Water", box(1.32, 0.04, 0.47), water, {
      position: [0, 0.47, 0],
    }, { castShadow: false, receiveShadow: false }),
    // End cap stones — short slim blocks tucked against the short ends
    // for a more shaped silhouette.
    f.mesh("Trough Cap L", box(0.08, 0.12, 0.7), stoneDark, {
      position: [-0.75, 0.54, 0],
    }, { castShadow: true }),
    f.mesh("Trough Cap R", box(0.08, 0.12, 0.7), stoneDark, {
      position: [0.75, 0.54, 0],
    }, { castShadow: true }),
    // Iron spigot lip rising at the south end — a small horizontal pipe
    // overhanging the basin.
    f.mesh("Spigot Riser", cylinder(0.03, 0.03, 0.45, 8), iron, {
      position: [-0.78, 0.7, 0.4],
    }, { castShadow: true }),
    f.mesh("Spigot Arm", cylinder(0.03, 0.03, 0.32, 8), iron, {
      position: [-0.66, 0.92, 0.4],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    f.mesh("Spigot Tip", cylinder(0.04, 0.022, 0.06, 8), iron, {
      position: [-0.52, 0.86, 0.4],
      rotation: [Math.PI, 0, 0],
    }, { castShadow: true }),
    // A thin water column dripping from the spigot to the basin.
    f.mesh("Water Drip", cylinder(0.012, 0.012, 0.32, 6), water, {
      position: [-0.52, 0.66, 0.4],
    }, { castShadow: false }),
  ];
  // A small mossy patch on the trough's north shoulder — short flattened
  // sphere in the foliage colour, suggesting wet stone microclimate.
  parts.push(
    f.mesh("Trough Moss", sphere(0.12, 8, 6), std(C.mossGreen, 0.85, { flatShading: true }), {
      position: [0.4, 0.52, -0.32],
      scale: [1, 0.4, 1],
    }, { castShadow: false }),
  );
  return f.group("Stone Trough", parts, { position: pos, rotation: [0, Math.PI / 12, 0] });
}

/**
 * A weathered wooden flower cart parked at the north corner of the
 * lavender field — a small two-wheeled hand cart loaded with cut
 * lavender bundles and a single coral bloom for colour. The cart's
 * wagon-bed sits on two spoked wheels with a short handle pole and a
 * faded red trim along its sideboards.
 */
function buildFlowerCart(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.flowerCartWood, 0.9, { texture: "wood", textureScale: [0.6, 1.2] });
  const woodDark = std(C.flowerCartWoodDark, 0.9, { texture: "wood", textureScale: [0.6, 1.2] });
  const trim = std(C.flowerCartTrim, 0.85);
  const wheel = std(C.flowerCartWheel, 0.9, { flatShading: true });
  const bloom = std(C.lavenderBloom, 0.6);
  const bloomDark = std(C.lavenderBloomDark, 0.7);
  const bloomCoral = std(C.cascadeBloomCoral, 0.6);
  const foliage = std(C.lavenderBush, 0.85, { flatShading: true });
  const parts: SceneNode[] = [
    // Cart bed — a shallow open box with a faded red top trim and
    // upturned end boards.
    f.mesh("Cart Bed Floor", box(1.4, 0.06, 0.7), wood, {
      position: [0, 0.55, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Cart Side Front", box(1.4, 0.18, 0.05), woodDark, {
      position: [0, 0.66, 0.34],
    }, { castShadow: true }),
    f.mesh("Cart Side Back", box(1.4, 0.18, 0.05), woodDark, {
      position: [0, 0.66, -0.34],
    }, { castShadow: true }),
    f.mesh("Cart End L", box(0.05, 0.24, 0.72), woodDark, {
      position: [-0.69, 0.7, 0],
    }, { castShadow: true }),
    f.mesh("Cart End R", box(0.05, 0.24, 0.72), woodDark, {
      position: [0.69, 0.7, 0],
    }, { castShadow: true }),
    // Faded red trim band along the top of the sideboards.
    f.mesh("Trim Front", box(1.42, 0.04, 0.06), trim, {
      position: [0, 0.77, 0.34],
    }, { castShadow: false }),
    f.mesh("Trim Back", box(1.42, 0.04, 0.06), trim, {
      position: [0, 0.77, -0.34],
    }, { castShadow: false }),
    // Two wagon wheels — flat spoked discs flanking the bed.
    f.mesh("Wheel L", cylinder(0.36, 0.36, 0.05, 14), wheel, {
      position: [0, 0.36, -0.42],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wheel R", cylinder(0.36, 0.36, 0.05, 14), wheel, {
      position: [0, 0.36, 0.42],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Wheel hubs — small dark caps on each wheel.
    f.mesh("Hub L", cylinder(0.08, 0.08, 0.07, 8), wood, {
      position: [0, 0.36, -0.4],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
    f.mesh("Hub R", cylinder(0.08, 0.08, 0.07, 8), wood, {
      position: [0, 0.36, 0.4],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  ];
  // Spokes — four per wheel, slim crossing rods.
  for (const z of [-0.42, 0.42] as const) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      parts.push(
        f.mesh(`Spoke ${z}-${i}`, box(0.62, 0.025, 0.025), woodDark, {
          position: [0, 0.36, z],
          rotation: [0, 0, a],
        }, { castShadow: false }),
      );
    }
  }
  // Handle pole — a long shaft extending from the front of the cart, with
  // a small grip cross-bar at its end.
  parts.push(
    f.mesh("Handle Pole", cylinder(0.025, 0.025, 1.0, 6), wood, {
      position: [0.94, 0.62, 0],
      rotation: [0, 0, -0.2],
    }, { castShadow: true }),
    f.mesh("Handle Grip", box(0.25, 0.04, 0.04), woodDark, {
      position: [1.38, 0.5, 0],
    }, { castShadow: true }),
  );
  // Cut-lavender bundles — three stacked elongated cushions of foliage
  // topped by a denser bloom strip, evoking harvested stalks tied for sale.
  function bundle(x: number, z: number, yaw: number): SceneNode[] {
    return [
      f.mesh("Bundle Stalks", box(0.36, 0.08, 0.16), foliage, {
        position: [x, 0.62, z],
        rotation: [0, yaw, 0],
      }, { castShadow: true }),
      f.mesh("Bundle Blooms", box(0.36, 0.06, 0.16), bloom, {
        position: [x, 0.7, z],
        rotation: [0, yaw, 0],
      }, { castShadow: false }),
      // A tiny darker bloom highlight along the bundle's crown.
      f.mesh("Bundle Bloom Hi", box(0.34, 0.025, 0.14), bloomDark, {
        position: [x, 0.73, z],
        rotation: [0, yaw, 0],
      }, { castShadow: false }),
    ];
  }
  parts.push(
    ...bundle(-0.42, 0.1, 0.1),
    ...bundle(0.05, -0.1, -0.18),
    ...bundle(0.45, 0.08, 0.24),
    // A single coral bloom for colour contrast on top of the bundles.
    f.mesh("Coral Bloom Pop", sphere(0.06, 8, 6), bloomCoral, {
      position: [0.05, 0.83, -0.05],
    }, { castShadow: false }),
  );
  return f.group("Flower Cart", parts, { position: pos, rotation: [0, -Math.PI / 5, 0] });
}

/* ─────────────── sixteenth-pass courtyard props ─────────────── */

/**
 * A Victorian garden gazing ball — a polished mirror-finish sphere
 * resting in a small iron cradle atop a swirling wrought-iron stand.
 * The stand is a stack of a flat slate footing, a slim shaft and four
 * C-curve scrolls arranged radially that fan up to hold the sphere. The
 * sphere uses a chrome-blue colour with high metalness and low roughness
 * so it reads as a reflective ornament from any approach angle.
 */
function buildGazingBall(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const iron = std(C.gazingBallBase, 0.45, { metalness: 0.5, flatShading: true });
  const ironHi = std(C.gliderIronHi, 0.45, { metalness: 0.5 });
  const slate = std(C.slatePlate, 0.95, { texture: "cobblestone", flatShading: true });
  const chrome: MaterialDef = {
    color: C.gazingBallChrome,
    roughness: 0.08,
    metalness: 0.95,
  };
  const chromeHi: MaterialDef = {
    color: C.gazingBallHi,
    roughness: 0.04,
    metalness: 1.0,
    emissive: "#1a2a36",
  };
  const parts: SceneNode[] = [
    // Slate footing — a small flat disc the stand rests on.
    f.mesh("Footing", cylinder(0.22, 0.24, 0.05, 14), slate, {
      position: [0, 0.025, 0],
    }, { receiveShadow: true }),
    // Decorative iron flange on top of the footing.
    f.mesh("Flange", cylinder(0.12, 0.14, 0.04, 12), iron, {
      position: [0, 0.07, 0],
    }, { castShadow: true }),
    // Central shaft — slim iron rod climbing from the flange.
    f.mesh("Shaft", cylinder(0.025, 0.025, 0.62, 8), iron, {
      position: [0, 0.4, 0],
    }, { castShadow: true }),
    // A pair of decorative iron rings stacked along the shaft.
    f.mesh("Ring Lo", cylinder(0.07, 0.07, 0.04, 12), iron, {
      position: [0, 0.18, 0],
    }, { castShadow: true }),
    f.mesh("Ring Mid", cylinder(0.06, 0.06, 0.035, 12), iron, {
      position: [0, 0.38, 0],
    }, { castShadow: true }),
  ];
  // Four C-curve scrolls fanning out from below the cradle — each curve
  // is approximated by a chain of three small slim boxes at increasing
  // angles, giving the silhouette of a wrought-iron scroll.
  const scrollSegs = [
    { y: 0.55, len: 0.16, tilt: -0.55 },
    { y: 0.66, len: 0.13, tilt: -0.95 },
    { y: 0.74, len: 0.1, tilt: -1.35 },
  ];
  for (let s = 0; s < 4; s++) {
    const yaw = (s / 4) * Math.PI * 2;
    for (const seg of scrollSegs) {
      const rx = Math.sin(yaw) * 0.12;
      const rz = Math.cos(yaw) * 0.12;
      parts.push(
        f.mesh(`Scroll ${s}-${seg.y}`, box(seg.len, 0.024, 0.024), iron, {
          position: [rx, seg.y, rz],
          rotation: [0, yaw + Math.PI / 2, seg.tilt],
        }, { castShadow: true }),
      );
    }
  }
  // Cradle disc — a small ring just below the sphere that visually
  // supports the orb.
  parts.push(
    f.mesh("Cradle", cylinder(0.1, 0.08, 0.05, 12), ironHi, {
      position: [0, 0.82, 0],
    }, { castShadow: true }),
    // Mirror-finish gazing sphere.
    f.mesh("Gazing Sphere", sphere(0.18, 24, 18), chrome, {
      position: [0, 1.0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A small bright highlight sphere offset inside the chrome ball so
    // the polished surface reads with a sun glint even on a flat-shaded
    // viewport.
    f.mesh("Sphere Glint", sphere(0.06, 12, 9), chromeHi, {
      position: [0.08, 1.08, 0.08],
    }, { castShadow: false }),
  );
  return f.group("Gazing Ball", parts, { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/**
 * A small stone cherub statue holding a basket of blooms — a classical
 * garden ornament on a low square plinth. The cherub is built from a
 * rounded torso sphere, a small head sphere, two squat leg cylinders, two
 * arm cylinders cradling a terracotta basket and a pair of folded wing
 * panels at the back. The basket carries a few pink and cream bloom dabs.
 */
function buildCherubStatue(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const marble = std(C.cherubMarble, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.025,
  });
  const marbleShade = std(C.cherubMarbleShade, 0.9, { flatShading: true });
  const basket = std(C.cherubBasket, 0.9, { texture: "burlap", textureScale: [0.6, 0.6] });
  const bloomPink = std(C.cherubBloomPink, 0.6);
  const bloomCream = std(C.cherubBloomCream, 0.6);
  const parts: SceneNode[] = [
    // Square plinth — a low stone block the cherub kneels on.
    f.mesh("Plinth Footing", box(0.52, 0.06, 0.52), marbleShade, {
      position: [0, 0.03, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Plinth Body", box(0.44, 0.28, 0.44), marble, {
      position: [0, 0.2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Plinth Cap", box(0.5, 0.04, 0.5), marbleShade, {
      position: [0, 0.36, 0],
    }, { castShadow: true }),
  ];
  const baseY = 0.38;
  // Two squat leg cylinders — the cherub kneels.
  parts.push(
    f.mesh("Leg L", cylinder(0.06, 0.07, 0.16, 10), marble, {
      position: [-0.08, baseY + 0.08, 0],
    }, { castShadow: true }),
    f.mesh("Leg R", cylinder(0.06, 0.07, 0.16, 10), marble, {
      position: [0.08, baseY + 0.08, 0],
    }, { castShadow: true }),
  );
  // Torso — a flattened sphere as a pudgy cherub body.
  parts.push(
    f.mesh("Torso", sphere(0.16, 14, 10), marble, {
      position: [0, baseY + 0.3, 0],
      scale: [1.0, 1.1, 0.95],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Head — a small round sphere atop the torso.
  parts.push(
    f.mesh("Head", sphere(0.12, 14, 10), marble, {
      position: [0, baseY + 0.5, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A small marble curl on top of the head — a stylised hair lock.
    f.mesh("Hair Curl", sphere(0.05, 10, 7), marbleShade, {
      position: [0, baseY + 0.59, -0.04],
    }, { castShadow: false }),
  );
  // Two arms cradling the basket out in front — slim cylinders angled
  // forward from the shoulders.
  parts.push(
    f.mesh("Arm L", cylinder(0.035, 0.035, 0.22, 8), marble, {
      position: [-0.13, baseY + 0.32, 0.1],
      rotation: [0.6, 0, 0.35],
    }, { castShadow: true }),
    f.mesh("Arm R", cylinder(0.035, 0.035, 0.22, 8), marble, {
      position: [0.13, baseY + 0.32, 0.1],
      rotation: [0.6, 0, -0.35],
    }, { castShadow: true }),
  );
  // Two folded wing panels at the back — small angled rounded boxes.
  parts.push(
    f.mesh("Wing L", box(0.04, 0.18, 0.1), marble, {
      position: [-0.12, baseY + 0.38, -0.1],
      rotation: [0.2, -0.25, 0.4],
    }, { castShadow: true }),
    f.mesh("Wing R", box(0.04, 0.18, 0.1), marble, {
      position: [0.12, baseY + 0.38, -0.1],
      rotation: [0.2, 0.25, -0.4],
    }, { castShadow: true }),
  );
  // Basket cradled in front — a small terracotta cylinder with a flared
  // rim, sitting in the cherub's arms.
  const basketY = baseY + 0.26;
  const basketZ = 0.2;
  parts.push(
    f.mesh("Basket Body", cylinder(0.085, 0.07, 0.1, 12), basket, {
      position: [0, basketY, basketZ],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Basket Rim", cylinder(0.095, 0.085, 0.025, 12), basket, {
      position: [0, basketY + 0.05, basketZ],
    }, { castShadow: true }),
  );
  // Bloom dabs in the basket — a small mound of pink and cream blooms
  // overflowing slightly past the rim.
  const blooms: { c: "p" | "c"; off: [number, number, number] }[] = [
    { c: "p", off: [0, 0.07, 0] },
    { c: "c", off: [-0.04, 0.08, 0.02] },
    { c: "p", off: [0.04, 0.08, -0.02] },
    { c: "c", off: [0.02, 0.075, 0.04] },
    { c: "p", off: [-0.03, 0.065, -0.04] },
    { c: "c", off: [-0.06, 0.06, 0.0] },
    { c: "p", off: [0.06, 0.06, 0.0] },
  ];
  for (const b of blooms) {
    parts.push(
      f.mesh(`Bloom`, sphere(0.025, 8, 6), b.c === "p" ? bloomPink : bloomCream, {
        position: [b.off[0], basketY + b.off[1], basketZ + b.off[2]],
      }, { castShadow: false }),
    );
  }
  return f.group("Cherub Statue", parts, { position: pos, rotation: [0, -Math.PI / 6, 0] });
}

/* ─────────────── sixteenth-pass house detail ─────────────── */

/**
 * A single climbing-rose trellis mounted flat against an exterior side
 * wall. The trellis is a lattice grid of slim painted slats (six
 * verticals crossed by five horizontals) framed by a slightly thicker
 * border. Climbing-rose vines snake up the lattice and a sparse scatter
 * of pink bloom dabs and leaf clusters reads as the climbing growth.
 *
 * `side` is the X-direction the trellis faces away from the wall — `+1`
 * for the east wall (faces east), `-1` for the west wall (faces west).
 */
function buildSideTrellis(
  f: NodeFactory,
  pos: [number, number, number],
  side: 1 | -1,
): SceneNode {
  const lattice = std(C.trellisLattice, 0.9, { texture: "wood", textureScale: [0.4, 1] });
  const latticeShade = std(C.trellisLatticeShade, 0.95, { flatShading: true });
  const leaf = std(C.trellisLeaf, 0.85, { flatShading: true });
  const leafDark = std(C.trellisLeafDark, 0.9, { flatShading: true });
  const rose = std(C.trellisRose, 0.6);
  const roseDark = std(C.trellisRoseDark, 0.7);
  const vine = std(C.pergolaWoodDark, 0.95, { flatShading: true });
  // Trellis lives in the YZ plane — width along Z (along the side wall),
  // height along Y. The face normal points in `side * +X` (toward the
  // outside of the house).
  const W_T = 2.4; // trellis width along Z
  const H_T = 2.4; // trellis height along Y
  const standoff = 0.04 * side; // small distance proud of the wall in +X / -X
  const slatT = 0.025;
  const parts: SceneNode[] = [];
  // Outer frame — four slats forming a rectangle.
  parts.push(
    f.mesh("Frame Top", box(slatT * 1.4, slatT * 1.4, W_T), latticeShade, {
      position: [standoff, H_T, 0],
    }, { castShadow: true }),
    f.mesh("Frame Bottom", box(slatT * 1.4, slatT * 1.4, W_T), latticeShade, {
      position: [standoff, 0.2, 0],
    }, { castShadow: true }),
    f.mesh("Frame L", box(slatT * 1.4, H_T - 0.2, slatT * 1.4), latticeShade, {
      position: [standoff, 0.2 + (H_T - 0.2) / 2, -W_T / 2],
    }, { castShadow: true }),
    f.mesh("Frame R", box(slatT * 1.4, H_T - 0.2, slatT * 1.4), latticeShade, {
      position: [standoff, 0.2 + (H_T - 0.2) / 2, W_T / 2],
    }, { castShadow: true }),
  );
  // Vertical slats (6) — slim painted columns across the trellis.
  const vCount = 6;
  for (let i = 0; i < vCount; i++) {
    const t = i / (vCount - 1) - 0.5;
    parts.push(
      f.mesh(`V ${i}`, box(slatT, H_T - 0.3, slatT), lattice, {
        position: [standoff, 0.25 + (H_T - 0.3) / 2, t * (W_T - 0.2)],
      }, { castShadow: true }),
    );
  }
  // Horizontal slats (5) — slim painted rails crossing the verticals.
  const hCount = 5;
  for (let i = 0; i < hCount; i++) {
    const t = i / (hCount - 1) - 0.5;
    parts.push(
      f.mesh(`H ${i}`, box(slatT, slatT, W_T - 0.18), lattice, {
        position: [standoff + 0.008 * side, H_T / 2 + t * (H_T - 0.5), 0],
      }, { castShadow: true }),
    );
  }
  // Two climbing-rose vines — slim dark wooden stems snaking up the
  // trellis in a gentle zig-zag. Each vine is approximated by a stack of
  // short box segments that step left/right as they rise.
  const vineXOff = standoff + 0.025 * side;
  function vineStem(zStart: number, segs: number): SceneNode[] {
    const out: SceneNode[] = [];
    let z = zStart;
    for (let i = 0; i < segs; i++) {
      const y = 0.3 + i * 0.18;
      const dz = (i % 2 === 0 ? 0.08 : -0.08) + (i % 3 === 0 ? 0.04 : -0.04);
      out.push(
        f.mesh(`Vine`, box(0.018, 0.2, 0.018), vine, {
          position: [vineXOff, y, z + dz / 2],
          rotation: [0, 0, dz > 0 ? 0.3 : -0.3],
        }, { castShadow: false }),
      );
      z += dz;
    }
    return out;
  }
  parts.push(...vineStem(-W_T / 2 + 0.35, 11));
  parts.push(...vineStem(W_T / 2 - 0.35, 11));
  // Leaf cluster + rose bloom instances — scattered up the trellis face.
  const rng = mulberry32(0x16ad11e5);
  const leafInst: Transform[] = [];
  const leafDarkInst: Transform[] = [];
  const roseInst: Transform[] = [];
  const roseDarkInst: Transform[] = [];
  const leafCount = 56;
  for (let i = 0; i < leafCount; i++) {
    const z = (rng() - 0.5) * (W_T - 0.2);
    const y = 0.3 + rng() * (H_T - 0.4);
    const inst: Transform = {
      position: [vineXOff + 0.018 * side, y, z],
      rotation: [0, rng() * Math.PI * 2, 0],
      scale: [1, 1, 1],
    };
    (rng() < 0.5 ? leafInst : leafDarkInst).push(inst);
  }
  // Roses — fewer than leaves, clustered toward the upper two-thirds of the
  // trellis for the classic climbing-rose silhouette.
  const roseCount = 22;
  for (let i = 0; i < roseCount; i++) {
    const z = (rng() - 0.5) * (W_T - 0.3);
    const y = 0.6 + rng() * (H_T - 0.8);
    const inst: Transform = {
      position: [vineXOff + 0.034 * side, y, z],
      rotation: [0, rng() * Math.PI * 2, 0],
      scale: [1, 1, 1],
    };
    (rng() < 0.7 ? roseInst : roseDarkInst).push(inst);
  }
  parts.push(
    f.instanced("Trellis Leaves", sphere(0.075, 8, 6), leaf, leafInst, {
      castShadow: false,
    }),
    f.instanced("Trellis Leaves Dark", sphere(0.07, 8, 6), leafDark, leafDarkInst, {
      castShadow: false,
    }),
    f.instanced("Trellis Roses", sphere(0.05, 8, 6), rose, roseInst, {
      castShadow: false,
    }),
    f.instanced("Trellis Roses Dark", sphere(0.045, 8, 6), roseDark, roseDarkInst, {
      castShadow: false,
    }),
  );
  return f.group("Side Trellis", parts, { position: pos });
}

/** Pair of climbing-rose trellises — one on the east wall, one on the west. */
function buildSideTrellises(f: NodeFactory): SceneNode {
  return f.group("Side Trellises", [
    buildSideTrellis(f, TRELLIS_E_POS, 1),
    buildSideTrellis(f, TRELLIS_W_POS, -1),
  ]);
}

/* ─────────────── sixteenth-pass scene extension ─────────────── */

/**
 * Far-north alpine foothills ground plane and props — reaches beyond the
 * lakefront's far edge with a snowy alpine character. Carries a new
 * `alpine-foothills` colour map paired with a snowdrift-and-scree depth
 * map so the drifts and rock heads read as raised relief at glancing sun,
 * a south lakefront-grass apron along the join, a small log cabin with a
 * stone chimney trailing translucent smoke and a glowing window, a grove
 * of snow-dusted conifers, three rounded snowdrift mounds, a pair of
 * mossy boulders and a small frozen tarn pond.
 */
function buildAlpineFoothills(f: NodeFactory): SceneNode {
  return f.group("Far North Alpine Foothills", [
    // Alpine ground plane — snow-dusted moss with patches of bare rock and
    // pine needle litter, surfaced with the new colour + depth map pair.
    f.mesh(
      "Alpine Ground",
      plane(ALPINE_W, ALPINE_D),
      std(C.alpineSnow, 0.95, {
        texture: "alpine-foothills",
        textureScale: [6, 4],
        bumpMap: "alpine-foothills-bump",
        bumpScale: 0.05,
      }),
      { position: ALPINE_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // South apron — overlaps the lakefront's far edge with a lakefront-
    // grass tone so the seam reads as one continuous ground layer.
    f.mesh(
      "Alpine South Apron",
      plane(ALPINE_W, 3),
      std(C.lakefrontGrass, 0.95, { texture: "grass", textureScale: [14, 1] }),
      {
        position: [0, -0.012, ALPINE_POS[2] + ALPINE_D / 2 - 1.5],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildLogCabin(f, LOG_CABIN_POS),
    buildAlpineTrees(f),
    buildSnowdrifts(f),
    buildAlpineBoulders(f),
    buildAlpineTarn(f, ALPINE_TARN_POS),
  ]);
}

/**
 * A small log cabin — six stacked horizontal log courses on each face,
 * a peaked shingle roof, a dark front door, a square front window with a
 * warm glow behind it and a tall stone chimney on the east face trailing
 * translucent smoke wisps from its crown.
 */
function buildLogCabin(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const log = std(C.cabinLog, 0.95, { texture: "wood", textureScale: [1, 0.4] });
  const logDark = std(C.cabinLogDark, 0.95, { texture: "wood", textureScale: [1, 0.4], flatShading: true });
  const roof = std(C.cabinRoof, 0.9, { texture: "shingle", textureScale: [1.5, 1.5] });
  const door = std(C.shedTrim, 0.85, { texture: "wood" });
  const windowGlow: MaterialDef = {
    color: C.cabinWindow,
    roughness: 0.4,
    emissive: "#f7d28c",
    transparent: true,
    opacity: 0.95,
  };
  const stone = std(C.firePitStone, 0.95, { texture: "cobblestone", flatShading: true });
  const smoke: MaterialDef = {
    color: C.cabinSmoke,
    roughness: 1.0,
    transparent: true,
    opacity: 0.32,
  };
  const cabinW = 2.4;
  const cabinD = 1.8;
  const cabinH = 1.4;
  const courseH = cabinH / 6;
  const parts: SceneNode[] = [];
  // Six log courses on each of four walls — stacked horizontal cylinders
  // along the wall length. Alternate light/dark courses for a chinked-log
  // reading without modelling individual logs.
  for (let i = 0; i < 6; i++) {
    const m = i % 2 === 0 ? log : logDark;
    const y = courseH / 2 + i * courseH;
    // Front + back log courses — run along X (cabin width).
    parts.push(
      f.mesh(`Front Course ${i}`, cylinder(courseH / 2, courseH / 2, cabinW, 8), m, {
        position: [0, y, cabinD / 2],
        rotation: [0, 0, Math.PI / 2],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(`Back Course ${i}`, cylinder(courseH / 2, courseH / 2, cabinW, 8), m, {
        position: [0, y, -cabinD / 2],
        rotation: [0, 0, Math.PI / 2],
      }, { castShadow: true, receiveShadow: true }),
      // Side log courses — run along Z (cabin depth).
      f.mesh(`Side L Course ${i}`, cylinder(courseH / 2, courseH / 2, cabinD, 8), m, {
        position: [-cabinW / 2, y, 0],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(`Side R Course ${i}`, cylinder(courseH / 2, courseH / 2, cabinD, 8), m, {
        position: [cabinW / 2, y, 0],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Roof — two angled rectangular planes meeting at the ridge. Built from
  // a pair of boxes rotated about Z so they peak above the cabin.
  const roofPitch = 0.6;
  const roofW = cabinW + 0.4;
  const roofRun = cabinD * 0.7;
  parts.push(
    f.mesh("Roof L", box(roofW, 0.08, roofRun), roof, {
      position: [0, cabinH + Math.sin(roofPitch) * (roofRun / 2) * 0.4, -roofRun / 2 + 0.05],
      rotation: [roofPitch, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof R", box(roofW, 0.08, roofRun), roof, {
      position: [0, cabinH + Math.sin(roofPitch) * (roofRun / 2) * 0.4, roofRun / 2 - 0.05],
      rotation: [-roofPitch, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Snow caps on the roof slopes — two pale boxes slightly proud of the
    // shingles, reading as drifted snow on the peaks.
    f.mesh("Snow Cap L", box(roofW - 0.3, 0.04, roofRun * 0.7), std(C.alpineSnow, 0.95), {
      position: [0, cabinH + Math.sin(roofPitch) * (roofRun / 2) * 0.4 + 0.06, -roofRun / 2 + 0.1],
      rotation: [roofPitch, 0, 0],
    }, { castShadow: false }),
    f.mesh("Snow Cap R", box(roofW - 0.3, 0.04, roofRun * 0.7), std(C.alpineSnow, 0.95), {
      position: [0, cabinH + Math.sin(roofPitch) * (roofRun / 2) * 0.4 + 0.06, roofRun / 2 - 0.1],
      rotation: [-roofPitch, 0, 0],
    }, { castShadow: false }),
  );
  // Front door — a tall dark panel centred on the front (+Z) face.
  parts.push(
    f.mesh("Cabin Door", box(0.48, 1.0, 0.04), door, {
      position: [-0.4, 0.5, cabinD / 2 + 0.04],
    }, { castShadow: true }),
    // Door knob — a small bright sphere.
    f.mesh("Door Knob", sphere(0.025, 8, 6), std(C.brass, 0.4, { metalness: 0.7 }), {
      position: [-0.18, 0.5, cabinD / 2 + 0.07],
    }, { castShadow: false }),
  );
  // Front window — square pane on the front face with a warm glow behind.
  parts.push(
    f.mesh("Cabin Window", box(0.42, 0.42, 0.05), windowGlow, {
      position: [0.55, 0.78, cabinD / 2 + 0.03],
    }, { castShadow: false }),
    // Cross muntin — slim wooden + dividing the window into four panes.
    f.mesh("Window Muntin H", box(0.44, 0.03, 0.06), logDark, {
      position: [0.55, 0.78, cabinD / 2 + 0.05],
    }, { castShadow: false }),
    f.mesh("Window Muntin V", box(0.03, 0.44, 0.06), logDark, {
      position: [0.55, 0.78, cabinD / 2 + 0.05],
    }, { castShadow: false }),
    // Window sill — a slim shelf below the pane.
    f.mesh("Window Sill", box(0.5, 0.04, 0.1), logDark, {
      position: [0.55, 0.55, cabinD / 2 + 0.04],
    }, { castShadow: true }),
  );
  // Stone chimney rising along the east face — a tall square stack with a
  // capped crown.
  const chimneyY = 1.0;
  parts.push(
    f.mesh("Chimney Stack", box(0.34, chimneyY, 0.36), stone, {
      position: [cabinW / 2 + 0.18, chimneyY / 2 + 0.2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Chimney Cap", box(0.42, 0.06, 0.44), stone, {
      position: [cabinW / 2 + 0.18, chimneyY + 0.23, 0],
    }, { castShadow: true }),
    // Three translucent smoke wisps rising from the chimney crown, each
    // slightly smaller and more transparent than the last.
    f.mesh("Smoke 1", sphere(0.14, 8, 6), smoke, {
      position: [cabinW / 2 + 0.2, chimneyY + 0.4, 0.05],
      scale: [1, 0.6, 1],
    }, { castShadow: false }),
    f.mesh("Smoke 2", sphere(0.18, 8, 6),
      { ...smoke, opacity: 0.24 }, {
      position: [cabinW / 2 + 0.3, chimneyY + 0.6, 0.12],
      scale: [1, 0.7, 1],
    }, { castShadow: false }),
    f.mesh("Smoke 3", sphere(0.22, 8, 6),
      { ...smoke, opacity: 0.16 }, {
      position: [cabinW / 2 + 0.42, chimneyY + 0.85, 0.22],
      scale: [1, 0.7, 1],
    }, { castShadow: false }),
  );
  // A small log step in front of the door.
  parts.push(
    f.mesh("Door Step", box(0.7, 0.08, 0.24), logDark, {
      position: [-0.4, 0.04, cabinD / 2 + 0.18],
    }, { castShadow: true, receiveShadow: true }),
  );
  return f.group("Log Cabin", parts, { position: pos, rotation: [0, Math.PI / 9, 0] });
}

/**
 * A small grove of six snow-dusted conifers on the alpine plane — each a
 * stylised stack of three cone tiers on a slim cylinder trunk, crowned
 * with a small pale snow cap so the foliage reads as winter-dusted.
 */
function buildAlpineTrees(f: NodeFactory): SceneNode {
  const trunk = std(C.cabinLog, 0.95, { texture: "bark", flatShading: true });
  const foliage = std(C.pineFoliageDark, 0.9, { flatShading: true });
  const foliageSnow = std(C.alpineSnow, 0.95, { flatShading: true });
  const rng = mulberry32(0x16a17ee5);
  const positions: [number, number][] = [
    [-14, -82],
    [-10, -80],
    [12, -84],
    [16, -82],
    [-2, -92],
    [-18, -94],
  ];
  const groups: SceneNode[] = [];
  for (let i = 0; i < positions.length; i++) {
    const [x, z] = positions[i]!;
    const scale = 1.3 + rng() * 0.5;
    const yaw = rng() * Math.PI * 2;
    const parts: SceneNode[] = [
      // Trunk — a slim cylinder.
      f.mesh(`Trunk ${i}`, cylinder(0.16, 0.22, 1.1, 6), trunk, {
        position: [0, 0.55, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Three cone tiers tapering up, with a pale snow-dust ring on top
      // of each tier reading as winter accumulation.
      f.mesh(`Cone Lo ${i}`, cone(0.95, 1.5, 8), foliage, {
        position: [0, 1.4, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(`Cone Mid ${i}`, cone(0.7, 1.2, 8), foliage, {
        position: [0, 2.1, 0],
      }, { castShadow: true }),
      f.mesh(`Cone Hi ${i}`, cone(0.45, 0.9, 8), foliage, {
        position: [0, 2.75, 0],
      }, { castShadow: true }),
      // Snow caps — slim cone tops sitting just above each tier's apex.
      f.mesh(`Snow Lo ${i}`, cone(0.55, 0.3, 8), foliageSnow, {
        position: [0, 1.95, 0],
      }, { castShadow: false }),
      f.mesh(`Snow Mid ${i}`, cone(0.4, 0.25, 8), foliageSnow, {
        position: [0, 2.55, 0],
      }, { castShadow: false }),
      f.mesh(`Snow Top ${i}`, cone(0.3, 0.3, 8), foliageSnow, {
        position: [0, 3.2, 0],
      }, { castShadow: false }),
    ];
    groups.push(
      f.group(`Alpine Tree ${i + 1}`, parts, {
        position: [x, 0, z],
        rotation: [0, yaw, 0],
        scale: [scale, scale, scale],
      }),
    );
  }
  return f.group("Alpine Trees", groups);
}

/**
 * Three rounded snowdrift mounds scattered around the alpine plane —
 * each a wide flattened sphere of pure white so they read as drifted
 * snow gathering against the ground undulations.
 */
function buildSnowdrifts(f: NodeFactory): SceneNode {
  const snow = std(C.alpineSnow, 0.95, { flatShading: true });
  const snowShade = std(C.alpineSnowShade, 0.95, { flatShading: true });
  const drifts: { x: number; z: number; r: number }[] = [
    { x: -22, z: -88, r: 1.4 },
    { x: 6, z: -90, r: 1.0 },
    { x: 20, z: -94, r: 1.2 },
    { x: -8, z: -76, r: 0.9 },
    { x: 24, z: -78, r: 0.7 },
  ];
  const driftMain: Transform[] = [];
  const driftShade: Transform[] = [];
  for (const d of drifts) {
    driftMain.push({
      position: [d.x, d.r * 0.3, d.z],
      rotation: [0, 0, 0],
      scale: [d.r, d.r * 0.45, d.r * 1.2],
    });
    // A slightly smaller shaded core under the main drift, suggesting
    // wind-shadow on the lee side.
    driftShade.push({
      position: [d.x + 0.2, d.r * 0.22, d.z + 0.2],
      rotation: [0, 0, 0],
      scale: [d.r * 0.7, d.r * 0.3, d.r * 0.8],
    });
  }
  return f.group("Snowdrifts", [
    f.instanced("Drift Crowns", sphere(1, 12, 8), snow, driftMain, {
      castShadow: true, receiveShadow: true,
    }),
    f.instanced("Drift Shades", sphere(1, 10, 7), snowShade, driftShade, {
      castShadow: false,
    }),
  ]);
}

/**
 * A pair of mossy boulders on the alpine plane — each a chunky stone
 * mound topped by a small moss patch, framing the tarn pond between
 * them. Built as a flattened sphere with a thinner moss cap on top.
 */
function buildAlpineBoulders(f: NodeFactory): SceneNode {
  const rock = std(C.alpineRock, 0.95, { texture: "cobblestone", flatShading: true });
  const rockDark = std(C.alpineRockDark, 0.95, { flatShading: true });
  const moss = std(C.alpineMoss, 0.95, { flatShading: true });
  const boulders: { x: number; z: number; r: number; yaw: number }[] = [
    { x: 6, z: -86, r: 0.8, yaw: 0.4 },
    { x: 14, z: -91, r: 0.65, yaw: -0.6 },
  ];
  const groups: SceneNode[] = [];
  for (let i = 0; i < boulders.length; i++) {
    const b = boulders[i]!;
    groups.push(
      f.group(`Boulder ${i + 1}`, [
        f.mesh("Stone Body", sphere(1, 12, 9), rock, {
          position: [0, b.r * 0.6, 0],
          scale: [b.r, b.r * 0.85, b.r * 1.1],
        }, { castShadow: true, receiveShadow: true }),
        f.mesh("Stone Shade", sphere(1, 10, 7), rockDark, {
          position: [b.r * 0.15, b.r * 0.45, b.r * 0.15],
          scale: [b.r * 0.7, b.r * 0.6, b.r * 0.8],
        }, { castShadow: false }),
        // A small moss patch on the boulder's north shoulder.
        f.mesh("Moss Patch", sphere(0.4, 10, 7), moss, {
          position: [b.r * 0.2, b.r * 1.05, -b.r * 0.3],
          scale: [b.r, b.r * 0.4, b.r * 0.8],
        }, { castShadow: false }),
      ], { position: [b.x, 0, b.z], rotation: [0, b.yaw, 0] }),
    );
  }
  return f.group("Alpine Boulders", groups);
}

/**
 * A small frozen tarn pond on the alpine plane — a wide flat ellipse of
 * pale-blue ice with a slightly darker deep-water ring underneath and a
 * thin rim of pebbles around the shore.
 */
function buildAlpineTarn(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const ice: MaterialDef = {
    color: C.tarnIce,
    roughness: 0.12,
    metalness: 0.25,
    transparent: true,
    opacity: 0.88,
  };
  const iceDeep: MaterialDef = {
    color: C.tarnIceDeep,
    roughness: 0.2,
    metalness: 0.2,
    transparent: true,
    opacity: 0.6,
  };
  const pebble = std(C.alpineRockDark, 0.95, { texture: "cobblestone", flatShading: true });
  const parts: SceneNode[] = [
    // Outer pebble rim — a wide flat disc just below the ice line.
    f.mesh("Tarn Shore", cylinder(2.6, 2.6, 0.03, 18), pebble, {
      position: [0, 0.015, 0],
    }, { receiveShadow: true }),
    // Deep water plate (slightly darker underneath).
    f.mesh("Tarn Deep", cylinder(2.2, 2.2, 0.03, 18), iceDeep, {
      position: [0, 0.025, 0],
    }, { receiveShadow: true }),
    // Ice surface plate on top.
    f.mesh("Tarn Ice", cylinder(2.05, 2.05, 0.03, 18), ice, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
  ];
  // A few small crack highlights — slim slivers across the ice surface.
  const crack: MaterialDef = {
    color: C.laundryWhite,
    roughness: 0.2,
    transparent: true,
    opacity: 0.45,
  };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    parts.push(
      f.mesh(`Crack ${i}`, box(1.8 + (i * 0.2), 0.005, 0.02), crack, {
        position: [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3],
        rotation: [0, a + 0.4, 0],
      }, { castShadow: false }),
    );
  }
  // A few small pebbles scattered along the shore, reading as exposed
  // alpine rock at the water's edge.
  const rng = mulberry32(0x16a7a8a8);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 2.55 + rng() * 0.18;
    parts.push(
      f.mesh(`Shore Pebble ${i}`, box(0.18, 0.12, 0.22), pebble, {
        position: [Math.cos(a) * r, 0.06, Math.sin(a) * r],
        rotation: [0, rng() * Math.PI, 0],
        scale: [0.7 + rng() * 0.4, 0.7 + rng() * 0.4, 0.7 + rng() * 0.4],
      }, { castShadow: true }),
    );
  }
  return f.group("Alpine Tarn", parts, { position: pos });
}

/* ─────────────── seventeenth-pass courtyard props ─────────────── */

/**
 * A wrought-iron Victorian tea table set — a round black iron table on a
 * crossed-leg pedestal, flanked by two ornate scrollback chairs and laid
 * with a porcelain teapot, two cups on saucers and a three-tier pastry
 * stand. The table top is a slim dark disc rendered with low roughness so
 * highlights sketch across it; the chair scrollbacks are built from a
 * stack of slim arc segments that fan out from the seat.
 */
function buildVictorianTeaSet(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const iron = std(C.teaTableIron, 0.45, { metalness: 0.5, flatShading: true });
  const ironHi = std(C.teaTableIronHi, 0.4, { metalness: 0.6 });
  const tabletop = std(C.teaTableTop, 0.35, { metalness: 0.4 });
  const porcelain = std(C.teaPorcelain, 0.4);
  const porcelainTrim = std(C.teaPorcelainTrim, 0.3, { metalness: 0.5 });
  const cake = std(C.teaCake, 0.6);
  const pastry = std(C.teaPastry, 0.65);
  const pastryDark = std(C.teaPastryDark, 0.7);
  const parts: SceneNode[] = [];
  // ── Table ──
  const tableR = 0.45;
  const tableY = 0.62;
  // Crossed-leg pedestal — four slim iron rods rising from a low ring
  // and meeting under the table top.
  parts.push(
    // Base ring resting on the lawn.
    f.mesh("Table Base Ring", cylinder(0.22, 0.24, 0.04, 14), iron, {
      position: [0, 0.02, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(
      f.mesh(`Table Leg ${i}`, box(0.028, 0.62, 0.028), iron, {
        position: [Math.cos(yaw) * 0.18, 0.32, Math.sin(yaw) * 0.18],
        rotation: [Math.cos(yaw) * 0.2, 0, -Math.sin(yaw) * 0.2],
      }, { castShadow: true }),
    );
  }
  parts.push(
    // Central rod connecting base to top.
    f.mesh("Table Rod", cylinder(0.04, 0.04, 0.6, 8), iron, {
      position: [0, 0.32, 0],
    }, { castShadow: true }),
    // Slim collar where the rod meets the underside.
    f.mesh("Table Collar", cylinder(0.08, 0.08, 0.03, 12), ironHi, {
      position: [0, tableY - 0.05, 0],
    }, { castShadow: true }),
    // Round table top — slim dark disc.
    f.mesh("Table Top", cylinder(tableR, tableR, 0.04, 28), tabletop, {
      position: [0, tableY, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Decorative iron rim around the table edge.
    f.mesh("Table Rim", cylinder(tableR + 0.02, tableR + 0.02, 0.02, 28), iron, {
      position: [0, tableY + 0.025, 0],
    }, { castShadow: true }),
  );
  // ── Two chairs facing the table ──
  function chair(seatYaw: number, distance: number): SceneNode[] {
    const cx = Math.cos(seatYaw) * distance;
    const cz = Math.sin(seatYaw) * distance;
    const seatY = 0.45;
    const backYaw = seatYaw + Math.PI; // back faces away from the table
    const seatNode: SceneNode[] = [];
    // Seat disc.
    seatNode.push(
      f.mesh("Chair Seat", cylinder(0.18, 0.18, 0.04, 18), iron, {
        position: [cx, seatY, cz],
      }, { castShadow: true, receiveShadow: true }),
    );
    // Four splayed iron legs.
    for (let i = 0; i < 4; i++) {
      const lYaw = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const lx = cx + Math.cos(lYaw) * 0.13;
      const lz = cz + Math.sin(lYaw) * 0.13;
      seatNode.push(
        f.mesh(`Chair Leg ${i}`, box(0.022, seatY, 0.022), iron, {
          position: [lx, seatY / 2, lz],
          rotation: [Math.cos(lYaw) * 0.12, 0, -Math.sin(lYaw) * 0.12],
        }, { castShadow: true }),
      );
    }
    // Scrollback — a stack of slim arc segments fanning up behind the seat.
    const backX = cx + Math.cos(backYaw) * 0.17;
    const backZ = cz + Math.sin(backYaw) * 0.17;
    for (let i = 0; i < 5; i++) {
      const y = seatY + 0.06 + i * 0.08;
      const w = 0.32 - i * 0.04;
      seatNode.push(
        f.mesh(`Chair Back ${i}`, box(w, 0.02, 0.02), iron, {
          position: [backX, y, backZ],
          rotation: [0, backYaw + Math.PI / 2, 0],
        }, { castShadow: true }),
      );
    }
    // Two slim posts framing the scrollback.
    for (const side of [-1, 1] as const) {
      const px = backX + Math.cos(backYaw + Math.PI / 2) * side * 0.14;
      const pz = backZ + Math.sin(backYaw + Math.PI / 2) * side * 0.14;
      seatNode.push(
        f.mesh(`Chair Post ${side}`, box(0.022, 0.5, 0.022), iron, {
          position: [px, seatY + 0.26, pz],
        }, { castShadow: true }),
      );
    }
    // A small scroll curl at the top of each post — a tiny iron sphere.
    for (const side of [-1, 1] as const) {
      const px = backX + Math.cos(backYaw + Math.PI / 2) * side * 0.14;
      const pz = backZ + Math.sin(backYaw + Math.PI / 2) * side * 0.14;
      seatNode.push(
        f.mesh(`Chair Curl ${side}`, sphere(0.03, 8, 6), ironHi, {
          position: [px, seatY + 0.52, pz],
        }, { castShadow: false }),
      );
    }
    return seatNode;
  }
  parts.push(...chair(Math.PI * 0.25, 0.85));
  parts.push(...chair(Math.PI * 1.25, 0.85));
  // ── Tableware ──
  // Teapot — squat porcelain bulb with a stout spout, curved handle and
  // a domed lid topped by a tiny brass knob.
  const potX = -0.16, potZ = 0.06;
  parts.push(
    f.mesh("Teapot Body", sphere(0.085, 14, 10), porcelain, {
      position: [potX, tableY + 0.11, potZ],
      scale: [1.1, 0.95, 1.1],
    }, { castShadow: true, receiveShadow: true }),
    // Spout.
    f.mesh("Teapot Spout", cylinder(0.018, 0.025, 0.12, 8), porcelain, {
      position: [potX - 0.13, tableY + 0.12, potZ - 0.02],
      rotation: [0, 0, Math.PI / 3],
    }, { castShadow: true }),
    // Handle — small arc box.
    f.mesh("Teapot Handle", box(0.022, 0.08, 0.022), porcelain, {
      position: [potX + 0.1, tableY + 0.12, potZ + 0.01],
      rotation: [0, 0, Math.PI / 8],
    }, { castShadow: true }),
    // Domed lid.
    f.mesh("Teapot Lid", sphere(0.06, 12, 8), porcelain, {
      position: [potX, tableY + 0.18, potZ],
      scale: [1, 0.5, 1],
    }, { castShadow: true }),
    // Lid knob.
    f.mesh("Teapot Knob", sphere(0.018, 8, 6), porcelainTrim, {
      position: [potX, tableY + 0.21, potZ],
    }, { castShadow: false }),
    // Gilt rim around the body.
    f.mesh("Teapot Rim", cylinder(0.09, 0.09, 0.012, 14), porcelainTrim, {
      position: [potX, tableY + 0.16, potZ],
    }, { castShadow: false }),
  );
  // Two cups on saucers — set across the table from the teapot.
  const cupPositions: [number, number][] = [
    [0.16, -0.18],
    [0.22, 0.18],
  ];
  for (let i = 0; i < cupPositions.length; i++) {
    const [cxOff, czOff] = cupPositions[i]!;
    parts.push(
      f.mesh(`Saucer ${i}`, cylinder(0.07, 0.07, 0.012, 14), porcelain, {
        position: [cxOff, tableY + 0.025, czOff],
      }, { castShadow: false, receiveShadow: true }),
      f.mesh(`Saucer Rim ${i}`, cylinder(0.07, 0.07, 0.005, 14), porcelainTrim, {
        position: [cxOff, tableY + 0.032, czOff],
      }, { castShadow: false }),
      f.mesh(`Cup Body ${i}`, cylinder(0.038, 0.04, 0.055, 14), porcelain, {
        position: [cxOff, tableY + 0.062, czOff],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(`Cup Rim ${i}`, cylinder(0.04, 0.04, 0.005, 14), porcelainTrim, {
        position: [cxOff, tableY + 0.092, czOff],
      }, { castShadow: false }),
      f.mesh(`Cup Handle ${i}`, box(0.018, 0.028, 0.012), porcelain, {
        position: [cxOff + 0.044, tableY + 0.064, czOff],
      }, { castShadow: true }),
      // A small disc of tea inside the cup — a darker top surface.
      f.mesh(`Cup Tea ${i}`, cylinder(0.035, 0.035, 0.005, 12), std(C.teaPastryDark, 0.3, { metalness: 0.2 }), {
        position: [cxOff, tableY + 0.088, czOff],
      }, { castShadow: false }),
    );
  }
  // Three-tier pastry stand — three porcelain plates of decreasing radius
  // on a thin central rod, topped by a small ring handle.
  const standX = 0, standZ = 0;
  const plateR = [0.12, 0.095, 0.07];
  const plateY = [tableY + 0.05, tableY + 0.17, tableY + 0.27];
  for (let i = 0; i < 3; i++) {
    parts.push(
      f.mesh(`Stand Plate ${i}`, cylinder(plateR[i]!, plateR[i]!, 0.014, 18), porcelain, {
        position: [standX, plateY[i]!, standZ],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(`Stand Plate Rim ${i}`, cylinder(plateR[i]!, plateR[i]!, 0.005, 18), porcelainTrim, {
        position: [standX, plateY[i]! + 0.009, standZ],
      }, { castShadow: false }),
    );
  }
  parts.push(
    f.mesh("Stand Rod", cylinder(0.012, 0.012, 0.3, 8), porcelainTrim, {
      position: [standX, tableY + 0.18, standZ],
    }, { castShadow: true }),
    // Top ring handle — small donut hint as a flattened cylinder.
    f.mesh("Stand Handle", cylinder(0.028, 0.028, 0.012, 14), porcelainTrim, {
      position: [standX, tableY + 0.33, standZ],
    }, { castShadow: false }),
  );
  // A few pastries on each plate — flat round dabs and a small frosted
  // cake on the top tier.
  const pastryDabs: { tier: 0 | 1 | 2; r: number; dx: number; dz: number; mat: "p" | "d" | "c" }[] = [
    { tier: 0, r: 0.035, dx: -0.06, dz: 0.02, mat: "p" },
    { tier: 0, r: 0.03, dx: 0.04, dz: -0.05, mat: "d" },
    { tier: 0, r: 0.032, dx: 0.06, dz: 0.04, mat: "p" },
    { tier: 0, r: 0.028, dx: -0.02, dz: -0.06, mat: "c" },
    { tier: 1, r: 0.03, dx: -0.04, dz: 0.02, mat: "p" },
    { tier: 1, r: 0.026, dx: 0.04, dz: -0.03, mat: "d" },
    { tier: 1, r: 0.026, dx: 0.02, dz: 0.04, mat: "c" },
  ];
  for (const p of pastryDabs) {
    const mat = p.mat === "p" ? pastry : p.mat === "d" ? pastryDark : cake;
    parts.push(
      f.mesh("Pastry", cylinder(p.r, p.r * 0.9, 0.022, 12), mat, {
        position: [standX + p.dx, plateY[p.tier]! + 0.022, standZ + p.dz],
      }, { castShadow: true }),
    );
  }
  // Top tier — a small layered frosted cake.
  parts.push(
    f.mesh("Top Cake Body", cylinder(0.048, 0.05, 0.04, 14), cake, {
      position: [standX, plateY[2]! + 0.03, standZ],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Top Cake Frosting", cylinder(0.052, 0.045, 0.02, 14), porcelain, {
      position: [standX, plateY[2]! + 0.06, standZ],
    }, { castShadow: true }),
    // A tiny pink cherry on top.
    f.mesh("Top Cake Cherry", sphere(0.014, 8, 6), std(C.flowerRed, 0.4), {
      position: [standX, plateY[2]! + 0.078, standZ],
    }, { castShadow: false }),
  );
  return f.group("Victorian Tea Set", parts, { position: pos, rotation: [0, -Math.PI / 5, 0] });
}

/**
 * A single stone owl sentinel on a slate plinth — a round-bodied owl
 * with a small head, two prominent eye discs, a short hooked beak, two
 * ear tufts and a pair of folded wing slats down each flank. The owl
 * body reuses the existing `marble` colour + bump pair so the stone
 * reads with veined relief on the rounded shoulders.
 *
 * `facing` rotates the owl about Y so the carved eyes look down the path.
 */
function buildOwlStatue(
  f: NodeFactory,
  pos: [number, number, number],
  facing: number,
): SceneNode {
  const marble = std(C.owlMarble, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.025,
  });
  const marbleShade = std(C.owlMarbleShade, 0.95, { flatShading: true });
  const slate = std(C.slatePlate, 0.95, { texture: "cobblestone", flatShading: true });
  const eye: MaterialDef = {
    color: C.owlEye,
    roughness: 0.45,
    metalness: 0.2,
    emissive: "#3a2a14",
  };
  const beak = std(C.owlBeak, 0.9, { flatShading: true });
  const parts: SceneNode[] = [
    // Slate plinth — two slate slabs stacked.
    f.mesh("Plinth Footing", box(0.42, 0.05, 0.42), slate, {
      position: [0, 0.025, 0],
    }, { receiveShadow: true }),
    f.mesh("Plinth Body", box(0.34, 0.22, 0.34), marbleShade, {
      position: [0, 0.16, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Plinth Cap", box(0.38, 0.04, 0.38), slate, {
      position: [0, 0.29, 0],
    }, { castShadow: true }),
  ];
  // Body — egg-shaped marble torso.
  const bodyY = 0.6;
  parts.push(
    f.mesh("Owl Body", sphere(0.2, 16, 12), marble, {
      position: [0, bodyY, 0],
      scale: [1.0, 1.2, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    // Subtle belly highlight — a slim sphere offset forward.
    f.mesh("Owl Belly", sphere(0.16, 12, 9), marbleShade, {
      position: [Math.cos(facing) * 0.05, bodyY - 0.04, Math.sin(facing) * 0.05],
      scale: [0.9, 0.95, 0.85],
    }, { castShadow: false }),
  );
  // Head — round marble dome resting on the body.
  const headY = bodyY + 0.27;
  parts.push(
    f.mesh("Owl Head", sphere(0.14, 14, 10), marble, {
      position: [0, headY, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Two large eye discs on the front of the head.
  for (const side of [-1, 1] as const) {
    const ex = Math.cos(facing) * 0.1 + Math.cos(facing + Math.PI / 2) * side * 0.06;
    const ez = Math.sin(facing) * 0.1 + Math.sin(facing + Math.PI / 2) * side * 0.06;
    parts.push(
      // White marble eye disc.
      f.mesh(`Eye Disc ${side}`, cylinder(0.04, 0.04, 0.015, 12), marbleShade, {
        position: [ex, headY + 0.02, ez],
        rotation: [Math.PI / 2 - facing * 0, facing, 0],
      }, { castShadow: false }),
      // Amber pupil.
      f.mesh(`Eye Pupil ${side}`, sphere(0.025, 10, 8), eye, {
        position: [ex + Math.cos(facing) * 0.008, headY + 0.02, ez + Math.sin(facing) * 0.008],
      }, { castShadow: false }),
    );
  }
  // Beak — small downward triangle of marble at the front of the head.
  parts.push(
    f.mesh("Owl Beak", cone(0.025, 0.06, 6), beak, {
      position: [Math.cos(facing) * 0.13, headY - 0.04, Math.sin(facing) * 0.13],
      rotation: [-Math.PI / 2 + Math.cos(facing) * 0.0, 0, 0],
    }, { castShadow: false }),
  );
  // Two ear tufts on top of the head — slim marble cones.
  for (const side of [-1, 1] as const) {
    const ex = Math.cos(facing + Math.PI / 2) * side * 0.08;
    const ez = Math.sin(facing + Math.PI / 2) * side * 0.08;
    parts.push(
      f.mesh(`Ear Tuft ${side}`, cone(0.035, 0.1, 6), marble, {
        position: [ex, headY + 0.14, ez],
        rotation: [0, 0, side * 0.25],
      }, { castShadow: true }),
    );
  }
  // Folded wings — two slim curved panels down each flank.
  for (const side of [-1, 1] as const) {
    const wx = Math.cos(facing + Math.PI / 2) * side * 0.18;
    const wz = Math.sin(facing + Math.PI / 2) * side * 0.18;
    parts.push(
      f.mesh(`Wing Slat A ${side}`, box(0.03, 0.22, 0.05), marble, {
        position: [wx, bodyY - 0.04, wz],
        rotation: [0, facing, side * 0.15],
      }, { castShadow: true }),
      f.mesh(`Wing Slat B ${side}`, box(0.022, 0.16, 0.04), marbleShade, {
        position: [wx * 0.9, bodyY - 0.14, wz * 0.9],
        rotation: [0, facing, side * 0.25],
      }, { castShadow: true }),
    );
  }
  // Two stubby marble talons peeking out below the body.
  for (const side of [-1, 1] as const) {
    const tx = Math.cos(facing + Math.PI / 2) * side * 0.06;
    const tz = Math.sin(facing + Math.PI / 2) * side * 0.06;
    parts.push(
      f.mesh(`Talon ${side}`, sphere(0.04, 8, 6), marbleShade, {
        position: [tx + Math.cos(facing) * 0.05, 0.33, tz + Math.sin(facing) * 0.05],
        scale: [1.2, 0.7, 1.0],
      }, { castShadow: true }),
    );
  }
  return f.group("Owl Statue", parts, { position: pos, rotation: [0, facing, 0] });
}

function buildOwlSentinels(f: NodeFactory): SceneNode {
  return f.group("Owl Sentinels", [
    // Both face inward toward the cobble path so the eyes meet the gate-
    // bound visitor — the left owl looks east (+X), the right looks west.
    buildOwlStatue(f, OWL_L_POS, 0),
    buildOwlStatue(f, OWL_R_POS, Math.PI),
  ]);
}

/* ─────────────── seventeenth-pass house detail ─────────────── */

/**
 * A stained-glass arched fanlight transom panel centred above the
 * front door, between the door arch trim and the porch canopy. The
 * panel is a slim flat box surfaced with the new `stained-glass` colour
 * map paired with the `stained-glass-bump` depth map so the leaded
 * muntins read as raised relief on the glass. A second slim warm-glow
 * plate sits a hair behind the colour plate so the panel reads as a
 * lit fanlight, and a copper-patina trim arch surrounds the whole
 * panel reusing the existing copper-patina pair for verdigris relief.
 */
function buildFanlight(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const fanlight: MaterialDef = {
    color: C.fanlightGlow,
    roughness: 0.25,
    metalness: 0.1,
    texture: "stained-glass",
    textureScale: [1, 1],
    bumpMap: "stained-glass-bump",
    bumpScale: 0.03,
    emissive: "#5e3818",
  };
  const glowMat: MaterialDef = {
    color: C.fanlightGlow,
    roughness: 0.4,
    emissive: "#f7d28c",
    transparent: true,
    opacity: 0.7,
  };
  const trim: MaterialDef = {
    color: C.copperPatina,
    roughness: 0.55,
    metalness: 0.55,
    texture: "copper-patina",
    textureScale: [1, 1],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.025,
  };
  const lead = std(C.fanlightLead, 0.65, { metalness: 0.4, flatShading: true });
  const panelW = 1.3;
  const panelH = 0.4;
  const parts: SceneNode[] = [
    // Warm interior glow plate behind the stained glass.
    f.mesh("Fanlight Glow", box(panelW - 0.04, panelH - 0.04, 0.01), glowMat, {
      position: [0, 0, -0.02],
    }, { castShadow: false }),
    // Stained-glass colour plate carrying the leaded-muntin texture.
    f.mesh("Fanlight Glass", box(panelW, panelH, 0.02), fanlight, {
      position: [0, 0, 0],
    }, { castShadow: false, receiveShadow: true }),
    // Copper-patina trim arch — four slim bands framing the panel.
    f.mesh("Trim Top", box(panelW + 0.1, 0.04, 0.03), trim, {
      position: [0, panelH / 2 + 0.02, 0.005],
    }, { castShadow: true }),
    f.mesh("Trim Bottom", box(panelW + 0.1, 0.04, 0.03), trim, {
      position: [0, -panelH / 2 - 0.02, 0.005],
    }, { castShadow: true }),
    f.mesh("Trim L", box(0.04, panelH, 0.03), trim, {
      position: [-panelW / 2 - 0.02, 0, 0.005],
    }, { castShadow: true }),
    f.mesh("Trim R", box(0.04, panelH, 0.03), trim, {
      position: [panelW / 2 + 0.02, 0, 0.005],
    }, { castShadow: true }),
  ];
  // A central vertical lead came dividing the panel into two halves
  // and a horizontal cross came at the middle — these read as the
  // major lead lines on top of the procedural muntin texture.
  parts.push(
    f.mesh("Lead Vertical", box(0.022, panelH - 0.02, 0.025), lead, {
      position: [0, 0, 0.012],
    }, { castShadow: false }),
    f.mesh("Lead Horizontal", box(panelW - 0.02, 0.018, 0.025), lead, {
      position: [0, 0, 0.012],
    }, { castShadow: false }),
  );
  // Small decorative keystone medallion at the centre — a slim disc.
  parts.push(
    f.mesh("Keystone Medallion", cylinder(0.06, 0.06, 0.02, 16), trim, {
      position: [0, 0, 0.025],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
  );
  return f.group("Stained Glass Fanlight", parts, { position: pos });
}

/* ─────────────── seventeenth-pass scene extension ─────────────── */

function buildNortheastMapleGrove(f: NodeFactory): SceneNode {
  return f.group("Northeast Autumn Maple Grove", [
    // Auburn maple-grove ground plane — surfaced with the new colour +
    // depth map pair so leaf piles and exposed soil patches read as
    // raised relief at glancing sun.
    f.mesh(
      "Maple Grove Ground",
      plane(NE_MAPLE_W, NE_MAPLE_D),
      std(C.mapleGround, 0.95, {
        texture: "autumn-canopy",
        textureScale: [3, 5],
        bumpMap: "autumn-canopy-bump",
        bumpScale: 0.05,
      }),
      { position: NE_MAPLE_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // West apron — overlaps the lakefront's east edge with the
    // lakefront-grass tone so the seam reads as one continuous ground.
    f.mesh(
      "Maple Grove West Apron",
      plane(2, NE_MAPLE_D),
      std(C.lakefrontGrass, 0.95, { texture: "grass", textureScale: [1, 12] }),
      {
        position: [NE_MAPLE_POS[0] - NE_MAPLE_W / 2 + 1, -0.013, NE_MAPLE_POS[2]],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // South apron — overlaps the NE pasture's north edge with the
    // pasture-grass tone so the seam reads as continuous ground.
    f.mesh(
      "Maple Grove South Apron",
      plane(NE_MAPLE_W, 3),
      std(C.pastureGrass, 0.95, { texture: "grass", textureScale: [10, 1] }),
      {
        position: [NE_MAPLE_POS[0], -0.013, NE_MAPLE_POS[2] + NE_MAPLE_D / 2 - 1.5],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildMapleTrees(f),
    buildHuntingLodge(f, HUNTING_LODGE_POS),
    buildMossyFallenLog(f, MAPLE_LOG_A_POS, 0.4),
    buildMossyFallenLog(f, MAPLE_LOG_B_POS, -1.1),
    buildStoneCairn(f, MAPLE_CAIRN_POS),
    buildMapleLeafLitter(f),
  ]);
}

/**
 * A grove of five maple trees scattered across the maple grove plane —
 * each a stout trunk crowned by three layered foliage clusters in
 * crimson, amber and gold, giving a tiered autumn canopy silhouette
 * that varies tree to tree by which crown tint dominates.
 */
function buildMapleTrees(f: NodeFactory): SceneNode {
  const trunk = std(C.mapleTrunk, 0.95, { texture: "bark", flatShading: true });
  const trunkShade = std(C.mapleTrunkShade, 0.95, { flatShading: true });
  const crimson = std(C.mapleCrimson, 0.85, { flatShading: true });
  const crimsonDark = std(C.mapleCrimsonDark, 0.9, { flatShading: true });
  const amber = std(C.mapleAmber, 0.85, { flatShading: true });
  const gold = std(C.mapleGold, 0.85, { flatShading: true });
  // Five maple positions inside the plane, routing around the lodge.
  const trees: { x: number; z: number; scale: number; dominant: "c" | "a" | "g" }[] = [
    { x: 32, z: -48, scale: 1.1, dominant: "c" },
    { x: 33, z: -57, scale: 1.0, dominant: "a" },
    { x: 41, z: -42, scale: 0.95, dominant: "g" },
    { x: 41, z: -52, scale: 1.05, dominant: "c" },
    { x: 35, z: -64, scale: 0.9, dominant: "a" },
  ];
  const rng = mulberry32(0x17a91e7e);
  const groups: SceneNode[] = [];
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i]!;
    const yaw = rng() * Math.PI * 2;
    const parts: SceneNode[] = [];
    // Stout trunk — a tapered cylinder.
    parts.push(
      f.mesh("Maple Trunk", cylinder(0.18, 0.28, 1.5, 9), trunk, {
        position: [0, 0.75, 0],
      }, { castShadow: true, receiveShadow: true }),
      // A darker buttress flare at the base of the trunk.
      f.mesh("Trunk Flare", cylinder(0.36, 0.42, 0.16, 9), trunkShade, {
        position: [0, 0.08, 0],
      }, { castShadow: true }),
    );
    // Three layered foliage clusters — the dominant tint defines the
    // bottom (largest) cluster, while the other two crown above with
    // contrasting tints. Each cluster is a flattened sphere.
    const dominantMat = t.dominant === "c" ? crimson : t.dominant === "a" ? amber : gold;
    const accentA = t.dominant === "c" ? amber : t.dominant === "a" ? crimson : amber;
    const accentB = t.dominant === "c" ? gold : t.dominant === "a" ? gold : crimsonDark;
    parts.push(
      f.mesh("Crown Bottom", sphere(0.95, 12, 9), dominantMat, {
        position: [0, 1.7, 0],
        scale: [1.1, 0.85, 1.1],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Crown Mid", sphere(0.75, 12, 9), accentA, {
        position: [0.12, 2.1, -0.08],
        scale: [1.0, 0.9, 1.0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Crown Top", sphere(0.55, 12, 9), accentB, {
        position: [-0.08, 2.45, 0.1],
        scale: [1.0, 0.95, 1.0],
      }, { castShadow: true }),
      // A small lower side cluster on the dominant tint to break the
      // silhouette and read as a side branch.
      f.mesh("Crown Side", sphere(0.45, 10, 7), crimsonDark, {
        position: [0.5, 1.5, 0.25],
        scale: [1.0, 0.85, 1.0],
      }, { castShadow: true }),
    );
    groups.push(
      f.group(`Maple ${i + 1}`, parts, {
        position: [t.x, 0, t.z],
        rotation: [0, yaw, 0],
        scale: [t.scale, t.scale, t.scale],
      }),
    );
  }
  return f.group("Maple Trees", groups);
}

/**
 * A small wooden hunting lodge — a single-storey timber cabin with
 * board-and-batten siding, a peaked shingle roof, a square front
 * window with a warm interior glow, a slim plank front door with a
 * brass knob and a tall stone chimney trailing a translucent smoke
 * wisp from its crown.
 */
function buildHuntingLodge(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.lodgeWood, 0.92, { texture: "wood", textureScale: [0.6, 1] });
  const woodDark = std(C.lodgeWoodDark, 0.95, { texture: "wood", textureScale: [0.4, 0.4], flatShading: true });
  const roof = std(C.lodgeRoof, 0.9, { texture: "shingle", textureScale: [1.4, 1.4] });
  const stone = std(C.lodgeChimney, 0.95, { texture: "cobblestone", flatShading: true });
  const door = std(C.shedTrim, 0.9, { texture: "wood" });
  const windowGlow: MaterialDef = {
    color: C.lodgeWindow,
    roughness: 0.35,
    emissive: "#f7d28c",
    transparent: true,
    opacity: 0.95,
  };
  const smoke: MaterialDef = {
    color: C.cabinSmoke,
    roughness: 1.0,
    transparent: true,
    opacity: 0.3,
  };
  const lodgeW = 2.6;
  const lodgeD = 2.0;
  const lodgeH = 1.6;
  const parts: SceneNode[] = [
    // Four wall panels — board-and-batten timber on a low stone footing.
    f.mesh("Footing", box(lodgeW + 0.2, 0.18, lodgeD + 0.2), stone, {
      position: [0, 0.09, 0],
    }, { receiveShadow: true }),
    f.mesh("Wall Front", box(lodgeW, lodgeH, 0.1), wood, {
      position: [0, 0.18 + lodgeH / 2, lodgeD / 2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall Back", box(lodgeW, lodgeH, 0.1), wood, {
      position: [0, 0.18 + lodgeH / 2, -lodgeD / 2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall L", box(0.1, lodgeH, lodgeD), wood, {
      position: [-lodgeW / 2, 0.18 + lodgeH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wall R", box(0.1, lodgeH, lodgeD), wood, {
      position: [lodgeW / 2, 0.18 + lodgeH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
  ];
  // Six slim battens on the front face — slim vertical dark slats.
  for (let i = 0; i < 6; i++) {
    const t = i / 5 - 0.5;
    parts.push(
      f.mesh(`Batten ${i}`, box(0.05, lodgeH - 0.1, 0.04), woodDark, {
        position: [t * (lodgeW - 0.3), 0.18 + lodgeH / 2, lodgeD / 2 + 0.05],
      }, { castShadow: true }),
    );
  }
  // Peaked roof — two angled box slabs meeting at a ridge.
  const ridgeY = 0.18 + lodgeH + 0.5;
  const roofRun = lodgeD * 0.7;
  const roofPitch = 0.55;
  parts.push(
    f.mesh("Roof Front", box(lodgeW + 0.5, 0.08, roofRun), roof, {
      position: [0, ridgeY - 0.18, roofRun / 2 - 0.05],
      rotation: [-roofPitch, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof Back", box(lodgeW + 0.5, 0.08, roofRun), roof, {
      position: [0, ridgeY - 0.18, -roofRun / 2 + 0.05],
      rotation: [roofPitch, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Roof ridge cap — a slim plank along the peak.
    f.mesh("Ridge Cap", box(lodgeW + 0.55, 0.06, 0.16), woodDark, {
      position: [0, ridgeY + 0.02, 0],
    }, { castShadow: true }),
  );
  // Front door — slim dark plank panel with a brass knob.
  parts.push(
    f.mesh("Lodge Door", box(0.46, 1.0, 0.04), door, {
      position: [-0.5, 0.18 + 0.5, lodgeD / 2 + 0.06],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Door Knob", sphere(0.028, 8, 6), std(C.brass, 0.4, { metalness: 0.7 }), {
      position: [-0.3, 0.18 + 0.5, lodgeD / 2 + 0.09],
    }, { castShadow: false }),
    // Door step — small wooden plank below the door.
    f.mesh("Door Step", box(0.7, 0.06, 0.22), woodDark, {
      position: [-0.5, 0.21, lodgeD / 2 + 0.15],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Square front window with cross muntin — warm glow behind.
  const windowY = 0.18 + 0.95;
  parts.push(
    f.mesh("Lodge Window", box(0.46, 0.46, 0.04), windowGlow, {
      position: [0.6, windowY, lodgeD / 2 + 0.05],
    }, { castShadow: false }),
    f.mesh("Window Muntin H", box(0.48, 0.03, 0.05), woodDark, {
      position: [0.6, windowY, lodgeD / 2 + 0.06],
    }, { castShadow: false }),
    f.mesh("Window Muntin V", box(0.03, 0.48, 0.05), woodDark, {
      position: [0.6, windowY, lodgeD / 2 + 0.06],
    }, { castShadow: false }),
    f.mesh("Window Sill", box(0.55, 0.04, 0.1), woodDark, {
      position: [0.6, windowY - 0.27, lodgeD / 2 + 0.05],
    }, { castShadow: true }),
  );
  // Stone chimney on the right side wall — tall square stack with cap.
  const chimneyH = 1.6;
  parts.push(
    f.mesh("Chimney Stack", box(0.38, chimneyH, 0.4), stone, {
      position: [lodgeW / 2 + 0.18, 0.18 + chimneyH / 2 + 0.2, -0.2],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Chimney Cap", box(0.46, 0.06, 0.48), stone, {
      position: [lodgeW / 2 + 0.18, 0.18 + chimneyH + 0.23, -0.2],
    }, { castShadow: true }),
    // Two translucent smoke wisps rising from the crown.
    f.mesh("Smoke 1", sphere(0.16, 8, 6), smoke, {
      position: [lodgeW / 2 + 0.2, 0.18 + chimneyH + 0.42, -0.16],
      scale: [1, 0.65, 1],
    }, { castShadow: false }),
    f.mesh("Smoke 2", sphere(0.22, 8, 6), { ...smoke, opacity: 0.18 }, {
      position: [lodgeW / 2 + 0.32, 0.18 + chimneyH + 0.7, -0.08],
      scale: [1, 0.7, 1],
    }, { castShadow: false }),
  );
  return f.group("Hunting Lodge", parts, { position: pos, rotation: [0, -Math.PI / 8, 0] });
}

/**
 * A moss-jacketed fallen log lying on the maple grove floor — a long
 * cylinder of weathered timber with a leafy moss cap across the top
 * surface and a darker shaded underbelly. `yaw` rotates the log on
 * the ground so the pair don't lie parallel.
 */
function buildMossyFallenLog(
  f: NodeFactory,
  pos: [number, number, number],
  yaw: number,
): SceneNode {
  const log = std(C.mapleTrunk, 0.95, { texture: "bark", flatShading: true });
  const logShade = std(C.mapleTrunkShade, 0.95, { flatShading: true });
  const moss = std(C.fallenLogMoss, 0.95, { flatShading: true });
  const parts: SceneNode[] = [
    // Main log body lying along Z.
    f.mesh("Log Body", cylinder(0.18, 0.2, 1.8, 12), log, {
      position: [0, 0.18, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Slightly darker underbelly slab.
    f.mesh("Log Shade", cylinder(0.16, 0.18, 1.8, 10), logShade, {
      position: [0, 0.1, 0],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1, 1, 0.95],
    }, { castShadow: false }),
    // Moss cap riding along the top of the log.
    f.mesh("Moss Cap", box(0.3, 0.05, 1.7), moss, {
      position: [0, 0.34, 0],
    }, { castShadow: false, receiveShadow: true }),
    // Two end caps — slim discs with ring grain.
    f.mesh("End Cap A", cylinder(0.21, 0.21, 0.04, 10), logShade, {
      position: [0, 0.18, -0.92],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
    f.mesh("End Cap B", cylinder(0.21, 0.21, 0.04, 10), logShade, {
      position: [0, 0.18, 0.92],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
  ];
  // Three small moss tufts on the log.
  const tufts: [number, number][] = [
    [0.0, -0.45],
    [-0.04, 0.1],
    [0.05, 0.55],
  ];
  for (let i = 0; i < tufts.length; i++) {
    parts.push(
      f.mesh(`Moss Tuft ${i}`, sphere(0.1, 10, 7), moss, {
        position: [tufts[i]![0], 0.4, tufts[i]![1]],
        scale: [1, 0.55, 1],
      }, { castShadow: false }),
    );
  }
  return f.group("Mossy Log", parts, { position: pos, rotation: [0, yaw, 0] });
}

/**
 * A small stacked-stone cairn at the back of the maple grove — three
 * stones of decreasing size stacked atop a flat slate footing, with a
 * thin moss fleck on the bottom stone's shoulder. Acts as a quiet
 * waypoint marker in the clearing.
 */
function buildStoneCairn(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stoneA = std(C.cairnStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneB = std(C.cairnStoneDark, 0.95, { flatShading: true });
  const moss = std(C.fallenLogMoss, 0.95, { flatShading: true });
  const parts: SceneNode[] = [
    f.mesh("Cairn Footing", cylinder(0.42, 0.46, 0.04, 14), stoneB, {
      position: [0, 0.02, 0],
    }, { receiveShadow: true }),
    f.mesh("Cairn Stone Bottom", sphere(0.36, 12, 9), stoneA, {
      position: [0, 0.24, 0],
      scale: [1.0, 0.6, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Cairn Stone Middle", sphere(0.26, 12, 9), stoneB, {
      position: [0.04, 0.5, -0.02],
      scale: [1.0, 0.65, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Cairn Stone Top", sphere(0.18, 12, 9), stoneA, {
      position: [-0.02, 0.72, 0.03],
      scale: [1.0, 0.7, 1.0],
    }, { castShadow: true }),
    // Moss fleck on the bottom stone's shoulder.
    f.mesh("Cairn Moss", sphere(0.12, 10, 7), moss, {
      position: [-0.22, 0.32, 0.18],
      scale: [1.0, 0.4, 0.9],
    }, { castShadow: false }),
  ];
  return f.group("Stone Cairn", parts, { position: pos, rotation: [0, 0.4, 0] });
}

/**
 * Windblown maple-leaf litter — a scatter of small flat leaf dabs in
 * crimson, amber and gold tones across the maple grove ground plane,
 * with thicker drifts banked against the lodge footing and the cairn.
 * The leaves sit just above the ground so they read as resting on the
 * surface, not embedded.
 */
function buildMapleLeafLitter(f: NodeFactory): SceneNode {
  const rng = mulberry32(0x17a91eaf);
  const cZ = NE_MAPLE_POS[2];
  const cX = NE_MAPLE_POS[0];
  const w = NE_MAPLE_W - 1.5;
  const d = NE_MAPLE_D - 1.5;
  const crimson: Transform[] = [];
  const amber: Transform[] = [];
  const gold: Transform[] = [];
  // Even scatter across the plane (but skip a small radius around the
  // lodge so leaves don't sit on the roof).
  for (let i = 0; i < 90; i++) {
    const lx = cX + (rng() - 0.5) * w;
    const lz = cZ + (rng() - 0.5) * d;
    if (Math.hypot(lx - HUNTING_LODGE_POS[0], lz - HUNTING_LODGE_POS[2]) < 2.0) continue;
    const bucket = i % 3 === 0 ? crimson : i % 3 === 1 ? amber : gold;
    bucket.push({
      position: [lx, 0.018, lz],
      rotation: [-Math.PI / 2, 0, rng() * Math.PI * 2],
      scale: [0.9 + rng() * 0.4, 1, 0.7 + rng() * 0.3],
    });
  }
  return f.group("Maple Leaf Litter", [
    f.instanced("Crimson Leaves", box(0.12, 0.01, 0.16), std(C.mapleCrimson, 0.85, { flatShading: true }), crimson, {
      castShadow: false, receiveShadow: true,
    }),
    f.instanced("Amber Leaves", box(0.12, 0.01, 0.16), std(C.mapleAmber, 0.85, { flatShading: true }), amber, {
      castShadow: false, receiveShadow: true,
    }),
    f.instanced("Gold Leaves", box(0.12, 0.01, 0.16), std(C.mapleGold, 0.85, { flatShading: true }), gold, {
      castShadow: false, receiveShadow: true,
    }),
  ]);
}

/* ─────────────── eighteenth-pass courtyard props ─────────────── */

/**
 * A bronze knight sentinel statue on a fluted marble pedestal — a slim
 * armoured figure standing watch on the east lawn, carrying a short
 * sword at his side and an upright kite shield in front of his chest.
 * The bronze body reuses the existing `copper-patina` colour + bump
 * pair so the verdigris mottling reads as crusted relief on the
 * shoulder pauldrons, the breastplate and the rounded helm. A small
 * cast plaque on the front face of the pedestal carries a slim raised
 * inscription disc.
 */
function buildKnightStatue(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const bronze: MaterialDef = {
    color: C.knightBronze,
    roughness: 0.55,
    metalness: 0.7,
    texture: "copper-patina",
    textureScale: [1, 2],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.025,
  };
  const bronzeShade: MaterialDef = {
    color: C.knightBronzeShade,
    roughness: 0.7,
    metalness: 0.5,
    flatShading: true,
  };
  const bronzeHi = std(C.knightBronzeHi, 0.4, { metalness: 0.85 });
  const pedestal = std(C.knightPedestalCream, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.03,
  });
  const pedestalShade = std(C.knightPedestalShade, 0.95, { flatShading: true });
  const accent = std(C.knightAccent, 0.4, { metalness: 0.6 });
  const parts: SceneNode[] = [];
  // ── Fluted marble pedestal ──
  const pedH = 0.78;
  parts.push(
    // Wide stepped footing — two slate-ish slabs stacked.
    f.mesh("Pedestal Footing", box(0.62, 0.06, 0.62), pedestalShade, {
      position: [0, 0.03, 0],
    }, { receiveShadow: true }),
    f.mesh("Pedestal Plinth", box(0.5, 0.08, 0.5), pedestalShade, {
      position: [0, 0.1, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Central fluted column drum.
    f.mesh("Pedestal Drum", cylinder(0.18, 0.2, pedH - 0.3, 14), pedestal, {
      position: [0, 0.14 + (pedH - 0.3) / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Eight vertical fluting grooves around the drum — slim dark slats.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(
      f.mesh(`Pedestal Flute ${i}`, box(0.02, pedH - 0.34, 0.04), pedestalShade, {
        position: [Math.cos(a) * 0.19, 0.14 + (pedH - 0.3) / 2, Math.sin(a) * 0.19],
        rotation: [0, a, 0],
      }, { castShadow: false }),
    );
  }
  parts.push(
    // Top capital — slightly wider than the drum.
    f.mesh("Pedestal Capital", box(0.46, 0.08, 0.46), pedestalShade, {
      position: [0, pedH - 0.04, 0],
    }, { castShadow: true, receiveShadow: true }),
    // A slim bronze plaque medallion on the front face.
    f.mesh("Pedestal Plaque", cylinder(0.08, 0.08, 0.02, 14), accent, {
      position: [0, pedH * 0.45, 0.22],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
  );
  // ── Knight body ──
  const bodyY = pedH;
  // Boots / greaves — two slim cylinders at the base.
  for (const side of [-1, 1] as const) {
    parts.push(
      f.mesh(`Greave ${side}`, cylinder(0.06, 0.07, 0.28, 10), bronzeShade, {
        position: [side * 0.07, bodyY + 0.14, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(`Boot ${side}`, box(0.1, 0.06, 0.16), bronze, {
        position: [side * 0.07, bodyY + 0.03, 0.04],
      }, { castShadow: true }),
    );
  }
  // Tasset / leg armour — slim trapezoid skirt.
  parts.push(
    f.mesh("Tasset Front", box(0.22, 0.18, 0.06), bronze, {
      position: [0, bodyY + 0.36, 0.08],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Tasset Back", box(0.22, 0.18, 0.06), bronzeShade, {
      position: [0, bodyY + 0.36, -0.08],
    }, { castShadow: true }),
    // Belt sash — slim raised band at the waist.
    f.mesh("Belt", cylinder(0.16, 0.16, 0.04, 16), accent, {
      position: [0, bodyY + 0.46, 0],
    }, { castShadow: false }),
  );
  // Breastplate — a wider, slightly rounded torso.
  parts.push(
    f.mesh("Breastplate", box(0.32, 0.36, 0.22), bronze, {
      position: [0, bodyY + 0.68, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Vertical centre rib on the breastplate.
    f.mesh("Breastplate Rib", box(0.04, 0.32, 0.24), bronzeHi, {
      position: [0, bodyY + 0.68, 0],
    }, { castShadow: false }),
    // Shoulder pauldrons — two slim spheres on each shoulder.
    f.mesh("Pauldron L", sphere(0.1, 12, 8), bronze, {
      position: [-0.18, bodyY + 0.88, 0],
      scale: [1.2, 0.8, 1.2],
    }, { castShadow: true }),
    f.mesh("Pauldron R", sphere(0.1, 12, 8), bronze, {
      position: [0.18, bodyY + 0.88, 0],
      scale: [1.2, 0.8, 1.2],
    }, { castShadow: true }),
  );
  // Arms — two slim bronze cylinders hanging at the sides.
  parts.push(
    f.mesh("Arm L", cylinder(0.05, 0.06, 0.38, 10), bronze, {
      position: [-0.22, bodyY + 0.66, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Arm R", cylinder(0.05, 0.06, 0.38, 10), bronze, {
      position: [0.22, bodyY + 0.66, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Gauntlets — slim cubes at the wrists.
    f.mesh("Gauntlet L", box(0.07, 0.06, 0.08), bronzeShade, {
      position: [-0.22, bodyY + 0.42, 0.02],
    }, { castShadow: true }),
    f.mesh("Gauntlet R", box(0.07, 0.06, 0.08), bronzeShade, {
      position: [0.22, bodyY + 0.42, 0.02],
    }, { castShadow: true }),
  );
  // Head + helm — a domed helm with a slim eye slit and a small crest plume.
  const headY = bodyY + 1.02;
  parts.push(
    // Neck collar.
    f.mesh("Gorget", cylinder(0.07, 0.09, 0.05, 12), bronzeShade, {
      position: [0, bodyY + 0.92, 0],
    }, { castShadow: false }),
    // Helm dome.
    f.mesh("Helm", sphere(0.12, 14, 10), bronze, {
      position: [0, headY, 0],
      scale: [1, 1.05, 1.05],
    }, { castShadow: true, receiveShadow: true }),
    // Slim eye slit — a dark horizontal band.
    f.mesh("Helm Slit", box(0.18, 0.025, 0.03), { color: "#1a1816", roughness: 0.9 }, {
      position: [0, headY + 0.02, 0.12],
    }, { castShadow: false }),
    // Crest comb — a slim raised fin along the top of the helm.
    f.mesh("Helm Crest", box(0.04, 0.06, 0.2), bronzeHi, {
      position: [0, headY + 0.11, 0],
    }, { castShadow: false }),
    // Pendant plume hanging from the crest.
    f.mesh("Helm Plume", box(0.04, 0.18, 0.04), std(C.mapleCrimson, 0.85, { flatShading: true }), {
      position: [0, headY + 0.04, -0.12],
      rotation: [-0.4, 0, 0],
    }, { castShadow: true }),
  );
  // Sword at the right hip — a long slim cylinder with a guard and pommel.
  parts.push(
    f.mesh("Sword Blade", cylinder(0.012, 0.012, 0.7, 6), bronzeHi, {
      position: [0.32, bodyY + 0.42, 0],
      rotation: [0, 0, 0.05],
    }, { castShadow: true }),
    f.mesh("Sword Guard", box(0.12, 0.025, 0.04), bronzeShade, {
      position: [0.32, bodyY + 0.76, 0],
    }, { castShadow: false }),
    f.mesh("Sword Grip", cylinder(0.018, 0.018, 0.08, 8), bronzeShade, {
      position: [0.32, bodyY + 0.82, 0],
    }, { castShadow: false }),
    f.mesh("Sword Pommel", sphere(0.022, 8, 6), accent, {
      position: [0.32, bodyY + 0.88, 0],
    }, { castShadow: false }),
  );
  // Kite shield held in front of the chest — a slim teardrop slab.
  parts.push(
    f.mesh("Shield Body", box(0.22, 0.42, 0.04), bronze, {
      position: [-0.18, bodyY + 0.62, 0.18],
      rotation: [0.1, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Decorative boss at the centre of the shield.
    f.mesh("Shield Boss", sphere(0.04, 12, 8), accent, {
      position: [-0.18, bodyY + 0.62, 0.21],
    }, { castShadow: false }),
    // Bronze trim around the shield edge — top horizontal band.
    f.mesh("Shield Trim", box(0.24, 0.025, 0.05), bronzeHi, {
      position: [-0.18, bodyY + 0.82, 0.18],
    }, { castShadow: false }),
  );
  return f.group("Bronze Knight Statue", parts, { position: pos, rotation: [0, -Math.PI / 6, 0] });
}

/**
 * A raised wooden cold frame planted with a row of three translucent
 * glass cloches (bell jars) sheltering seedlings — a small kitchen-
 * garden detail tucked onto the back lawn. The wooden bed sits on
 * short cross-stretcher posts so it reads as a raised box, and each
 * cloche encloses a small green seedling cluster so the silhouettes
 * read as dappled forms through the glass.
 */
function buildGlassCloches(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const frame = std(C.clocheFrame, 0.9, { texture: "wood", textureScale: [1.4, 0.4] });
  const frameShade = std(C.clocheFrameShade, 0.95, { flatShading: true });
  const soil = std(C.clocheSoil, 0.95, { flatShading: true });
  const seedling = std(C.clocheSeedling, 0.85, { flatShading: true });
  const seedlingShade = std(C.clocheSeedlingDark, 0.9, { flatShading: true });
  const glass: MaterialDef = {
    color: C.cloches,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.32,
  };
  const glassGlow: MaterialDef = {
    color: C.clochesGlow,
    roughness: 0.18,
    metalness: 0.0,
    transparent: true,
    opacity: 0.18,
  };
  const parts: SceneNode[] = [];
  // Raised wooden bed — a slim rectangular crate on four short posts.
  const bedW = 1.6;
  const bedD = 0.5;
  const bedH = 0.14;
  const bedY = 0.18;
  parts.push(
    // Four corner posts holding the box up off the ground.
    f.mesh("Post FL", box(0.06, bedY, 0.06), frameShade, {
      position: [-bedW / 2 + 0.06, bedY / 2, -bedD / 2 + 0.06],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Post FR", box(0.06, bedY, 0.06), frameShade, {
      position: [bedW / 2 - 0.06, bedY / 2, -bedD / 2 + 0.06],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Post BL", box(0.06, bedY, 0.06), frameShade, {
      position: [-bedW / 2 + 0.06, bedY / 2, bedD / 2 - 0.06],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Post BR", box(0.06, bedY, 0.06), frameShade, {
      position: [bedW / 2 - 0.06, bedY / 2, bedD / 2 - 0.06],
    }, { castShadow: true, receiveShadow: true }),
    // Bed frame — four plank slats around the soil rim.
    f.mesh("Bed Front Plank", box(bedW, bedH, 0.05), frame, {
      position: [0, bedY + bedH / 2, -bedD / 2 + 0.025],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Bed Back Plank", box(bedW, bedH, 0.05), frame, {
      position: [0, bedY + bedH / 2, bedD / 2 - 0.025],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Bed Left Plank", box(0.05, bedH, bedD), frame, {
      position: [-bedW / 2 + 0.025, bedY + bedH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Bed Right Plank", box(0.05, bedH, bedD), frame, {
      position: [bedW / 2 - 0.025, bedY + bedH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Soil surface — a slim dark slab filling the bed.
    f.mesh("Bed Soil", box(bedW - 0.1, 0.02, bedD - 0.1), soil, {
      position: [0, bedY + bedH - 0.02, 0],
    }, { receiveShadow: true }),
  );
  // Three cloches stamped along the bed — each a dome-and-knob bell jar
  // covering a small seedling cluster.
  for (let i = 0; i < 3; i++) {
    const cx = (i - 1) * 0.5;
    const cz = 0;
    const cloy = bedY + bedH;
    // Seedling — three small leaves clustered on the soil.
    parts.push(
      f.mesh(`Seedling Leaf A ${i}`, sphere(0.07, 10, 7), seedling, {
        position: [cx - 0.04, cloy + 0.05, cz - 0.03],
        scale: [1, 0.4, 1],
      }, { castShadow: false }),
      f.mesh(`Seedling Leaf B ${i}`, sphere(0.06, 10, 7), seedlingShade, {
        position: [cx + 0.04, cloy + 0.06, cz + 0.02],
        scale: [1, 0.4, 1],
      }, { castShadow: false }),
      f.mesh(`Seedling Stem ${i}`, cylinder(0.012, 0.012, 0.1, 6), seedlingShade, {
        position: [cx, cloy + 0.05, cz],
      }, { castShadow: false }),
    );
    // Glass bell jar — a dome (squashed sphere) with a small finial knob.
    parts.push(
      f.mesh(`Cloche Dome ${i}`, sphere(0.18, 18, 12), glass, {
        position: [cx, cloy + 0.18, cz],
        scale: [1, 1.4, 1],
      }, { castShadow: false, receiveShadow: true }),
      // Glow inner core — a slim plate inside the cloche that lifts the tone.
      f.mesh(`Cloche Glow ${i}`, sphere(0.15, 14, 10), glassGlow, {
        position: [cx, cloy + 0.16, cz],
        scale: [1, 1.3, 1],
      }, { castShadow: false }),
      // Rim at the base of the cloche where it meets the soil.
      f.mesh(`Cloche Rim ${i}`, cylinder(0.18, 0.18, 0.012, 18), frameShade, {
        position: [cx, cloy + 0.006, cz],
      }, { castShadow: false }),
      // Finial knob at the top of the cloche.
      f.mesh(`Cloche Knob ${i}`, sphere(0.025, 10, 8), frame, {
        position: [cx, cloy + 0.38, cz],
      }, { castShadow: false }),
    );
  }
  return f.group("Glass Cloche Cold Frame", parts, { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/* ─────────────── eighteenth-pass house detail ─────────────── */

/**
 * A pair of carved Victorian bargeboards with pendant drop finials —
 * one trimming the front gable rake, one the back. Each bargeboard is
 * a two-sided scroll panel hugging the gable's two pitches and meets
 * at the peak, with three pendant finial drops hanging from the lower
 * edge that emphasise the lacy silhouette against the sky. A small
 * carved central medallion at the gable peak frames the finial drops.
 */
function buildGableBargeboard(
  f: NodeFactory,
  pos: [number, number, number],
  facing: 1 | -1,
): SceneNode {
  const wood = std(C.bargeboardWood, 0.75, { texture: "wood", textureScale: [3, 1] });
  const shade = std(C.bargeboardShade, 0.85, { flatShading: true });
  const finial = std(C.bargeboardFinial, 0.65);
  // Each bargeboard panel spans the gable slope from peak to eave —
  // we'll mount two slim slabs that mirror the roof pitch.
  // Gable spans W=7, ROOF_H=2.2 → slope length ≈ sqrt((W/2)^2 + ROOF_H^2).
  const slope = Math.hypot(W / 2, ROOF_H);
  const slopeAngle = Math.atan2(ROOF_H, W / 2);
  const parts: SceneNode[] = [];
  // Two angled panels — left and right of the peak.
  for (const side of [-1, 1] as const) {
    const midX = (side * W) / 4;
    const midY = ROOF_H / 2 - 0.05;
    parts.push(
      // Main scalloped scroll panel — slim slab angled to the rake.
      f.mesh(`Bargeboard ${side}`, box(slope - 0.2, 0.22, 0.05), wood, {
        position: [midX, midY, 0],
        rotation: [0, 0, side * slopeAngle],
      }, { castShadow: true, receiveShadow: true }),
      // Decorative shade slat just below the panel.
      f.mesh(`Bargeboard Shade ${side}`, box(slope - 0.4, 0.06, 0.04), shade, {
        position: [midX, midY - 0.13, 0.01],
        rotation: [0, 0, side * slopeAngle],
      }, { castShadow: false }),
    );
    // Three pendant finial drops along the lower edge of each panel.
    for (let i = 0; i < 3; i++) {
      const t = -0.6 + i * 0.6;
      const dx = midX + Math.cos(side * slopeAngle) * t * (slope * 0.45);
      const dy = midY + Math.sin(side * slopeAngle) * t * (slope * 0.45) - 0.18;
      parts.push(
        f.mesh(`Drop Finial ${side} ${i}`, cone(0.05, 0.18, 6), finial, {
          position: [dx, dy, 0.01],
          rotation: [0, 0, Math.PI],
        }, { castShadow: true }),
        // Small connector knob between panel and finial.
        f.mesh(`Drop Knob ${side} ${i}`, sphere(0.03, 10, 6), wood, {
          position: [dx, dy + 0.13, 0.01],
        }, { castShadow: false }),
      );
    }
  }
  // Central peak medallion — a small carved disc where the two
  // bargeboard panels meet at the gable peak.
  parts.push(
    f.mesh("Peak Medallion", cylinder(0.12, 0.12, 0.05, 16), wood, {
      position: [0, ROOF_H * 0.95, 0.02],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
    // Small finial on top of the medallion.
    f.mesh("Peak Finial", cone(0.04, 0.16, 8), finial, {
      position: [0, ROOF_H * 1.02, 0.02],
    }, { castShadow: true }),
    // Pendant drop hanging from the medallion centre.
    f.mesh("Peak Drop", cone(0.06, 0.22, 6), finial, {
      position: [0, ROOF_H * 0.78, 0.02],
      rotation: [0, 0, Math.PI],
    }, { castShadow: true }),
  );
  // Rotate the whole bargeboard so the face points outward (front gable
  // faces +Z, back gable faces -Z). `facing` is +1 for front, -1 for back.
  const yaw = facing === 1 ? 0 : Math.PI;
  return f.group("Gable Bargeboard", parts, { position: pos, rotation: [0, yaw, 0] });
}

function buildGableBargeboards(f: NodeFactory): SceneNode {
  return f.group("Gable Bargeboards", [
    buildGableBargeboard(f, FRONT_BARGEBOARD_POS, 1),
    buildGableBargeboard(f, BACK_BARGEBOARD_POS, -1),
  ]);
}

/* ─────────────── eighteenth-pass scene extension ─────────────── */

/**
 * The northwest waterfall ravine — a granite-toned ground plane filling
 * the gap between the northwest woodland's north edge, the alpine
 * foothills' west edge and the lakefront's west edge. Aprons along all
 * three joins overlap the neighbours by ~1.5 units so the ground layer
 * has no holes at the seams. Inside the plane: a tall granite cliff
 * face along the north side, a tumbling three-tier waterfall cascading
 * off it into a fern-fringed plunge pool, an outflow stream that runs
 * south to a wooden plank footbridge, three alpine pines clinging to
 * the cliff rim and a scatter of mossy boulders ringing the pool.
 */
function buildNorthwestWaterfallRavine(f: NodeFactory): SceneNode {
  return f.group("Northwest Waterfall Ravine", [
    // Granite-toned ravine ground plane — surfaced with the new colour +
    // depth map pair so bedding cracks and lichen patches read as
    // raised relief at glancing sun.
    f.mesh(
      "Ravine Ground",
      plane(NW_RAVINE_W, NW_RAVINE_D),
      std(C.ravineGround, 0.96, {
        texture: "granite-cliff",
        textureScale: [3, 5],
        bumpMap: "granite-cliff-bump",
        bumpScale: 0.06,
      }),
      { position: NW_RAVINE_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // South apron — overlaps the northwest woodland's north edge with
    // the woodland's moss-toned grass so the seam reads as continuous.
    f.mesh(
      "Ravine South Apron",
      plane(NW_RAVINE_W, 3),
      std(C.woodlandGrass, 0.95, { texture: "grass", textureScale: [10, 1] }),
      {
        position: [NW_RAVINE_POS[0], -0.015, NW_RAVINE_POS[2] + NW_RAVINE_D / 2 - 1.5],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // North apron — overlaps the alpine foothills' south edge with the
    // alpine snow-toned moss so the seam reads as a continuous foothill.
    f.mesh(
      "Ravine North Apron",
      plane(NW_RAVINE_W, 3),
      std(C.alpineMoss, 0.95, { texture: "grass", textureScale: [10, 1] }),
      {
        position: [NW_RAVINE_POS[0], -0.015, NW_RAVINE_POS[2] - NW_RAVINE_D / 2 + 1.5],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // East apron — overlaps the lakefront's west edge with a slim
    // grass apron so the seam reads as a continuous shore.
    f.mesh(
      "Ravine East Apron",
      plane(2.5, NW_RAVINE_D),
      std(C.lakefrontGrass, 0.95, { texture: "grass", textureScale: [1, 12] }),
      {
        position: [NW_RAVINE_POS[0] + NW_RAVINE_W / 2 - 1.25, -0.015, NW_RAVINE_POS[2]],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildGraniteCliff(f),
    buildWaterfall(f, WATERFALL_POS),
    buildPlungePool(f, PLUNGE_POOL_POS),
    buildPlankBridge(f, PLANK_BRIDGE_POS),
    buildRavinePines(f),
    buildRavineBoulders(f),
  ]);
}

/**
 * A tall granite cliff face along the north edge of the ravine — a
 * wide stepped wall built from four staggered stone slabs so the
 * silhouette reads as a layered rock face rather than a flat plank.
 * The slabs reuse the new `granite-cliff` colour map paired with a
 * fissure depth map so the bedding cracks and lichen patches read as
 * raised relief at glancing sun.
 */
function buildGraniteCliff(f: NodeFactory): SceneNode {
  const granite = std(C.ravineCliff, 0.92, {
    texture: "granite-cliff",
    textureScale: [2, 2],
    bumpMap: "granite-cliff-bump",
    bumpScale: 0.08,
  });
  const graniteShade = std(C.ravineCliffShade, 0.95, { flatShading: true });
  const lichen = std(C.ravineLichen, 0.95, { flatShading: true });
  const parts: SceneNode[] = [];
  const cliffZ = RAVINE_CLIFF_Z - 1.5;
  // Four staggered slabs forming the cliff face — alternating wider /
  // narrower so the silhouette reads as a layered rock face.
  const slabs: { w: number; h: number; d: number; xo: number; yo: number; zo: number }[] = [
    { w: NW_RAVINE_W - 1, h: 3.0, d: 1.6, xo: 0, yo: 1.5, zo: 0 },
    { w: NW_RAVINE_W - 3, h: 1.6, d: 1.0, xo: -0.6, yo: 2.8, zo: 0.6 },
    { w: NW_RAVINE_W - 5, h: 1.1, d: 0.8, xo: 1.4, yo: 3.2, zo: 0.4 },
    { w: NW_RAVINE_W - 7, h: 0.8, d: 0.6, xo: -1.0, yo: 3.6, zo: 0.8 },
  ];
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i]!;
    const mat = i % 2 === 0 ? granite : graniteShade;
    parts.push(
      f.mesh(`Cliff Slab ${i}`, box(s.w, s.h, s.d), mat, {
        position: [-37 + s.xo, s.yo, cliffZ + s.zo],
        rotation: [(i % 2 === 0 ? 0 : 0.04), i * 0.04, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Notch for the waterfall — a slim dark recess running down the
  // centre of the cliff face where the water tumbles.
  parts.push(
    f.mesh("Cliff Notch", box(1.2, 2.8, 0.2), graniteShade, {
      position: [-37, 1.6, cliffZ + 0.95],
    }, { castShadow: false, receiveShadow: true }),
  );
  // Lichen patches — three slim flat boxes splashed across the face.
  const lichens: [number, number, number][] = [
    [-37 - 3.5, 2.6, cliffZ + 0.85],
    [-37 + 2.4, 1.4, cliffZ + 0.9],
    [-37 - 1.2, 3.1, cliffZ + 0.75],
  ];
  for (let i = 0; i < lichens.length; i++) {
    const p = lichens[i]!;
    parts.push(
      f.mesh(`Lichen Patch ${i}`, box(0.7, 0.5, 0.05), lichen, {
        position: p,
        rotation: [0, 0, (i % 2 === 0 ? 0.15 : -0.2)],
        scale: [1, 0.6, 1],
      }, { castShadow: false }),
    );
  }
  // A scatter of fallen stones piled at the base of the cliff face.
  const rng = mulberry32(0xface5a11);
  for (let i = 0; i < 10; i++) {
    const x = -37 + (rng() - 0.5) * (NW_RAVINE_W - 2);
    const z = cliffZ + 1.2 + rng() * 0.6;
    const r = 0.18 + rng() * 0.18;
    parts.push(
      f.mesh(`Base Stone ${i}`, sphere(r, 10, 8), i % 2 === 0 ? granite : graniteShade, {
        position: [x, r * 0.7, z],
        rotation: [0, rng() * Math.PI, 0],
        scale: [1, 0.7, 1],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  return f.group("Granite Cliff", parts);
}

/**
 * A tumbling three-tier waterfall cascading off the cliff face — three
 * stacked translucent panes carry the falling water column, with a
 * brighter highlight strip in the centre of each pane so the column
 * reads with depth. A small mist cloud at the base of the column
 * suggests spray where the water meets the plunge pool.
 */
function buildWaterfall(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const water: MaterialDef = {
    color: C.waterfallBlue,
    roughness: 0.18,
    metalness: 0.1,
    transparent: true,
    opacity: 0.78,
    emissive: "#3a6e8c",
  };
  const waterHi: MaterialDef = {
    color: C.waterfallHi,
    roughness: 0.12,
    metalness: 0.0,
    transparent: true,
    opacity: 0.55,
  };
  const mist: MaterialDef = {
    color: C.waterfallMist,
    roughness: 1.0,
    transparent: true,
    opacity: 0.3,
  };
  const parts: SceneNode[] = [
    // Top tier — water hitting the upper lip of the cliff.
    f.mesh("Falls Tier Top", box(0.9, 0.4, 0.06), water, {
      position: [0, 3.6, 0],
      rotation: [-0.1, 0, 0],
    }, { castShadow: false }),
    // Middle tier — the main column tumbling down the notch.
    f.mesh("Falls Tier Middle", box(0.8, 2.0, 0.06), water, {
      position: [0, 2.0, 0.12],
    }, { castShadow: false }),
    // Slim bright highlight strip in the centre of the main column.
    f.mesh("Falls Highlight", box(0.18, 1.8, 0.05), waterHi, {
      position: [0, 2.0, 0.16],
    }, { castShadow: false }),
    // Bottom tier — the column hitting the plunge pool, spreading out.
    f.mesh("Falls Tier Bottom", box(1.1, 0.4, 0.06), water, {
      position: [0, 0.3, 0.28],
      rotation: [0.18, 0, 0],
    }, { castShadow: false }),
    // Mist cloud at the base — two translucent spheres softening the
    // landing of the column.
    f.mesh("Mist A", sphere(0.42, 12, 8), mist, {
      position: [-0.2, 0.35, 0.4],
      scale: [1.2, 0.7, 1.0],
    }, { castShadow: false }),
    f.mesh("Mist B", sphere(0.35, 12, 8), { ...mist, opacity: 0.22 }, {
      position: [0.25, 0.5, 0.45],
      scale: [1.1, 0.8, 1.0],
    }, { castShadow: false }),
    f.mesh("Mist C", sphere(0.5, 12, 8), { ...mist, opacity: 0.16 }, {
      position: [0.0, 0.7, 0.32],
      scale: [1.3, 0.6, 1.1],
    }, { castShadow: false }),
  ];
  return f.group("Waterfall", parts, { position: pos });
}

/**
 * A fern-fringed plunge pool at the base of the waterfall — a flat
 * pool surface with a darker deep core, a brighter shoreline ring and
 * a scatter of fern fronds along the south rim where the outflow
 * stream begins. The pool surface sits just slightly above ground so
 * it reads as a calm sheet of water rather than a hole in the ground.
 */
function buildPlungePool(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const water = std(C.plungePoolSurface, 0.25, { metalness: 0.2 });
  const deepWater: MaterialDef = {
    color: C.plungePoolDeep,
    roughness: 0.35,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
  };
  const fernLight = std(C.ravineGrass, 0.85, { flatShading: true });
  const fernDark = std(C.ravinePineFoliage, 0.9, { flatShading: true });
  const parts: SceneNode[] = [
    // Pool surface — a flat disc just above ground level.
    f.mesh("Pool Surface", cylinder(1.7, 1.7, 0.02, 28), water, {
      position: [0, 0.02, 0],
    }, { receiveShadow: true }),
    // Deeper-water core — a smaller darker disc inside the surface.
    f.mesh("Pool Deep", cylinder(1.2, 1.2, 0.02, 24), deepWater, {
      position: [0, 0.025, 0],
    }, { receiveShadow: true }),
    // Subtle splash ring around the pool's centre where the water lands.
    f.mesh("Splash Ring", cylinder(0.4, 0.45, 0.025, 18), std(C.waterfallHi, 0.2), {
      position: [0, 0.035, -0.4],
    }, { castShadow: false }),
    // Outflow stream — a slim channel flowing south from the pool's
    // south rim toward the plank bridge.
    f.mesh("Outflow Stream", box(0.5, 0.02, 4.0), deepWater, {
      position: [0, 0.025, 2.4],
    }, { receiveShadow: true }),
  ];
  // Eight fern fronds scattered along the south rim of the pool.
  const rng = mulberry32(0xfee15a11);
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 4 + (rng() * Math.PI / 2);
    const r = 1.75 + rng() * 0.25;
    const fx = Math.cos(a) * r;
    const fz = Math.sin(a) * r + 0.6;
    const mat = i % 2 === 0 ? fernLight : fernDark;
    parts.push(
      f.mesh(`Fern Frond ${i}`, cone(0.16, 0.5, 6), mat, {
        position: [fx, 0.25, fz],
        rotation: [0, rng() * Math.PI, 0],
      }, { castShadow: false, receiveShadow: true }),
    );
  }
  return f.group("Plunge Pool", parts, { position: pos });
}

/**
 * A wooden plank footbridge crossing the outflow stream — six dark
 * planks running across the stream on two slim joists, with low rope
 * railings on each side anchored by short corner posts. Provides a
 * walking surface across the south end of the ravine.
 */
function buildPlankBridge(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const plank = std(C.bridgePlank, 0.95, { texture: "wood", textureScale: [1, 0.6] });
  const plankDark = std(C.bridgePlankDark, 0.95, { flatShading: true });
  const rope = std(C.bridgeRope, 0.92, { flatShading: true });
  const parts: SceneNode[] = [
    // Two joists running across the stream.
    f.mesh("Joist L", box(2.2, 0.08, 0.08), plankDark, {
      position: [-0.55, 0.12, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Joist R", box(2.2, 0.08, 0.08), plankDark, {
      position: [0.55, 0.12, 0],
    }, { castShadow: true, receiveShadow: true }),
  ];
  // Six planks running perpendicular to the joists.
  for (let i = 0; i < 6; i++) {
    const t = -1.0 + i * 0.4;
    parts.push(
      f.mesh(`Plank ${i}`, box(1.5, 0.04, 0.34), plank, {
        position: [0, 0.18, t],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Four short corner posts holding rope railings.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        f.mesh("Bridge Post", box(0.08, 0.5, 0.08), plankDark, {
          position: [sx * 0.7, 0.25 + 0.18, sz * 1.0],
        }, { castShadow: true }),
      );
    }
    // Rope railings running along each side — top + lower rope.
    parts.push(
      f.mesh("Rope Top", cylinder(0.025, 0.025, 2.0, 6), rope, {
        position: [sx * 0.7, 0.62, 0],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: false }),
      f.mesh("Rope Lower", cylinder(0.02, 0.02, 2.0, 6), rope, {
        position: [sx * 0.7, 0.42, 0],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: false }),
    );
  }
  return f.group("Plank Bridge", parts, { position: pos, rotation: [0, Math.PI / 16, 0] });
}

/**
 * Three alpine pine trees clinging to the rim of the cliff at the
 * north edge of the ravine — small slim conifers with a tapered
 * trunk and a stack of three foliage cones. Sized smaller than the
 * woodland pines so they read as scrubby cliff-clinging growth
 * rather than full-grown forest trees.
 */
function buildRavinePines(f: NodeFactory): SceneNode {
  const trunk = std(C.ravinePineTrunk, 0.95, { texture: "bark", textureScale: [1, 2] });
  const foliage = std(C.ravinePineFoliage, 0.85, { flatShading: true });
  const foliageDark = std(C.pineFoliageDark, 0.9, { flatShading: true });
  const trees: { x: number; z: number; scale: number }[] = [
    { x: -39, z: RAVINE_CLIFF_Z - 0.6, scale: 0.95 },
    { x: -34.5, z: RAVINE_CLIFF_Z - 1.2, scale: 0.85 },
    { x: -36, z: RAVINE_CLIFF_Z - 1.6, scale: 1.05 },
  ];
  const groups: SceneNode[] = [];
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i]!;
    const yt = 4.5; // pines sit on top of the cliff slabs
    const parts: SceneNode[] = [
      f.mesh("Trunk", cylinder(0.1, 0.14, 0.85, 8), trunk, {
        position: [0, yt + 0.42, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Lower Cone", cone(0.5, 0.65, 8), foliage, {
        position: [0, yt + 0.95, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh("Mid Cone", cone(0.36, 0.55, 8), foliageDark, {
        position: [0, yt + 1.3, 0],
      }, { castShadow: true }),
      f.mesh("Top Cone", cone(0.22, 0.4, 8), foliage, {
        position: [0, yt + 1.62, 0],
      }, { castShadow: true }),
    ];
    groups.push(
      f.group(`Alpine Pine ${i + 1}`, parts, {
        position: [t.x, 0, t.z],
        scale: [t.scale, t.scale, t.scale],
      }),
    );
  }
  return f.group("Ravine Alpine Pines", groups);
}

/**
 * Mossy boulders ringing the plunge pool — five rounded stones of
 * varying sizes scattered around the pool's south and east rims, each
 * crowned with a slim moss cap so they read as long-settled rocks
 * weathered by the spray.
 */
function buildRavineBoulders(f: NodeFactory): SceneNode {
  const stone = std(C.ravineCliff, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneShade = std(C.ravineCliffShade, 0.95, { flatShading: true });
  const moss = std(C.ravineBoulderMoss, 0.95, { flatShading: true });
  const positions: { x: number; z: number; r: number; tilt: number }[] = [
    { x: -34.6, z: -53.4, r: 0.55, tilt: 0.2 },
    { x: -39.2, z: -53.0, r: 0.48, tilt: -0.15 },
    { x: -35.5, z: -55.0, r: 0.42, tilt: 0.1 },
    { x: -38.8, z: -55.5, r: 0.36, tilt: -0.25 },
    { x: -37.0, z: -52.0, r: 0.5, tilt: 0.15 },
  ];
  const groups: SceneNode[] = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    const mat = i % 2 === 0 ? stone : stoneShade;
    const parts: SceneNode[] = [
      f.mesh("Boulder", sphere(p.r, 12, 9), mat, {
        position: [0, p.r * 0.6, 0],
        scale: [1, 0.7, 1],
        rotation: [p.tilt, i * 0.7, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Moss cap on top of the boulder.
      f.mesh("Moss Cap", sphere(p.r * 0.85, 12, 8), moss, {
        position: [0, p.r * 0.95, 0],
        scale: [1, 0.25, 1],
      }, { castShadow: false }),
    ];
    groups.push(f.group(`Boulder ${i + 1}`, parts, { position: [p.x, 0, p.z] }));
  }
  return f.group("Ravine Boulders", groups);
}

/* ─────────────── nineteenth-pass courtyard prop ─────────────── */

/**
 * A Victorian cast-bronze cupid fountain on the back-southwest lawn — a
 * tiered marble basin crowned by a slim cupid figure standing on a swelled
 * column pedestal. The cupid holds a terracotta flower vase aloft from
 * which a thin water column trickles into an upper bowl; a wider sheet of
 * water then falls over the rim of the upper bowl into a lower tiered
 * basin. The cupid body reuses the existing `copper-patina` colour + bump
 * pair so the verdigris mottling reads as crusted relief on the wings and
 * the slim limbs, and the tiered basins reuse the existing `marble` colour
 * + bump pair so the rim seams read as veined relief on the stone.
 */
function buildCupidFountain(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const bronze: MaterialDef = {
    color: C.cupidBronze,
    roughness: 0.55,
    metalness: 0.7,
    texture: "copper-patina",
    textureScale: [1, 2],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.025,
  };
  const bronzeShade: MaterialDef = {
    color: C.cupidBronzeShade,
    roughness: 0.75,
    metalness: 0.5,
    flatShading: true,
  };
  const bronzeHi = std(C.cupidBronzeHi, 0.4, { metalness: 0.85 });
  const marble = std(C.cupidBasinCream, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.03,
  });
  const marbleShade = std(C.cupidBasinShade, 0.95, { flatShading: true });
  const vase = std(C.cupidVase, 0.7, { texture: "wood", textureScale: [1, 1] });
  const water: MaterialDef = {
    color: C.cupidWater,
    roughness: 0.18,
    metalness: 0.2,
    transparent: true,
    opacity: 0.82,
    emissive: "#2a5a72",
  };
  const waterHi: MaterialDef = {
    color: C.cupidWaterHi,
    roughness: 0.15,
    metalness: 0.0,
    transparent: true,
    opacity: 0.55,
  };
  const parts: SceneNode[] = [];
  // ── Lower tiered basin (the broad catch bowl) ──
  parts.push(
    // Slate footing slab.
    f.mesh("Fountain Footing", cylinder(1.05, 1.15, 0.08, 24), marbleShade, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    // Lower basin rim — a wide marble ring.
    f.mesh("Lower Basin Rim", cylinder(0.95, 0.95, 0.12, 28), marble, {
      position: [0, 0.16, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Lower basin water surface — a slim disc just below the rim.
    f.mesh("Lower Basin Water", cylinder(0.88, 0.88, 0.04, 28), water, {
      position: [0, 0.2, 0],
    }, { receiveShadow: true }),
    // Inner darker plinth below the upper basin column.
    f.mesh("Fountain Inner Plinth", cylinder(0.28, 0.32, 0.18, 18), marbleShade, {
      position: [0, 0.32, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Central swelled column carrying the upper basin.
    f.mesh("Fountain Column", cylinder(0.16, 0.22, 0.5, 16), marble, {
      position: [0, 0.66, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Column collar — slim raised band.
    f.mesh("Fountain Collar", cylinder(0.24, 0.24, 0.04, 16), marbleShade, {
      position: [0, 0.92, 0],
    }, { castShadow: false }),
  );
  // Eight slim vertical fluting grooves around the column.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(
      f.mesh(`Column Flute ${i}`, box(0.02, 0.44, 0.03), marbleShade, {
        position: [Math.cos(a) * 0.2, 0.66, Math.sin(a) * 0.2],
        rotation: [0, a, 0],
      }, { castShadow: false }),
    );
  }
  // ── Upper tiered bowl ──
  parts.push(
    // Upper basin rim — a smaller marble ring.
    f.mesh("Upper Basin Rim", cylinder(0.5, 0.5, 0.1, 24), marble, {
      position: [0, 1.0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Upper basin water surface — a slim disc inside the rim.
    f.mesh("Upper Basin Water", cylinder(0.44, 0.44, 0.04, 24), water, {
      position: [0, 1.04, 0],
    }, { receiveShadow: true }),
    // Subtle splash highlight ring in the upper bowl centre.
    f.mesh("Upper Bowl Splash", cylinder(0.14, 0.16, 0.02, 18), waterHi, {
      position: [0, 1.06, 0],
    }, { castShadow: false }),
    // Slim spillway tongue draping over the upper basin's south rim.
    f.mesh("Upper Spillway", box(0.18, 0.12, 0.08), water, {
      position: [0, 0.98, 0.5],
      rotation: [-0.6, 0, 0],
    }, { castShadow: false }),
  );
  // ── Cupid figure on the upper basin centre ──
  const cy = 1.1;
  parts.push(
    // Pedestal stub on top of the upper basin where cupid stands.
    f.mesh("Cupid Plinth", cylinder(0.1, 0.12, 0.06, 12), bronzeShade, {
      position: [0, cy + 0.03, 0],
    }, { castShadow: true }),
    // Cupid legs — two slim cylinders.
    f.mesh("Cupid Leg L", cylinder(0.035, 0.04, 0.22, 8), bronze, {
      position: [-0.04, cy + 0.18, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Cupid Leg R", cylinder(0.035, 0.04, 0.22, 8), bronze, {
      position: [0.04, cy + 0.18, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Torso — a slim rounded body.
    f.mesh("Cupid Torso", sphere(0.1, 14, 10), bronze, {
      position: [0, cy + 0.36, 0],
      scale: [1, 1.4, 0.85],
    }, { castShadow: true, receiveShadow: true }),
    // Head.
    f.mesh("Cupid Head", sphere(0.09, 14, 10), bronze, {
      position: [0, cy + 0.55, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Slim halo of curls — a darker ring atop the head.
    f.mesh("Cupid Curls", cylinder(0.09, 0.09, 0.04, 14), bronzeShade, {
      position: [0, cy + 0.62, 0],
    }, { castShadow: false }),
    // Two small wings emerging from the back of the torso — slim shells.
    f.mesh("Wing L", box(0.18, 0.22, 0.03), bronze, {
      position: [-0.1, cy + 0.42, -0.08],
      rotation: [0.2, -0.35, 0.25],
    }, { castShadow: true }),
    f.mesh("Wing R", box(0.18, 0.22, 0.03), bronze, {
      position: [0.1, cy + 0.42, -0.08],
      rotation: [0.2, 0.35, -0.25],
    }, { castShadow: true }),
    // Slim feather detailing — bright highlight slats on the wings.
    f.mesh("Wing Feathers L", box(0.16, 0.2, 0.012), bronzeHi, {
      position: [-0.1, cy + 0.42, -0.07],
      rotation: [0.2, -0.35, 0.25],
    }, { castShadow: false }),
    f.mesh("Wing Feathers R", box(0.16, 0.2, 0.012), bronzeHi, {
      position: [0.1, cy + 0.42, -0.07],
      rotation: [0.2, 0.35, -0.25],
    }, { castShadow: false }),
    // Right arm raised — holding the vase aloft.
    f.mesh("Arm R", cylinder(0.025, 0.03, 0.32, 8), bronze, {
      position: [0.13, cy + 0.5, 0],
      rotation: [0, 0, -0.7],
    }, { castShadow: true }),
    // Left arm — relaxed at the side.
    f.mesh("Arm L", cylinder(0.025, 0.03, 0.28, 8), bronze, {
      position: [-0.11, cy + 0.34, 0],
      rotation: [0, 0, 0.15],
    }, { castShadow: true }),
  );
  // ── Vase held above the head ──
  const vaseY = cy + 0.78;
  parts.push(
    // Vase body — slim swelled jug.
    f.mesh("Vase Body", sphere(0.1, 14, 10), vase, {
      position: [0.18, vaseY, 0],
      scale: [1, 1.1, 1],
    }, { castShadow: true, receiveShadow: true }),
    // Vase rim — slim collar.
    f.mesh("Vase Rim", cylinder(0.08, 0.08, 0.03, 12), bronzeShade, {
      position: [0.18, vaseY + 0.1, 0],
    }, { castShadow: false }),
    // Thin water column trickling from the vase rim into the upper basin.
    f.mesh("Water Trickle", box(0.025, 0.32, 0.025), water, {
      position: [0.18, vaseY - 0.16, 0],
    }, { castShadow: false }),
    // Highlight strip down the centre of the trickle.
    f.mesh("Trickle Highlight", box(0.012, 0.28, 0.018), waterHi, {
      position: [0.185, vaseY - 0.14, 0.01],
    }, { castShadow: false }),
  );
  // ── Water cascade from upper basin to lower basin ──
  parts.push(
    // Falling water sheet on the south side.
    f.mesh("Cascade Sheet", box(0.4, 0.7, 0.04), water, {
      position: [0, 0.62, 0.55],
      rotation: [-0.25, 0, 0],
    }, { castShadow: false }),
    // Bright highlight strip along the cascade.
    f.mesh("Cascade Highlight", box(0.14, 0.6, 0.03), waterHi, {
      position: [0, 0.6, 0.58],
      rotation: [-0.25, 0, 0],
    }, { castShadow: false }),
    // Subtle splash ring in the lower basin where the cascade lands.
    f.mesh("Lower Splash", cylinder(0.18, 0.22, 0.025, 16), waterHi, {
      position: [0, 0.22, 0.55],
    }, { castShadow: false }),
  );
  return f.group("Cupid Fountain", parts, { position: pos, rotation: [0, -Math.PI / 5, 0] });
}

/* ─────────────── nineteenth-pass house detail ─────────────── */

/**
 * A single ornate cast-iron gable peak finial — a slim copper-patina
 * spire crowning the bargeboard medallion at the gable peak. Each finial
 * combines a tapered spire, a lobed medallion cap, an open quatrefoil
 * ring and a small pennant directional vane at the tip. The spire and
 * medallion reuse the existing `copper-patina` colour + bump pair so the
 * verdigris reads as crusted relief on the cast metal.
 */
function buildGablePeakFinial(
  f: NodeFactory,
  pos: [number, number, number],
  facing: 1 | -1,
): SceneNode {
  const spire: MaterialDef = {
    color: C.gableFinialSpire,
    roughness: 0.55,
    metalness: 0.7,
    texture: "copper-patina",
    textureScale: [1, 2],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.025,
  };
  const spireDark = std(C.gableFinialBase, 0.85, { metalness: 0.6, flatShading: true });
  const pennant = std(C.gableFinialPennant, 0.85, { flatShading: true });
  const parts: SceneNode[] = [
    // Base socket — a slim dark cap where the finial seats on the
    // bargeboard medallion.
    f.mesh("Finial Socket", cylinder(0.06, 0.08, 0.06, 10), spireDark, {
      position: [0, 0.03, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Lobed medallion cap — a wider disc just above the socket.
    f.mesh("Finial Medallion", cylinder(0.11, 0.11, 0.04, 16), spire, {
      position: [0, 0.08, 0],
    }, { castShadow: true }),
    // Quatrefoil ring — an open ornamental ring around the medallion.
    f.mesh("Finial Ring", cylinder(0.13, 0.13, 0.02, 20), spire, {
      position: [0, 0.12, 0],
    }, { castShadow: false }),
  ];
  // Four small lobed protrusions around the medallion ring.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(
      f.mesh(`Lobe ${i}`, sphere(0.022, 8, 6), spire, {
        position: [Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12],
      }, { castShadow: false }),
    );
  }
  parts.push(
    // Tapered spire shaft — the main finial column.
    f.mesh("Finial Shaft", cylinder(0.025, 0.05, 0.45, 10), spire, {
      position: [0, 0.36, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Mid-shaft knob — a slim raised bead halfway up the spire.
    f.mesh("Finial Bead", sphere(0.04, 12, 8), spire, {
      position: [0, 0.36, 0],
    }, { castShadow: false }),
    // Tip ball — a small ball at the top of the spire.
    f.mesh("Finial Tip", sphere(0.025, 10, 8), spire, {
      position: [0, 0.6, 0],
    }, { castShadow: false }),
    // Slim arrow vane — a narrow plate at the tip pointing outward, the
    // facing axis controls which way the arrow points.
    f.mesh("Finial Arrow", cone(0.025, 0.12, 6), spire, {
      position: [facing * 0.08, 0.6, 0],
      rotation: [0, 0, facing * -Math.PI / 2],
    }, { castShadow: false }),
    // Pennant flag — a slim strip waving on the back of the arrow.
    f.mesh("Finial Pennant", box(0.1, 0.04, 0.012), pennant, {
      position: [facing * 0.14, 0.6, 0],
    }, { castShadow: false }),
  );
  return f.group("Gable Peak Finial", parts, { position: pos });
}

function buildGablePeakFinials(f: NodeFactory): SceneNode {
  return f.group("Gable Peak Finials", [
    buildGablePeakFinial(f, GABLE_FINIAL_FRONT_POS, 1),
    buildGablePeakFinial(f, GABLE_FINIAL_BACK_POS, -1),
  ]);
}

/* ─────────────── nineteenth-pass scene extension ─────────────── */

/**
 * The southwest sunflower field — a cultivated yellow-and-brown ground
 * plane bridging the gap south of the wheat field's south edge and west
 * of the south heath's west edge. Aprons along the north (wheat) and
 * east (heath) joins overlap the neighbouring planes by ~1.5 units so
 * the ground layer has no holes at the seams. Inside the plane: six rows
 * of tall sunflower plants with bright yellow ray-petal faces and dark
 * seed-disc centres, a small board-and-batten tool shed at the northwest
 * corner with a peaked shingle roof, a scatter of straw bales between
 * the rows and a slim stake-and-twine fence along the south edge.
 */
function buildSouthwestSunflowerField(f: NodeFactory): SceneNode {
  return f.group("Southwest Sunflower Field", [
    // Main sunflower-field ground plane — surfaced with the new colour +
    // depth map pair so the planting rows and seed clumps read as raised
    // relief at glancing sun.
    f.mesh(
      "Sunflower Field Ground",
      plane(SUNFLOWER_FIELD_W, SUNFLOWER_FIELD_D),
      std(C.sunflowerGround, 0.95, {
        texture: "sunflower-field",
        textureScale: [4, 5],
        bumpMap: "sunflower-field-bump",
        bumpScale: 0.05,
      }),
      { position: SUNFLOWER_FIELD_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // North apron — overlaps the wheat field's south edge with a paler
    // stubble strip so the seam reads as a harvested fringe.
    f.mesh(
      "Sunflower North Apron",
      plane(SUNFLOWER_FIELD_W, 3),
      std(C.wheatStubble, 0.95, { texture: "grass", textureScale: [8, 1] }),
      {
        position: [
          SUNFLOWER_FIELD_POS[0],
          -0.016,
          SUNFLOWER_FIELD_POS[2] - SUNFLOWER_FIELD_D / 2 + 1.5,
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // East apron — overlaps the south heath's west edge with a heather-
    // toned strip so the seam reads as a continuous heath fringe.
    f.mesh(
      "Sunflower East Apron",
      plane(3, SUNFLOWER_FIELD_D),
      std(C.heathMoss, 0.95, { texture: "grass", textureScale: [1, 8] }),
      {
        position: [
          SUNFLOWER_FIELD_POS[0] + SUNFLOWER_FIELD_W / 2 - 1.5,
          -0.016,
          SUNFLOWER_FIELD_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildSunflowerRows(f),
    buildSunflowerShed(f, SUNFLOWER_SHED_POS),
    buildSunflowerStrawBales(f),
    buildSunflowerFieldFence(f),
  ]);
}

/**
 * Six rows of tall sunflower plants growing across the field — each plant
 * a slim stem with two upper leaves and a wide bright bloom face. Plants
 * are nudged off-axis so the rows read as hand-planted rather than
 * machine-perfect. Each bloom is a layered ray-petal disc around a dark
 * seed centre with a brighter inner core.
 */
function buildSunflowerRows(f: NodeFactory): SceneNode {
  const stem = std(C.sunflowerStem, 0.9, { flatShading: true });
  const leaf = std(C.sunflowerLeaf, 0.85, { flatShading: true });
  const leafDark = std(C.sunflowerLeafDark, 0.9, { flatShading: true });
  const petal = std(C.sunflowerPetal, 0.7, { flatShading: true });
  const petalHi = std(C.sunflowerPetalHi, 0.55);
  const center = std(C.sunflowerCenter, 0.95, { flatShading: true });
  const centerHi = std(C.sunflowerCenterHi, 0.9, { flatShading: true });
  const rng = mulberry32(0x5f10ed);
  const rows: SceneNode[] = [];
  const cx = SUNFLOWER_FIELD_POS[0];
  const cz = SUNFLOWER_FIELD_POS[2];
  // Six rows running east-west; each row carries six plants.
  for (let r = 0; r < 6; r++) {
    const rowZ = cz - SUNFLOWER_FIELD_D / 2 + 3.5 + r * 3.6;
    for (let i = 0; i < 6; i++) {
      const px = cx - SUNFLOWER_FIELD_W / 2 + 3.0 + i * 2.8 + (rng() - 0.5) * 0.7;
      const pz = rowZ + (rng() - 0.5) * 0.5;
      const stemH = 1.5 + rng() * 0.4;
      const headTilt = (rng() - 0.5) * 0.3;
      const headYaw = (i + r) % 2 === 0 ? 0.4 : -0.4;
      const parts: SceneNode[] = [
        // Stem.
        f.mesh("Stem", cylinder(0.04, 0.06, stemH, 6), stem, {
          position: [0, stemH / 2, 0],
        }, { castShadow: true, receiveShadow: true }),
        // Lower leaf cluster — two angled blade-shaped leaves.
        f.mesh("Leaf Lower L", box(0.32, 0.06, 0.16), leaf, {
          position: [-0.16, stemH * 0.45, 0],
          rotation: [0, 0, -0.4],
        }, { castShadow: false }),
        f.mesh("Leaf Lower R", box(0.32, 0.06, 0.16), leafDark, {
          position: [0.16, stemH * 0.45, 0],
          rotation: [0, 0, 0.4],
        }, { castShadow: false }),
        // Upper leaf cluster — slightly smaller, higher on the stem.
        f.mesh("Leaf Upper L", box(0.24, 0.05, 0.12), leaf, {
          position: [-0.12, stemH * 0.75, 0],
          rotation: [0, 0.5, -0.3],
        }, { castShadow: false }),
        f.mesh("Leaf Upper R", box(0.24, 0.05, 0.12), leafDark, {
          position: [0.12, stemH * 0.75, 0],
          rotation: [0, -0.5, 0.3],
        }, { castShadow: false }),
      ];
      // ── Sunflower bloom — layered ray-petal disc + dark seed centre ──
      const headY = stemH + 0.08;
      // Eight ray petals arranged around the bloom centre.
      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        parts.push(
          f.mesh(`Ray Petal ${p}`, cone(0.08, 0.25, 6), p % 2 === 0 ? petal : petalHi, {
            position: [Math.cos(a) * 0.22, headY, Math.sin(a) * 0.22],
            rotation: [Math.PI / 2 + Math.sin(a) * 0.2, a, headTilt],
            scale: [1, 1, 0.55],
          }, { castShadow: false }),
        );
      }
      // Dark seed disc — a flat squat cylinder behind the petals.
      parts.push(
        f.mesh("Seed Disc", cylinder(0.18, 0.18, 0.04, 16), center, {
          position: [0, headY, 0],
          rotation: [Math.PI / 2, 0, 0],
        }, { castShadow: true, receiveShadow: true }),
        // Brighter inner core — a smaller disc on top of the seeds.
        f.mesh("Seed Core", cylinder(0.1, 0.1, 0.02, 14), centerHi, {
          position: [0, headY + 0.02, 0],
          rotation: [Math.PI / 2, 0, 0],
        }, { castShadow: false }),
      );
      rows.push(
        f.group(`Sunflower ${r}-${i}`, parts, {
          position: [px, 0, pz],
          rotation: [0, headYaw + rng() * 0.3, 0],
        }),
      );
    }
  }
  return f.group("Sunflower Rows", rows);
}

/**
 * A small board-and-batten tool shed at the northwest corner of the field
 * — a low rectangular box with a peaked shingle roof, a slatted side
 * wall, a sun-bleached plank door and a small slat window. Provides a
 * focal silhouette at the field's far corner so the eye reads the plane
 * as a working farm rather than an empty plot.
 */
function buildSunflowerShed(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wall = std(C.sunflowerShedWood, 0.95, { texture: "wood", textureScale: [1, 1.8] });
  const trim = std(C.sunflowerShedTrim, 0.85, { flatShading: true });
  const roof = std(C.sunflowerShedRoof, 0.9, { texture: "shingle", textureScale: [3, 1] });
  const door = std(C.sunflowerShedDoor, 0.95, { texture: "wood", textureScale: [1, 1.3] });
  const windowPane: MaterialDef = {
    color: "#a8c4d8",
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.65,
  };
  const wallW = 1.6;
  const wallH = 1.5;
  const wallD = 1.2;
  const parts: SceneNode[] = [
    // Stone footing slab.
    f.mesh("Shed Footing", box(wallW + 0.2, 0.08, wallD + 0.2), trim, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    // Main shed body — a low box with a flat roof on top.
    f.mesh("Shed Wall", box(wallW, wallH, wallD), wall, {
      position: [0, wallH / 2 + 0.08, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Eight vertical battens — slim raised trim strips around the wall.
    f.mesh("Batten Front 1", box(0.05, wallH, 0.025), trim, {
      position: [-wallW / 4, wallH / 2 + 0.08, wallD / 2 + 0.01],
    }, { castShadow: false }),
    f.mesh("Batten Front 2", box(0.05, wallH, 0.025), trim, {
      position: [wallW / 4, wallH / 2 + 0.08, wallD / 2 + 0.01],
    }, { castShadow: false }),
    f.mesh("Batten Back 1", box(0.05, wallH, 0.025), trim, {
      position: [-wallW / 4, wallH / 2 + 0.08, -wallD / 2 - 0.01],
    }, { castShadow: false }),
    f.mesh("Batten Back 2", box(0.05, wallH, 0.025), trim, {
      position: [wallW / 4, wallH / 2 + 0.08, -wallD / 2 - 0.01],
    }, { castShadow: false }),
    f.mesh("Batten Side L", box(0.025, wallH, 0.05), trim, {
      position: [-wallW / 2 - 0.01, wallH / 2 + 0.08, 0],
    }, { castShadow: false }),
    f.mesh("Batten Side R", box(0.025, wallH, 0.05), trim, {
      position: [wallW / 2 + 0.01, wallH / 2 + 0.08, 0],
    }, { castShadow: false }),
    // Peaked roof — two angled box panels meeting at a ridge.
    f.mesh("Roof L", box(wallW + 0.3, 0.06, wallD * 0.7), roof, {
      position: [0, wallH + 0.34, -wallD / 4],
      rotation: [0.45, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof R", box(wallW + 0.3, 0.06, wallD * 0.7), roof, {
      position: [0, wallH + 0.34, wallD / 4],
      rotation: [-0.45, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Roof ridge cap — a slim board running along the peak.
    f.mesh("Roof Ridge", box(wallW + 0.34, 0.04, 0.07), trim, {
      position: [0, wallH + 0.55, 0],
    }, { castShadow: false }),
    // Front door — a slim plank slab on the south face.
    f.mesh("Shed Door", box(0.42, 1.0, 0.04), door, {
      position: [0, 0.58, wallD / 2 + 0.02],
    }, { castShadow: true }),
    f.mesh("Door Frame", box(0.5, 1.08, 0.05), trim, {
      position: [0, 0.62, wallD / 2 + 0.01],
    }, { castShadow: false }),
    // Door knob.
    f.mesh("Door Knob", sphere(0.025, 10, 8), std("#c2a35a", 0.4, { metalness: 0.7 }), {
      position: [0.13, 0.6, wallD / 2 + 0.05],
    }, { castShadow: false }),
    // Slim window on the east face — a square pane with a cross muntin.
    f.mesh("Side Window", box(0.04, 0.36, 0.36), windowPane, {
      position: [wallW / 2 + 0.02, wallH * 0.65 + 0.08, 0],
    }, { castShadow: false }),
    f.mesh("Window Muntin H", box(0.045, 0.04, 0.38), trim, {
      position: [wallW / 2 + 0.025, wallH * 0.65 + 0.08, 0],
    }, { castShadow: false }),
    f.mesh("Window Muntin V", box(0.045, 0.38, 0.04), trim, {
      position: [wallW / 2 + 0.025, wallH * 0.65 + 0.08, 0],
    }, { castShadow: false }),
  ];
  return f.group("Sunflower Shed", parts, { position: pos, rotation: [0, Math.PI / 5, 0] });
}

/**
 * Five rectangular straw bales scattered between the sunflower rows —
 * each bale a slim box with a slightly raised, banded straw colour so
 * the silhouettes read as harvested hay rather than empty soil. Adds a
 * working-farm reading to the field.
 */
function buildSunflowerStrawBales(f: NodeFactory): SceneNode {
  const baleMat = std(C.sunflowerStrawBale, 0.95, { texture: "burlap", textureScale: [2, 1], flatShading: true });
  const baleDarkMat = std(C.sunflowerStrawBaleDark, 0.95, { flatShading: true });
  const rng = mulberry32(0xba1eba1e);
  const bales: SceneNode[] = [];
  const cx = SUNFLOWER_FIELD_POS[0];
  const cz = SUNFLOWER_FIELD_POS[2];
  const placements: { x: number; z: number; yaw: number }[] = [
    { x: cx - 7.5, z: cz + 8, yaw: 0.1 },
    { x: cx + 4, z: cz - 6, yaw: 0.6 },
    { x: cx - 2, z: cz - 9, yaw: -0.3 },
    { x: cx + 6, z: cz + 3, yaw: 0.2 },
    { x: cx - 4, z: cz + 4, yaw: -0.5 },
  ];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    const tilt = (rng() - 0.5) * 0.1;
    const parts: SceneNode[] = [
      // Main bale body.
      f.mesh("Bale Body", box(0.9, 0.6, 0.55), baleMat, {
        position: [0, 0.3, 0],
        rotation: [tilt, 0, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Two slim binding bands around the bale.
      f.mesh("Bale Band 1", box(0.92, 0.05, 0.57), baleDarkMat, {
        position: [0, 0.18, 0],
      }, { castShadow: false }),
      f.mesh("Bale Band 2", box(0.92, 0.05, 0.57), baleDarkMat, {
        position: [0, 0.42, 0],
      }, { castShadow: false }),
    ];
    bales.push(
      f.group(`Straw Bale ${i + 1}`, parts, {
        position: [p.x, 0, p.z],
        rotation: [0, p.yaw, 0],
      }),
    );
  }
  return f.group("Sunflower Straw Bales", bales);
}

/**
 * A slim stake-and-twine perimeter fence along the southern edge of the
 * sunflower field — a row of short wooden stakes connected by two pale
 * twine strands. Marks the field's south boundary without intruding on
 * the larger silhouettes.
 */
function buildSunflowerFieldFence(f: NodeFactory): SceneNode {
  const stake = std(C.sunflowerFenceStake, 0.9, { texture: "wood", textureScale: [1, 1.4] });
  const twine = std(C.sunflowerTwine, 0.95, { flatShading: true });
  const parts: SceneNode[] = [];
  const z = SUNFLOWER_FIELD_POS[2] + SUNFLOWER_FIELD_D / 2 - 0.7;
  const xStart = SUNFLOWER_FIELD_POS[0] - SUNFLOWER_FIELD_W / 2 + 1.5;
  const xEnd = SUNFLOWER_FIELD_POS[0] + SUNFLOWER_FIELD_W / 2 - 1.5;
  const count = 11;
  const step = (xEnd - xStart) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = xStart + i * step;
    parts.push(
      f.mesh(`Stake ${i + 1}`, box(0.05, 0.55, 0.05), stake, {
        position: [x, 0.275, z],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Two twine strands running between stakes.
  parts.push(
    f.mesh("Twine Top", cylinder(0.012, 0.012, xEnd - xStart, 6), twine, {
      position: [(xStart + xEnd) / 2, 0.46, z],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
    f.mesh("Twine Lower", cylinder(0.012, 0.012, xEnd - xStart, 6), twine, {
      position: [(xStart + xEnd) / 2, 0.28, z],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
  );
  return f.group("Sunflower Fence", parts);
}

/* ─────────────── twentieth-pass courtyard prop ─────────────── */

/**
 * A Victorian ornamental iron birdcage aviary on a fluted marble plinth —
 * a swelled domed cage built from a ring of vertical iron bars and three
 * horizontal hoop rings, containing a slender central perch with a small
 * bright bird on top. The cage is crowned by a slim copper-patina finial
 * spire and seats on a fluted marble plinth ringed by a slim copper-
 * patina trim ring. The iron bars, hoops and finial spire reuse the
 * existing `copper-patina` colour + bump pair so the verdigris mottling
 * reads as crusted relief on the cast metal, and the plinth reuses the
 * existing `marble` colour + bump pair so the stone reads with veined
 * relief on the column.
 */
function buildBirdcageAviary(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const iron: MaterialDef = {
    color: C.aviaryIron,
    roughness: 0.55,
    metalness: 0.7,
    texture: "copper-patina",
    textureScale: [1, 2],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.025,
  };
  const ironShade = std(C.aviaryIronShade, 0.75, { metalness: 0.5, flatShading: true });
  const ironHi = std(C.aviaryIronHi, 0.4, { metalness: 0.85 });
  const marble = std(C.aviaryPlinth, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.03,
  });
  const marbleShade = std(C.aviaryPlinthShade, 0.95, { flatShading: true });
  const perch = std(C.aviaryPerch, 0.95, { texture: "wood", textureScale: [1, 1] });
  const bird = std(C.aviaryBird, 0.85, { flatShading: true });
  const birdWing = std(C.aviaryBirdWing, 0.9, { flatShading: true });
  const birdBeak = std(C.aviaryBirdBeak, 0.85, { flatShading: true });
  const parts: SceneNode[] = [];
  // ── Fluted marble plinth ──
  parts.push(
    // Square slate footing.
    f.mesh("Aviary Footing", box(1.0, 0.08, 1.0), marbleShade, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    // Plinth base — a wider stepped cap.
    f.mesh("Plinth Base", cylinder(0.42, 0.45, 0.1, 18), marble, {
      position: [0, 0.13, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Plinth column — the swelled fluted shaft.
    f.mesh("Plinth Column", cylinder(0.3, 0.34, 0.6, 16), marble, {
      position: [0, 0.48, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Plinth cap — slim ring at the top.
    f.mesh("Plinth Cap", cylinder(0.42, 0.42, 0.06, 18), marble, {
      position: [0, 0.81, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Copper-patina trim ring sitting on the plinth cap where the cage
    // base seats on the stone.
    f.mesh("Plinth Trim Ring", cylinder(0.39, 0.39, 0.03, 20), iron, {
      position: [0, 0.85, 0],
    }, { castShadow: false }),
  );
  // Eight slim vertical fluting grooves around the plinth column.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(
      f.mesh(`Plinth Flute ${i}`, box(0.025, 0.54, 0.03), marbleShade, {
        position: [Math.cos(a) * 0.32, 0.48, Math.sin(a) * 0.32],
        rotation: [0, a, 0],
      }, { castShadow: false }),
    );
  }
  // ── Iron cage base + dome ──
  const cageY = 0.88;
  const cageRadius = 0.36;
  const cageHeight = 0.7;
  const domeY = cageY + cageHeight;
  parts.push(
    // Cage floor disc — a slim dark plate at the bottom of the cage.
    f.mesh("Cage Floor", cylinder(cageRadius, cageRadius, 0.03, 20), ironShade, {
      position: [0, cageY + 0.015, 0],
    }, { receiveShadow: true }),
    // Cage base ring — slim hoop just above the floor.
    f.mesh("Cage Base Ring", cylinder(cageRadius + 0.01, cageRadius + 0.01, 0.025, 22), iron, {
      position: [0, cageY + 0.04, 0],
    }, { castShadow: false }),
  );
  // Twelve vertical cage bars running around the perimeter.
  const bars = 12;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    parts.push(
      f.mesh(`Cage Bar ${i}`, cylinder(0.012, 0.012, cageHeight, 6), iron, {
        position: [Math.cos(a) * cageRadius, cageY + cageHeight / 2, Math.sin(a) * cageRadius],
      }, { castShadow: true }),
    );
  }
  // Three horizontal hoop rings tying the bars together.
  for (let h = 0; h < 3; h++) {
    const y = cageY + 0.15 + h * 0.22;
    parts.push(
      f.mesh(`Cage Hoop ${h}`, cylinder(cageRadius + 0.005, cageRadius + 0.005, 0.018, 22), iron, {
        position: [0, y, 0],
      }, { castShadow: false }),
    );
  }
  // ── Domed cage roof ──
  // Eight curved iron strips arching from the cage rim up to a central
  // apex — built as slim angled boxes giving a stylised dome silhouette.
  const ribs = 8;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    parts.push(
      f.mesh(`Dome Rib ${i}`, box(0.015, 0.42, 0.015), iron, {
        position: [Math.cos(a) * cageRadius * 0.6, domeY + 0.12, Math.sin(a) * cageRadius * 0.6],
        rotation: [Math.sin(a) * 0.6, a, -Math.cos(a) * 0.6],
      }, { castShadow: true }),
    );
  }
  // Dome rim — slim hoop at the dome's base where it meets the cage top.
  parts.push(
    f.mesh("Dome Rim", cylinder(cageRadius + 0.005, cageRadius + 0.005, 0.025, 22), iron, {
      position: [0, domeY, 0],
    }, { castShadow: false }),
    // Dome apex cap — small disc at the top where the ribs meet.
    f.mesh("Dome Cap", cylinder(0.05, 0.06, 0.04, 14), ironShade, {
      position: [0, domeY + 0.32, 0],
    }, { castShadow: true }),
    // Finial socket — slim tapered base above the cap.
    f.mesh("Finial Socket", cylinder(0.025, 0.04, 0.04, 10), iron, {
      position: [0, domeY + 0.36, 0],
    }, { castShadow: false }),
    // Finial spire — a tapered copper-patina spike.
    f.mesh("Finial Spire", cylinder(0.01, 0.025, 0.22, 8), iron, {
      position: [0, domeY + 0.49, 0],
    }, { castShadow: true }),
    // Finial bead — small bead halfway up the spire.
    f.mesh("Finial Bead", sphere(0.025, 10, 8), iron, {
      position: [0, domeY + 0.42, 0],
    }, { castShadow: false }),
    // Finial tip ball — small bright ball at the top of the spire.
    f.mesh("Finial Tip", sphere(0.02, 10, 8), ironHi, {
      position: [0, domeY + 0.62, 0],
    }, { castShadow: false }),
  );
  // ── Cage door — a slim arched frame on the south face of the cage ──
  parts.push(
    // Door arch outline — two slim vertical bars set just outside the
    // main cage bars on the south face.
    f.mesh("Door Bar L", cylinder(0.014, 0.014, cageHeight * 0.65, 6), ironHi, {
      position: [-0.085, cageY + cageHeight * 0.33, cageRadius + 0.01],
    }, { castShadow: false }),
    f.mesh("Door Bar R", cylinder(0.014, 0.014, cageHeight * 0.65, 6), ironHi, {
      position: [0.085, cageY + cageHeight * 0.33, cageRadius + 0.01],
    }, { castShadow: false }),
    // Door arch top — slim curved bar across the top of the door.
    f.mesh("Door Arch", box(0.19, 0.018, 0.02), ironHi, {
      position: [0, cageY + cageHeight * 0.66, cageRadius + 0.01],
    }, { castShadow: false }),
    // Door latch — tiny knob on the right door bar.
    f.mesh("Door Latch", sphere(0.018, 8, 6), ironShade, {
      position: [0.085, cageY + cageHeight * 0.34, cageRadius + 0.03],
    }, { castShadow: false }),
  );
  // ── Central perch with a small bright bird on top ──
  const perchY = cageY + 0.32;
  parts.push(
    // Perch post — slim wooden cylinder.
    f.mesh("Perch Post", cylinder(0.018, 0.022, 0.36, 8), perch, {
      position: [0, perchY, 0],
    }, { castShadow: true }),
    // Perch cross bar — a slim horizontal stick for the bird to sit on.
    f.mesh("Perch Bar", cylinder(0.014, 0.014, 0.22, 7), perch, {
      position: [0, perchY + 0.16, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    // Bird body — a small ovoid sitting on the perch bar.
    f.mesh("Bird Body", sphere(0.055, 12, 10), bird, {
      position: [0.04, perchY + 0.22, 0],
      scale: [1.0, 0.85, 1.25],
    }, { castShadow: true, receiveShadow: true }),
    // Bird head — a smaller sphere just ahead of the body.
    f.mesh("Bird Head", sphere(0.038, 12, 10), bird, {
      position: [0.09, perchY + 0.25, 0.02],
    }, { castShadow: true }),
    // Bird beak — small cone pointing outward.
    f.mesh("Bird Beak", cone(0.012, 0.04, 6), birdBeak, {
      position: [0.12, perchY + 0.25, 0.02],
      rotation: [0, 0, -Math.PI / 2],
    }, { castShadow: false }),
    // Bird wing — a small angled patch on the body's side.
    f.mesh("Bird Wing", box(0.05, 0.025, 0.04), birdWing, {
      position: [0.04, perchY + 0.24, -0.03],
      rotation: [0.2, 0, 0.1],
    }, { castShadow: false }),
    // Bird tail — a slim wedge angled back from the body.
    f.mesh("Bird Tail", cone(0.022, 0.07, 6), birdWing, {
      position: [-0.025, perchY + 0.23, 0],
      rotation: [0, 0, Math.PI / 2.4],
    }, { castShadow: false }),
    // Tiny dark eye dot on the head.
    f.mesh("Bird Eye", sphere(0.006, 6, 6), birdBeak, {
      position: [0.105, perchY + 0.262, 0.025],
    }, { castShadow: false }),
  );
  // Scatter of tiny seed dots on the cage floor.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      f.mesh(`Seed ${i}`, sphere(0.008, 6, 6), birdBeak, {
        position: [Math.cos(a) * 0.22, cageY + 0.04, Math.sin(a) * 0.22],
      }, { castShadow: false }),
    );
  }
  return f.group("Birdcage Aviary", parts, { position: pos, rotation: [0, Math.PI / 5, 0] });
}

/* ─────────────── twentieth-pass house detail ─────────────── */

/**
 * A row of ornate Victorian iron ridge cresting pickets running along
 * the main roof ridge between the front and back gable peaks. Each
 * picket is a slim copper-patina spire seated on a low scroll bracket
 * with a small mid-shaft bead and a spear-tip cap, and short ornamental
 * scroll caps between adjacent pickets read as the lacy filigree
 * typical of cast-iron ridge cresting. The cresting reuses the existing
 * `copper-patina` colour + bump pair so the verdigris reads as crusted
 * relief on the cast metal. The line of pickets stops short of the
 * gable peaks so the existing roof finial and gable-peak finials remain
 * the dominant accents at the ridge ends.
 */
function buildIronRidgeCresting(f: NodeFactory): SceneNode {
  const iron: MaterialDef = {
    color: C.ridgeCresting,
    roughness: 0.55,
    metalness: 0.7,
    texture: "copper-patina",
    textureScale: [1, 2],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.025,
  };
  const ironShade = std(C.ridgeCrestingShade, 0.75, { metalness: 0.5, flatShading: true });
  const ironHi = std(C.ridgeCrestingHi, 0.4, { metalness: 0.85 });
  const ridgeY = ROOF_TOP + ROOF_H + 0.16;
  // Span the cresting between the front and back gables, leaving small
  // margins so the existing finials at the gable peaks read as separate
  // accents.
  const zStart = FRONT_Z - 0.4;
  const zEnd = BACK_Z + 0.4;
  const span = zStart - zEnd;
  const pickets = RIDGE_CRESTING_PICKETS;
  const step = span / (pickets - 1);
  const parts: SceneNode[] = [];
  // ── Mounting rail — a slim flat strip running along the ridge top so
  // the picket bases read as seated on a continuous casting. ──
  parts.push(
    f.mesh("Cresting Rail", box(0.05, 0.025, span + 0.16), iron, {
      position: [0, ridgeY - 0.06, (zStart + zEnd) / 2],
    }, { castShadow: false }),
    // Slim raised lip running along the rail's top edge.
    f.mesh("Cresting Rail Lip", box(0.06, 0.015, span + 0.16), ironShade, {
      position: [0, ridgeY - 0.04, (zStart + zEnd) / 2],
    }, { castShadow: false }),
  );
  // ── Each picket — a slim spire on a scroll base. ──
  for (let i = 0; i < pickets; i++) {
    const z = zStart - i * step;
    parts.push(
      // Scroll base — small fat bead at the rail-level.
      f.mesh(`Picket Base ${i}`, sphere(0.04, 10, 8), ironShade, {
        position: [0, ridgeY - 0.02, z],
      }, { castShadow: true }),
      // Picket shaft — slim tapered cylinder rising from the base.
      f.mesh(`Picket Shaft ${i}`, cylinder(0.012, 0.022, 0.36, 8), iron, {
        position: [0, ridgeY + 0.18, z],
      }, { castShadow: true, receiveShadow: true }),
      // Mid-shaft bead — slim raised band halfway up the picket.
      f.mesh(`Picket Bead ${i}`, sphere(0.026, 10, 8), iron, {
        position: [0, ridgeY + 0.2, z],
      }, { castShadow: false }),
      // Spear-tip cap — a slim cone at the top of the picket.
      f.mesh(`Picket Spear ${i}`, cone(0.022, 0.12, 8), iron, {
        position: [0, ridgeY + 0.42, z],
      }, { castShadow: true }),
      // Bright tip highlight ball.
      f.mesh(`Picket Tip ${i}`, sphere(0.012, 8, 6), ironHi, {
        position: [0, ridgeY + 0.52, z],
      }, { castShadow: false }),
    );
    // Two ornamental lobes pointing east and west at the base of each
    // picket so the silhouette reads as cast lacework rather than plain
    // pickets.
    parts.push(
      f.mesh(`Picket Lobe E ${i}`, sphere(0.022, 8, 6), iron, {
        position: [0.05, ridgeY + 0.04, z],
      }, { castShadow: false }),
      f.mesh(`Picket Lobe W ${i}`, sphere(0.022, 8, 6), iron, {
        position: [-0.05, ridgeY + 0.04, z],
      }, { castShadow: false }),
    );
  }
  // ── Scroll caps between adjacent pickets — small C-curl beads that
  // suggest the lacy filigree typical of Victorian ridge cresting. ──
  for (let i = 0; i < pickets - 1; i++) {
    const z = zStart - (i + 0.5) * step;
    parts.push(
      // Central scroll bead.
      f.mesh(`Scroll Bead ${i}`, sphere(0.022, 8, 6), iron, {
        position: [0, ridgeY + 0.06, z],
      }, { castShadow: false }),
      // Two small flanking lobes.
      f.mesh(`Scroll Lobe N ${i}`, sphere(0.014, 8, 6), iron, {
        position: [0, ridgeY + 0.04, z - step * 0.18],
      }, { castShadow: false }),
      f.mesh(`Scroll Lobe S ${i}`, sphere(0.014, 8, 6), iron, {
        position: [0, ridgeY + 0.04, z + step * 0.18],
      }, { castShadow: false }),
      // Slim raised C-curl strip — a thin angled box reading as the
      // bottom curl of the scroll.
      f.mesh(`Scroll Curl ${i}`, box(0.025, 0.018, 0.08), ironShade, {
        position: [0, ridgeY + 0.02, z],
      }, { castShadow: false }),
    );
  }
  return f.group("Iron Ridge Cresting", parts);
}

/* ─────────────── twentieth-pass scene extension ─────────────── */

/**
 * The southeast citrus grove — a sun-baked terracotta-toned ground plane
 * tucked into the gap between the southeast vineyard's south edge and
 * the south heath's east edge. Aprons along the north (vineyard) and
 * west (heath) joins overlap the neighbouring planes by ~1.5 units so
 * the ground layer has no holes at the seams. Inside the plane: a small
 * grove of six citrus trees (three lemon and three orange in alternating
 * rows) with bright yellow and orange fruit dabs in their crowns, a
 * small stone-walled juice press shed at the southeast corner, a focal
 * weathered wooden produce crate brimming with ripe citrus near the
 * north-west apron and a low dry-stone retaining wall running along the
 * south and east edges of the grove.
 */
function buildSoutheastCitrusGrove(f: NodeFactory): SceneNode {
  return f.group("Southeast Citrus Grove", [
    // Main citrus-grove ground plane — surfaced with the new colour +
    // depth map pair so the fallen-fruit dabs and pebbles read as raised
    // relief at glancing sun.
    f.mesh(
      "Citrus Grove Ground",
      plane(CITRUS_GROVE_W, CITRUS_GROVE_D),
      std(C.citrusGround, 0.95, {
        texture: "citrus-grove",
        textureScale: [4, 5],
        bumpMap: "citrus-grove-bump",
        bumpScale: 0.05,
      }),
      { position: CITRUS_GROVE_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // North apron — overlaps the vineyard's south edge with a tilled
    // cinnamon-earth strip so the seam reads as a continuous worked-soil
    // join between the vineyard rows and the citrus grove.
    f.mesh(
      "Citrus North Apron",
      plane(CITRUS_GROVE_W, 3),
      std(C.vineyardSoilApron, 0.95, { texture: "grass", textureScale: [8, 1] }),
      {
        position: [
          CITRUS_GROVE_POS[0],
          -0.017,
          CITRUS_GROVE_POS[2] - CITRUS_GROVE_D / 2 + 1.5,
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // West apron — overlaps the south heath's east edge with a heather-
    // toned strip so the seam reads as a continuous moor fringe along
    // the citrus grove's west side.
    f.mesh(
      "Citrus West Apron",
      plane(3, CITRUS_GROVE_D),
      std(C.heathMoss, 0.95, { texture: "grass", textureScale: [1, 8] }),
      {
        position: [
          CITRUS_GROVE_POS[0] - CITRUS_GROVE_W / 2 + 1.5,
          -0.017,
          CITRUS_GROVE_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildCitrusTrees(f),
    buildCitrusPressShed(f, CITRUS_PRESS_POS),
    buildCitrusCrate(f, CITRUS_CRATE_POS),
    buildCitrusGroveWall(f),
  ]);
}

/**
 * Six citrus trees laid out in two rows of three (a lemon row and an
 * orange row), each tree with a gnarled trunk, two layered foliage
 * crowns and a scatter of bright lemon or orange fruit dabs across the
 * crowns. Plants are nudged off-axis so the grove reads as hand-planted
 * rather than machine-perfect.
 */
function buildCitrusTrees(f: NodeFactory): SceneNode {
  const trunk = std(C.citrusTrunk, 0.95, { texture: "wood", textureScale: [1, 2], flatShading: true });
  const leaf = std(C.citrusLeaf, 0.9, { flatShading: true });
  const leafDark = std(C.citrusLeafDark, 0.95, { flatShading: true });
  const leafHi = std(C.citrusLeafHi, 0.85, { flatShading: true });
  const lemon = std(C.citrusLemon, 0.65, { flatShading: true });
  const lemonHi = std(C.citrusLemonHi, 0.55);
  const orange = std(C.citrusOrange, 0.7, { flatShading: true });
  const orangeHi = std(C.citrusOrangeHi, 0.6);
  const rng = mulberry32(0xc17a0a);
  const trees: SceneNode[] = [];
  const cx = CITRUS_GROVE_POS[0];
  const cz = CITRUS_GROVE_POS[2];
  // Two rows running east-west: lemons (r=0) closer to the north apron,
  // oranges (r=1) closer to the south wall.
  for (let r = 0; r < 2; r++) {
    const rowZ = cz - CITRUS_GROVE_D / 2 + 6.5 + r * 8.5;
    const isLemon = r === 0;
    for (let i = 0; i < 3; i++) {
      const px = cx - CITRUS_GROVE_W / 2 + 4.5 + i * 4.5 + (rng() - 0.5) * 0.8;
      const pz = rowZ + (rng() - 0.5) * 1.2;
      const trunkH = 1.0 + rng() * 0.2;
      const crownR = 0.85 + rng() * 0.15;
      const parts: SceneNode[] = [
        // Trunk — slim cylinder with a slight outward swell at the base.
        f.mesh("Trunk", cylinder(0.09, 0.13, trunkH, 8), trunk, {
          position: [0, trunkH / 2, 0],
        }, { castShadow: true, receiveShadow: true }),
        // Trunk knot — a small bulge at mid-height suggesting a graft
        // scar on the citrus stock.
        f.mesh("Trunk Knot", sphere(0.1, 8, 6), trunk, {
          position: [0, trunkH * 0.45, 0.04],
          scale: [0.9, 0.6, 0.7],
        }, { castShadow: false }),
        // Lower foliage crown — wide dark base layer.
        f.mesh("Crown Lower", sphere(crownR, 14, 10), leafDark, {
          position: [0, trunkH + crownR * 0.85, 0],
          scale: [1.1, 0.9, 1.1],
        }, { castShadow: true, receiveShadow: true }),
        // Upper foliage crown — smaller, brighter top layer.
        f.mesh("Crown Upper", sphere(crownR * 0.78, 14, 10), leaf, {
          position: [0, trunkH + crownR * 1.55, 0],
          scale: [1.0, 0.95, 1.0],
        }, { castShadow: true, receiveShadow: true }),
        // Highlight crown — small bright lime patch at the sunlit top.
        f.mesh("Crown Hi", sphere(crownR * 0.35, 10, 8), leafHi, {
          position: [crownR * 0.25, trunkH + crownR * 1.9, crownR * 0.2],
        }, { castShadow: false }),
      ];
      // ── Citrus fruit scatter across the crown ──
      const fruits = 12;
      for (let p = 0; p < fruits; p++) {
        const a = (p / fruits) * Math.PI * 2 + rng() * 0.5;
        const rr = crownR * (0.65 + rng() * 0.35);
        const fy = trunkH + crownR * (0.85 + rng() * 0.9);
        const fruitMat = isLemon ? (p % 3 === 0 ? lemonHi : lemon) : (p % 3 === 0 ? orangeHi : orange);
        parts.push(
          f.mesh(`Fruit ${p}`, sphere(0.07 + rng() * 0.02, 8, 6), fruitMat, {
            position: [Math.cos(a) * rr, fy, Math.sin(a) * rr],
            scale: isLemon ? [1.0, 0.9, 1.15] : [1.0, 1.0, 1.0],
          }, { castShadow: false }),
        );
      }
      // ── Three windfall fruits on the ground at the tree base ──
      for (let p = 0; p < 3; p++) {
        const a = (p / 3) * Math.PI * 2 + rng() * 0.6;
        const rr = crownR * 0.7 + rng() * 0.2;
        const fruitMat = isLemon ? lemon : orange;
        parts.push(
          f.mesh(`Windfall ${p}`, sphere(0.07, 8, 6), fruitMat, {
            position: [Math.cos(a) * rr, 0.07, Math.sin(a) * rr],
            scale: isLemon ? [1.0, 0.7, 1.15] : [1.0, 0.85, 1.0],
          }, { castShadow: false }),
        );
      }
      trees.push(
        f.group(`${isLemon ? "Lemon" : "Orange"} Tree ${i + 1}`, parts, {
          position: [px, 0, pz],
          rotation: [0, rng() * Math.PI * 2, 0],
        }),
      );
    }
  }
  return f.group("Citrus Trees", trees);
}

/**
 * A small stone-walled juice press shed at the southeast corner of the
 * grove — a low rectangular box with rough sandstone walls, a peaked
 * terracotta-tile roof, a dark plank door on the north face and a tiny
 * round window on the east face. Provides a focal silhouette at the
 * grove's far corner so the eye reads the plane as a working farm
 * rather than an empty plot.
 */
function buildCitrusPressShed(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.citrusPressStone, 0.95, { texture: "cobblestone", textureScale: [1.5, 1.5], flatShading: true });
  const stoneShade = std(C.citrusPressStoneDark, 0.95, { flatShading: true });
  const roof = std(C.citrusPressRoof, 0.85, { texture: "shingle", textureScale: [3, 1], flatShading: true });
  const door = std(C.citrusPressDoor, 0.95, { texture: "wood", textureScale: [1, 1.3] });
  const windowPane: MaterialDef = {
    color: "#a8c4d8",
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.65,
  };
  const wallW = 1.8;
  const wallH = 1.7;
  const wallD = 1.4;
  const parts: SceneNode[] = [
    // Sandstone footing slab.
    f.mesh("Shed Footing", box(wallW + 0.3, 0.1, wallD + 0.3), stoneShade, {
      position: [0, 0.05, 0],
    }, { receiveShadow: true }),
    // Main shed body — a low box.
    f.mesh("Shed Wall", box(wallW, wallH, wallD), stone, {
      position: [0, wallH / 2 + 0.1, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Quoin corners — small darker blocks at the four corners.
    f.mesh("Quoin NE", box(0.12, wallH * 0.95, 0.12), stoneShade, {
      position: [wallW / 2 - 0.06, wallH / 2 + 0.1, wallD / 2 - 0.06],
    }, { castShadow: false }),
    f.mesh("Quoin NW", box(0.12, wallH * 0.95, 0.12), stoneShade, {
      position: [-wallW / 2 + 0.06, wallH / 2 + 0.1, wallD / 2 - 0.06],
    }, { castShadow: false }),
    f.mesh("Quoin SE", box(0.12, wallH * 0.95, 0.12), stoneShade, {
      position: [wallW / 2 - 0.06, wallH / 2 + 0.1, -wallD / 2 + 0.06],
    }, { castShadow: false }),
    f.mesh("Quoin SW", box(0.12, wallH * 0.95, 0.12), stoneShade, {
      position: [-wallW / 2 + 0.06, wallH / 2 + 0.1, -wallD / 2 + 0.06],
    }, { castShadow: false }),
    // Peaked terracotta-tile roof — two angled panels meeting at a ridge.
    f.mesh("Roof L", box(wallW + 0.4, 0.07, wallD * 0.72), roof, {
      position: [0, wallH + 0.42, -wallD / 4],
      rotation: [0.45, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Roof R", box(wallW + 0.4, 0.07, wallD * 0.72), roof, {
      position: [0, wallH + 0.42, wallD / 4],
      rotation: [-0.45, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Roof ridge cap — slim cylinder along the peak.
    f.mesh("Roof Ridge", cylinder(0.08, 0.08, wallW + 0.4, 8), roof, {
      position: [0, wallH + 0.62, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
    // Front (north) plank door.
    f.mesh("Shed Door", box(0.46, 1.1, 0.04), door, {
      position: [0, 0.65, wallD / 2 + 0.02],
    }, { castShadow: true }),
    f.mesh("Door Frame", box(0.54, 1.18, 0.05), stoneShade, {
      position: [0, 0.69, wallD / 2 + 0.01],
    }, { castShadow: false }),
    // Door knob — small iron knob.
    f.mesh("Door Knob", sphere(0.025, 10, 8), std("#3a2218", 0.4, { metalness: 0.7 }), {
      position: [0.14, 0.65, wallD / 2 + 0.05],
    }, { castShadow: false }),
    // Tiny round window on the east face.
    f.mesh("Round Window", cylinder(0.18, 0.18, 0.04, 18), windowPane, {
      position: [wallW / 2 + 0.02, wallH * 0.65 + 0.1, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
    f.mesh("Window Frame", cylinder(0.21, 0.21, 0.03, 18), stoneShade, {
      position: [wallW / 2 + 0.015, wallH * 0.65 + 0.1, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
    // Window muntin cross.
    f.mesh("Muntin H", box(0.04, 0.04, 0.36), stoneShade, {
      position: [wallW / 2 + 0.025, wallH * 0.65 + 0.1, 0],
    }, { castShadow: false }),
    f.mesh("Muntin V", box(0.04, 0.36, 0.04), stoneShade, {
      position: [wallW / 2 + 0.025, wallH * 0.65 + 0.1, 0],
    }, { castShadow: false }),
  ];
  return f.group("Citrus Press Shed", parts, { position: pos, rotation: [0, -Math.PI / 6, 0] });
}

/**
 * A weathered wooden produce crate near the grove's north-west apron —
 * a slat-sided box brimming with ripe citrus fruits. Built as a low
 * open-top box with vertical slats, two iron banding rings and a dome
 * of citrus fruit dabs heaped above the rim. Reads as a freshly picked
 * harvest crate left at the grove entrance for the doll to pass.
 */
function buildCitrusCrate(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.citrusCrateWood, 0.95, { texture: "wood", textureScale: [1, 1.5] });
  const band = std(C.citrusCrateBand, 0.9, { flatShading: true });
  const lemon = std(C.citrusLemon, 0.65, { flatShading: true });
  const lemonHi = std(C.citrusLemonHi, 0.55);
  const orange = std(C.citrusOrange, 0.7, { flatShading: true });
  const orangeHi = std(C.citrusOrangeHi, 0.6);
  const cw = 0.7;
  const ch = 0.36;
  const cd = 0.5;
  const parts: SceneNode[] = [
    // Crate floor — a wide low base slab.
    f.mesh("Crate Floor", box(cw, 0.04, cd), wood, {
      position: [0, 0.02, 0],
    }, { receiveShadow: true }),
    // Crate corner posts — four short vertical legs at the corners.
    f.mesh("Post NE", box(0.05, ch, 0.05), wood, {
      position: [cw / 2 - 0.025, ch / 2 + 0.02, cd / 2 - 0.025],
    }, { castShadow: true }),
    f.mesh("Post NW", box(0.05, ch, 0.05), wood, {
      position: [-cw / 2 + 0.025, ch / 2 + 0.02, cd / 2 - 0.025],
    }, { castShadow: true }),
    f.mesh("Post SE", box(0.05, ch, 0.05), wood, {
      position: [cw / 2 - 0.025, ch / 2 + 0.02, -cd / 2 + 0.025],
    }, { castShadow: true }),
    f.mesh("Post SW", box(0.05, ch, 0.05), wood, {
      position: [-cw / 2 + 0.025, ch / 2 + 0.02, -cd / 2 + 0.025],
    }, { castShadow: true }),
  ];
  // Front + back walls — three vertical slats per side.
  const slatsPerSide = 5;
  for (let i = 0; i < slatsPerSide; i++) {
    const x = -cw / 2 + (cw / (slatsPerSide - 1)) * i;
    parts.push(
      f.mesh(`Slat F ${i}`, box(0.04, ch, 0.03), wood, {
        position: [x, ch / 2 + 0.02, cd / 2 - 0.015],
      }, { castShadow: false }),
      f.mesh(`Slat B ${i}`, box(0.04, ch, 0.03), wood, {
        position: [x, ch / 2 + 0.02, -cd / 2 + 0.015],
      }, { castShadow: false }),
    );
  }
  // Side walls — three vertical slats per side.
  for (let i = 0; i < 3; i++) {
    const z = -cd / 2 + (cd / 2) * i;
    parts.push(
      f.mesh(`Slat L ${i}`, box(0.03, ch, 0.04), wood, {
        position: [-cw / 2 + 0.015, ch / 2 + 0.02, z],
      }, { castShadow: false }),
      f.mesh(`Slat R ${i}`, box(0.03, ch, 0.04), wood, {
        position: [cw / 2 - 0.015, ch / 2 + 0.02, z],
      }, { castShadow: false }),
    );
  }
  // Two iron banding rings around the crate.
  parts.push(
    f.mesh("Band Lower", box(cw + 0.02, 0.025, cd + 0.02), band, {
      position: [0, 0.12, 0],
    }, { castShadow: false }),
    f.mesh("Band Upper", box(cw + 0.02, 0.025, cd + 0.02), band, {
      position: [0, ch - 0.04, 0],
    }, { castShadow: false }),
  );
  // ── Dome of citrus fruits heaped above the crate rim ──
  const rng = mulberry32(0xc4a7e);
  const fruits = 18;
  for (let i = 0; i < fruits; i++) {
    const a = (i / fruits) * Math.PI * 2;
    const ring = i < 12 ? 0 : 1;
    const radius = ring === 0 ? 0.22 : 0.12;
    const fy = ch + 0.05 + (ring === 0 ? 0.02 : 0.1);
    const isLemon = (i % 2) === 0;
    const isBright = (i % 5) === 0;
    const fruitMat = isLemon ? (isBright ? lemonHi : lemon) : (isBright ? orangeHi : orange);
    parts.push(
      f.mesh(`Crate Fruit ${i}`, sphere(0.07 + rng() * 0.015, 8, 6), fruitMat, {
        position: [Math.cos(a) * radius, fy, Math.sin(a) * radius],
        scale: isLemon ? [1.0, 0.9, 1.15] : [1.0, 1.0, 1.0],
      }, { castShadow: false }),
    );
  }
  // Two crowning fruits at the very top of the heap.
  parts.push(
    f.mesh("Crate Fruit Top L", sphere(0.075, 8, 6), lemonHi, {
      position: [0.04, ch + 0.22, 0.0],
      scale: [1.0, 0.9, 1.15],
    }, { castShadow: false }),
    f.mesh("Crate Fruit Top O", sphere(0.075, 8, 6), orangeHi, {
      position: [-0.05, ch + 0.22, 0.03],
    }, { castShadow: false }),
  );
  return f.group("Citrus Crate", parts, { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/**
 * A low dry-stone retaining wall running along the south and east edges
 * of the citrus grove — a row of stacked irregular stone caps suggesting
 * a hand-laid Mediterranean stone wall framing the orchard. Each cap is
 * a slim flatter box rotated slightly off-axis so the wall reads as
 * hand-stacked rather than machine-cut.
 */
function buildCitrusGroveWall(f: NodeFactory): SceneNode {
  const stone = std(C.citrusGroveWall, 0.95, { texture: "cobblestone", textureScale: [1, 1], flatShading: true });
  const stoneShade = std(C.citrusGroveWallShade, 0.95, { flatShading: true });
  const rng = mulberry32(0xc417a577);
  const parts: SceneNode[] = [];
  const cx = CITRUS_GROVE_POS[0];
  const cz = CITRUS_GROVE_POS[2];
  const wMin = cx - CITRUS_GROVE_W / 2 + 1.0;
  const wMax = cx + CITRUS_GROVE_W / 2 - 0.6;
  const dMin = cz - CITRUS_GROVE_D / 2 + 1.5;
  const dMax = cz + CITRUS_GROVE_D / 2 - 0.6;
  // ── South wall — runs east-west along the south edge ──
  const southSegs = 14;
  const southStep = (wMax - wMin) / southSegs;
  for (let i = 0; i < southSegs; i++) {
    const x = wMin + (i + 0.5) * southStep;
    const w = southStep * (0.85 + rng() * 0.2);
    const h = 0.28 + rng() * 0.08;
    const d = 0.32 + rng() * 0.08;
    const yaw = (rng() - 0.5) * 0.18;
    parts.push(
      f.mesh(`South Cap ${i}`, box(w, h, d), i % 3 === 0 ? stoneShade : stone, {
        position: [x, h / 2, dMax],
        rotation: [0, yaw, (rng() - 0.5) * 0.04],
      }, { castShadow: true, receiveShadow: true }),
    );
    // Optional smaller cap stone on top for visual variety.
    if (rng() > 0.55) {
      parts.push(
        f.mesh(`South Topper ${i}`, box(w * 0.6, 0.12, d * 0.7), stoneShade, {
          position: [x + (rng() - 0.5) * 0.05, h + 0.06, dMax + (rng() - 0.5) * 0.05],
          rotation: [0, yaw * 1.3, 0],
        }, { castShadow: true }),
      );
    }
  }
  // ── East wall — runs north-south along the east edge ──
  const eastSegs = 18;
  const eastStep = (dMax - dMin) / eastSegs;
  for (let i = 0; i < eastSegs; i++) {
    const z = dMin + (i + 0.5) * eastStep;
    const d = eastStep * (0.85 + rng() * 0.2);
    const h = 0.28 + rng() * 0.08;
    const w = 0.32 + rng() * 0.08;
    const yaw = (rng() - 0.5) * 0.18;
    parts.push(
      f.mesh(`East Cap ${i}`, box(w, h, d), i % 3 === 0 ? stoneShade : stone, {
        position: [wMax, h / 2, z],
        rotation: [0, yaw, (rng() - 0.5) * 0.04],
      }, { castShadow: true, receiveShadow: true }),
    );
    if (rng() > 0.55) {
      parts.push(
        f.mesh(`East Topper ${i}`, box(w * 0.7, 0.12, d * 0.6), stoneShade, {
          position: [wMax + (rng() - 0.5) * 0.05, h + 0.06, z + (rng() - 0.5) * 0.05],
          rotation: [0, yaw * 1.3, 0],
        }, { castShadow: true }),
      );
    }
  }
  // ── Doll-width gap in the south wall near the south-west corner so a
  // doll can step from the heath join into the grove. Mark the gap with
  // two flanking taller marker stones. ──
  const gapX = wMin + 0.5;
  parts.push(
    f.mesh("Gap Marker L", box(0.28, 0.45, 0.32), stoneShade, {
      position: [gapX - 0.6, 0.22, dMax],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Gap Marker R", box(0.28, 0.45, 0.32), stoneShade, {
      position: [gapX + 0.6, 0.22, dMax],
    }, { castShadow: true, receiveShadow: true }),
  );
  return f.group("Citrus Grove Wall", parts);
}

/* ─────────────── twenty-first-pass courtyard prop ─────────────── */

/**
 * A whimsical Victorian carousel horse ornament on a fluted marble pedestal.
 * The piece pairs a swelled marble plinth (carrying the existing `marble`
 * colour + bump pair so the stone reads with veined relief), a vertical
 * copper-patina pole running through the horse's back (reusing the existing
 * `copper-patina` colour + bump pair so the verdigris reads as crusted relief
 * on the brass) and a stylised prancing horse with a flowing rose mane and
 * tail, a gilt-trimmed rose saddle and an upright leg pose suggesting motion.
 * Parked in the back-west outside-fence lawn between the glider and the back
 * meadow — a small focal piece punctuating the lawn corner.
 */
function buildCarouselHorse(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const pole: MaterialDef = {
    color: C.carouselPole,
    roughness: 0.55,
    metalness: 0.7,
    texture: "copper-patina",
    textureScale: [1, 3],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.02,
  };
  const poleHi = std(C.carouselPoleHi, 0.4, { metalness: 0.85 });
  const marble = std(C.carouselPlinth, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.03,
  });
  const marbleShade = std(C.carouselPlinthShade, 0.95, { flatShading: true });
  const body = std(C.carouselBody, 0.7, { flatShading: true });
  const bodyShade = std(C.carouselBodyShade, 0.85, { flatShading: true });
  const mane = std(C.carouselMane, 0.65, { flatShading: true });
  const maneDark = std(C.carouselManeDark, 0.75, { flatShading: true });
  const saddle = std(C.carouselSaddle, 0.6, { flatShading: true });
  const saddleTrim = std(C.carouselSaddleTrim, 0.45, { metalness: 0.6 });
  const hoof = std(C.carouselHoof, 0.7, { flatShading: true });
  const eye = std(C.carouselEye, 0.7);
  const parts: SceneNode[] = [];
  // ── Fluted marble plinth ──
  parts.push(
    f.mesh("Carousel Footing", box(1.1, 0.08, 1.1), marbleShade, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    f.mesh("Plinth Base", cylinder(0.46, 0.5, 0.12, 18), marble, {
      position: [0, 0.14, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Plinth Column", cylinder(0.34, 0.38, 0.62, 18), marble, {
      position: [0, 0.51, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Plinth Cap", cylinder(0.46, 0.46, 0.06, 18), marble, {
      position: [0, 0.85, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Copper-patina trim band at the cap.
    f.mesh("Plinth Cap Trim", cylinder(0.44, 0.44, 0.025, 20), pole, {
      position: [0, 0.89, 0],
    }, { castShadow: false }),
  );
  // Eight slim fluting grooves around the plinth column.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(
      f.mesh(`Plinth Flute ${i}`, box(0.025, 0.56, 0.03), marbleShade, {
        position: [Math.cos(a) * 0.36, 0.51, Math.sin(a) * 0.36],
        rotation: [0, a, 0],
      }, { castShadow: false }),
    );
  }
  // ── Vertical copper-patina carousel pole rising through the horse ──
  const poleY = 0.9;
  const poleH = 1.8;
  parts.push(
    f.mesh("Carousel Pole", cylinder(0.03, 0.03, poleH, 12), pole, {
      position: [0, poleY + poleH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Slim spiral twist beads running up the pole — small fat rings at
    // four heights suggesting a barley-twist column.
    f.mesh("Pole Bead 0", sphere(0.05, 12, 8), poleHi, {
      position: [0, poleY + 0.2, 0],
    }, { castShadow: false }),
    f.mesh("Pole Bead 1", sphere(0.05, 12, 8), poleHi, {
      position: [0, poleY + 0.7, 0],
    }, { castShadow: false }),
    f.mesh("Pole Bead 2", sphere(0.05, 12, 8), poleHi, {
      position: [0, poleY + 1.2, 0],
    }, { castShadow: false }),
    f.mesh("Pole Cap", cone(0.06, 0.18, 10), pole, {
      position: [0, poleY + poleH + 0.05, 0],
    }, { castShadow: true }),
    f.mesh("Pole Tip Ball", sphere(0.04, 10, 8), poleHi, {
      position: [0, poleY + poleH + 0.18, 0],
    }, { castShadow: false }),
  );
  // ── Horse body ── (centred at y ≈ poleY + 0.95)
  const horseY = poleY + 0.95;
  parts.push(
    // Main barrel — a swelled cylinder running along the X axis.
    f.mesh("Horse Body", cylinder(0.22, 0.22, 0.85, 14), body, {
      position: [0, horseY, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true, receiveShadow: true }),
    // Body underside shading — slim flattened sphere below the barrel.
    f.mesh("Body Shade", sphere(0.2, 12, 8), bodyShade, {
      position: [0, horseY - 0.1, 0],
      scale: [2.0, 0.5, 1.0],
    }, { castShadow: false }),
    // Hindquarters — a fat sphere at the back end of the barrel.
    f.mesh("Hindquarter", sphere(0.27, 14, 10), body, {
      position: [-0.36, horseY + 0.05, 0],
      scale: [1.0, 1.05, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    // Chest — a fat sphere at the front end of the barrel.
    f.mesh("Chest", sphere(0.25, 14, 10), body, {
      position: [0.4, horseY + 0.05, 0],
      scale: [1.0, 1.1, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    // Neck — a tilted cylinder rising up and forward from the chest.
    f.mesh("Neck", cylinder(0.13, 0.16, 0.42, 12), body, {
      position: [0.55, horseY + 0.32, 0],
      rotation: [0, 0, -Math.PI / 5],
    }, { castShadow: true, receiveShadow: true }),
    // Head — an elongated sphere capping the neck.
    f.mesh("Head", sphere(0.16, 14, 10), body, {
      position: [0.72, horseY + 0.5, 0],
      scale: [1.5, 1.0, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    // Muzzle — a smaller darker sphere at the front of the head.
    f.mesh("Muzzle", sphere(0.09, 12, 8), bodyShade, {
      position: [0.86, horseY + 0.46, 0],
      scale: [1.3, 0.9, 1.0],
    }, { castShadow: false }),
    // Two ears — slim cones angled upward and outward.
    f.mesh("Ear L", cone(0.04, 0.1, 6), body, {
      position: [0.68, horseY + 0.65, 0.07],
      rotation: [0.3, 0, -0.1],
    }, { castShadow: false }),
    f.mesh("Ear R", cone(0.04, 0.1, 6), body, {
      position: [0.68, horseY + 0.65, -0.07],
      rotation: [-0.3, 0, -0.1],
    }, { castShadow: false }),
    // Eye — small dark dot on the head side.
    f.mesh("Eye L", sphere(0.018, 8, 6), eye, {
      position: [0.78, horseY + 0.53, 0.13],
    }, { castShadow: false }),
    f.mesh("Eye R", sphere(0.018, 8, 6), eye, {
      position: [0.78, horseY + 0.53, -0.13],
    }, { castShadow: false }),
    // Nostril dots.
    f.mesh("Nostril L", sphere(0.012, 6, 6), eye, {
      position: [0.9, horseY + 0.44, 0.04],
    }, { castShadow: false }),
    f.mesh("Nostril R", sphere(0.012, 6, 6), eye, {
      position: [0.9, horseY + 0.44, -0.04],
    }, { castShadow: false }),
  );
  // ── Mane — a row of flowing pink dabs along the neck ──
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = 0.45 + t * 0.3;
    const y = horseY + 0.12 + t * 0.5;
    const m = i % 2 === 0 ? mane : maneDark;
    parts.push(
      f.mesh(`Mane ${i}`, sphere(0.08 - t * 0.02, 10, 8), m, {
        position: [x, y, 0],
        scale: [1.0, 1.3, 0.45],
      }, { castShadow: false }),
    );
  }
  // Forelock — a tuft of mane hanging over the forehead.
  parts.push(
    f.mesh("Forelock", sphere(0.07, 10, 8), mane, {
      position: [0.72, horseY + 0.62, 0],
      scale: [1.0, 0.9, 0.7],
    }, { castShadow: false }),
  );
  // ── Tail — a flowing rope of pink dabs trailing from the hindquarters ──
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = -0.55 - t * 0.18;
    const y = horseY + 0.08 - t * 0.35;
    const m = i % 2 === 0 ? mane : maneDark;
    parts.push(
      f.mesh(`Tail ${i}`, sphere(0.08 - t * 0.02, 10, 8), m, {
        position: [x, y, 0],
        scale: [1.0, 1.2, 0.5],
      }, { castShadow: false }),
    );
  }
  // ── Four legs — front pair forward (prancing pose), back pair planted ──
  // Front-right (raised, bent at knee).
  parts.push(
    f.mesh("Leg FR Upper", cylinder(0.05, 0.06, 0.32, 8), body, {
      position: [0.32, horseY - 0.22, -0.12],
      rotation: [0, 0, 0.5],
    }, { castShadow: true }),
    f.mesh("Leg FR Lower", cylinder(0.04, 0.05, 0.28, 8), body, {
      position: [0.48, horseY - 0.36, -0.12],
      rotation: [0, 0, 0.1],
    }, { castShadow: true }),
    f.mesh("Hoof FR", cylinder(0.06, 0.05, 0.06, 10), hoof, {
      position: [0.5, horseY - 0.52, -0.12],
    }, { castShadow: true }),
    // Front-left (raised, slightly bent).
    f.mesh("Leg FL Upper", cylinder(0.05, 0.06, 0.3, 8), body, {
      position: [0.32, horseY - 0.22, 0.12],
      rotation: [0, 0, 0.35],
    }, { castShadow: true }),
    f.mesh("Leg FL Lower", cylinder(0.04, 0.05, 0.3, 8), body, {
      position: [0.44, horseY - 0.4, 0.12],
      rotation: [0, 0, -0.05],
    }, { castShadow: true }),
    f.mesh("Hoof FL", cylinder(0.06, 0.05, 0.06, 10), hoof, {
      position: [0.46, horseY - 0.58, 0.12],
    }, { castShadow: true }),
    // Back-right (planted on hindquarter).
    f.mesh("Leg BR Upper", cylinder(0.06, 0.07, 0.42, 8), body, {
      position: [-0.38, horseY - 0.27, -0.12],
    }, { castShadow: true }),
    f.mesh("Leg BR Lower", cylinder(0.045, 0.055, 0.34, 8), body, {
      position: [-0.36, horseY - 0.62, -0.12],
    }, { castShadow: true }),
    f.mesh("Hoof BR", cylinder(0.065, 0.055, 0.06, 10), hoof, {
      position: [-0.36, horseY - 0.81, -0.12],
    }, { castShadow: true }),
    // Back-left.
    f.mesh("Leg BL Upper", cylinder(0.06, 0.07, 0.42, 8), body, {
      position: [-0.38, horseY - 0.27, 0.12],
    }, { castShadow: true }),
    f.mesh("Leg BL Lower", cylinder(0.045, 0.055, 0.34, 8), body, {
      position: [-0.36, horseY - 0.62, 0.12],
    }, { castShadow: true }),
    f.mesh("Hoof BL", cylinder(0.065, 0.055, 0.06, 10), hoof, {
      position: [-0.36, horseY - 0.81, 0.12],
    }, { castShadow: true }),
  );
  // ── Saddle — a fat block on the horse's back with gold trim ──
  parts.push(
    f.mesh("Saddle Cushion", sphere(0.18, 14, 10), saddle, {
      position: [-0.05, horseY + 0.2, 0],
      scale: [1.4, 0.6, 1.1],
    }, { castShadow: true, receiveShadow: true }),
    // Saddle pommel (front cantle).
    f.mesh("Saddle Pommel", sphere(0.06, 10, 8), saddleTrim, {
      position: [0.1, horseY + 0.28, 0],
    }, { castShadow: false }),
    // Saddle cantle (back rise).
    f.mesh("Saddle Cantle", sphere(0.06, 10, 8), saddleTrim, {
      position: [-0.2, horseY + 0.28, 0],
    }, { castShadow: false }),
    // Saddle blanket — a slightly wider blanket under the saddle.
    f.mesh("Saddle Blanket", box(0.55, 0.04, 0.42), saddle, {
      position: [-0.05, horseY + 0.16, 0],
    }, { castShadow: false }),
    // Slim gold trim edges along the blanket.
    f.mesh("Blanket Trim N", box(0.55, 0.025, 0.04), saddleTrim, {
      position: [-0.05, horseY + 0.165, 0.21],
    }, { castShadow: false }),
    f.mesh("Blanket Trim S", box(0.55, 0.025, 0.04), saddleTrim, {
      position: [-0.05, horseY + 0.165, -0.21],
    }, { castShadow: false }),
    // Two saddle tassels hanging from the sides.
    f.mesh("Tassel L", cone(0.025, 0.09, 6), saddleTrim, {
      position: [-0.05, horseY + 0.08, 0.24],
      rotation: [0, 0, Math.PI],
    }, { castShadow: false }),
    f.mesh("Tassel R", cone(0.025, 0.09, 6), saddleTrim, {
      position: [-0.05, horseY + 0.08, -0.24],
      rotation: [0, 0, Math.PI],
    }, { castShadow: false }),
  );
  // ── Bridle — slim straps around the muzzle with brass studs ──
  parts.push(
    f.mesh("Bridle Strap", cylinder(0.02, 0.02, 0.22, 6), saddleTrim, {
      position: [0.78, horseY + 0.48, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
    f.mesh("Bridle Stud L", sphere(0.025, 8, 6), poleHi, {
      position: [0.78, horseY + 0.48, 0.13],
    }, { castShadow: false }),
    f.mesh("Bridle Stud R", sphere(0.025, 8, 6), poleHi, {
      position: [0.78, horseY + 0.48, -0.13],
    }, { castShadow: false }),
    // Reins draping back from the bridle to the saddle pommel.
    f.mesh("Rein L", cylinder(0.012, 0.012, 0.5, 6), saddleTrim, {
      position: [0.4, horseY + 0.38, 0.13],
      rotation: [0, 0, Math.PI / 6],
    }, { castShadow: false }),
    f.mesh("Rein R", cylinder(0.012, 0.012, 0.5, 6), saddleTrim, {
      position: [0.4, horseY + 0.38, -0.13],
      rotation: [0, 0, Math.PI / 6],
    }, { castShadow: false }),
  );
  return f.group("Carousel Horse", parts, { position: pos, rotation: [0, Math.PI / 7, 0] });
}

/* ─────────────── twenty-first-pass house detail ─────────────── */

/**
 * A pair of decorative bay windows projecting from the east and west side
 * walls of the lower storey. Each bay is a small three-sided box bump (front
 * + two angled sides) with a slim peaked shingle hood, a white painted trim
 * sash framing tinted glass panes, a slim white sill below the panes and a
 * tiny terracotta flower box on the sill carrying a row of pink bloom dabs.
 * The bay windows add 3D dimensionality to the side façades without altering
 * the underlying side-wall construction.
 */
function buildSideBayWindows(f: NodeFactory): SceneNode {
  return f.group("Side Bay Windows", [
    buildSideBayWindow(f, BAY_WINDOW_E_POS, 1),
    buildSideBayWindow(f, BAY_WINDOW_W_POS, -1),
  ]);
}

function buildSideBayWindow(
  f: NodeFactory,
  pos: [number, number, number],
  side: 1 | -1,
): SceneNode {
  // `side` is +1 for east (bumps in +X), -1 for west (bumps in -X).
  const frame = std(C.bayWindowFrame, 0.85, { flatShading: true });
  const trim = std(C.bayWindowTrim, 0.85, { flatShading: true });
  const sill = std(C.bayWindowSill, 0.85, { flatShading: true });
  const glass: MaterialDef = {
    color: C.bayWindowGlass,
    roughness: 0.2,
    metalness: 0.4,
    transparent: true,
    opacity: 0.6,
    emissive: "#fff2c8",
  };
  const roof = std(C.bayWindowRoof, 0.85, {
    texture: "shingle",
    textureScale: [2, 1],
    flatShading: true,
  });
  const flowerBox = std(C.bayWindowFlowerBox, 0.95, { texture: "wood", textureScale: [1, 0.5] });
  const bloom = std(C.bayWindowBloom, 0.6, { flatShading: true });
  const proj = 0.32; // bump depth out from the side wall
  const winY = 1.0;  // window centre height
  const winW = 1.1;  // front-pane width
  const winH = 1.0;  // window height
  const parts: SceneNode[] = [];
  // ── Front pane (the wider face parallel to the side wall) ──
  parts.push(
    // Front trim frame.
    f.mesh("Front Frame", box(winW, winH + 0.08, 0.04), frame, {
      position: [side * proj, winY, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Front glass pane — set into the frame, slightly emissive so the
    // bay reads as lit from the interior at dusk.
    f.mesh("Front Glass", box(winW - 0.18, winH - 0.12, 0.02), glass, {
      position: [side * (proj + 0.01), winY, 0],
    }, { castShadow: false }),
    // Slim cross muntin dividing the front pane.
    f.mesh("Front Mullion V", box(0.04, winH - 0.12, 0.03), trim, {
      position: [side * (proj + 0.02), winY, 0],
    }, { castShadow: false }),
    f.mesh("Front Mullion H", box(winW - 0.18, 0.04, 0.03), trim, {
      position: [side * (proj + 0.02), winY, 0],
    }, { castShadow: false }),
  );
  // ── Two angled side panes (45° wings of the bay) ──
  // Wing dimensions.
  const wingW = 0.5;
  const wingY = winY;
  // North wing (toward +Z).
  parts.push(
    f.mesh("Wing N Frame", box(wingW, winH + 0.08, 0.04), frame, {
      position: [side * (proj * 0.5), wingY, winW / 2 + wingW / 2 * 0.5 - 0.02],
      rotation: [0, side * -Math.PI / 4, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wing N Glass", box(wingW - 0.16, winH - 0.12, 0.02), glass, {
      position: [side * (proj * 0.5 + 0.005), wingY, winW / 2 + wingW / 2 * 0.5 - 0.01],
      rotation: [0, side * -Math.PI / 4, 0],
    }, { castShadow: false }),
    f.mesh("Wing N Mullion", box(0.04, winH - 0.12, 0.03), trim, {
      position: [side * (proj * 0.5 + 0.012), wingY, winW / 2 + wingW / 2 * 0.5 - 0.005],
      rotation: [0, side * -Math.PI / 4, 0],
    }, { castShadow: false }),
  );
  // South wing (toward -Z).
  parts.push(
    f.mesh("Wing S Frame", box(wingW, winH + 0.08, 0.04), frame, {
      position: [side * (proj * 0.5), wingY, -(winW / 2 + wingW / 2 * 0.5 - 0.02)],
      rotation: [0, side * Math.PI / 4, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Wing S Glass", box(wingW - 0.16, winH - 0.12, 0.02), glass, {
      position: [side * (proj * 0.5 + 0.005), wingY, -(winW / 2 + wingW / 2 * 0.5 - 0.01)],
      rotation: [0, side * Math.PI / 4, 0],
    }, { castShadow: false }),
    f.mesh("Wing S Mullion", box(0.04, winH - 0.12, 0.03), trim, {
      position: [side * (proj * 0.5 + 0.012), wingY, -(winW / 2 + wingW / 2 * 0.5 - 0.005)],
      rotation: [0, side * Math.PI / 4, 0],
    }, { castShadow: false }),
  );
  // ── Slim white sill running below the panes, with rounded corners ──
  parts.push(
    f.mesh("Sill Front", box(winW + 0.12, 0.06, 0.08), sill, {
      position: [side * (proj + 0.02), winY - winH / 2 - 0.04, 0],
    }, { castShadow: false, receiveShadow: true }),
    f.mesh("Sill Wing N", box(wingW + 0.1, 0.06, 0.08), sill, {
      position: [side * (proj * 0.5), winY - winH / 2 - 0.04, winW / 2 + wingW / 2 * 0.5 - 0.02],
      rotation: [0, side * -Math.PI / 4, 0],
    }, { castShadow: false, receiveShadow: true }),
    f.mesh("Sill Wing S", box(wingW + 0.1, 0.06, 0.08), sill, {
      position: [side * (proj * 0.5), winY - winH / 2 - 0.04, -(winW / 2 + wingW / 2 * 0.5 - 0.02)],
      rotation: [0, side * Math.PI / 4, 0],
    }, { castShadow: false, receiveShadow: true }),
  );
  // ── Terracotta flower box clipped to the front sill ──
  parts.push(
    f.mesh("Flower Box", box(winW - 0.2, 0.12, 0.18), flowerBox, {
      position: [side * (proj + 0.07), winY - winH / 2 - 0.13, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Flower Soil", box(winW - 0.26, 0.04, 0.14), std(C.soil, 0.95), {
      position: [side * (proj + 0.07), winY - winH / 2 - 0.07, 0],
    }, { castShadow: false }),
  );
  // Three pink bloom dabs across the flower box.
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const z = (t - 0.5) * (winW - 0.28);
    parts.push(
      f.mesh(`Bloom ${i}`, sphere(0.06, 10, 8), bloom, {
        position: [side * (proj + 0.07), winY - winH / 2 - 0.02, z],
        scale: [0.8, 0.7, 0.8],
      }, { castShadow: false }),
    );
  }
  // ── Slim peaked shingle hood capping the bay ──
  parts.push(
    // Front pitch — angled box covering the front pane.
    f.mesh("Hood Front", box(winW + 0.2, 0.06, 0.42), roof, {
      position: [side * (proj + 0.12), winY + winH / 2 + 0.18, 0],
      rotation: [0, 0, side * -0.5],
    }, { castShadow: true, receiveShadow: true }),
    // Ridge — slim cylinder along the peak.
    f.mesh("Hood Ridge", cylinder(0.04, 0.04, winW + 0.22, 8), roof, {
      position: [side * 0.02, winY + winH / 2 + 0.36, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
  );
  // North + south hood end caps — slim angled triangle gable boards.
  parts.push(
    f.mesh("Hood Cap N", box(0.42, 0.06, 0.2), trim, {
      position: [side * proj * 0.6, winY + winH / 2 + 0.25, winW / 2 + 0.05],
      rotation: [0, side * -Math.PI / 4, side * 0.3],
    }, { castShadow: false }),
    f.mesh("Hood Cap S", box(0.42, 0.06, 0.2), trim, {
      position: [side * proj * 0.6, winY + winH / 2 + 0.25, -(winW / 2 + 0.05)],
      rotation: [0, side * Math.PI / 4, side * 0.3],
    }, { castShadow: false }),
  );
  return f.group("Bay Window", parts, { position: pos });
}

/* ─────────────── twenty-first-pass scene extension ─────────────── */

/**
 * Far-east desert oasis ground plane and props — tucked beyond the southeast
 * olive grove's east edge with a sun-baked Mediterranean desert character.
 * Carries the new `desert-sand` colour map paired with a dune-and-pebble
 * depth map so the dune crests and scattered pebbles read as raised relief at
 * glancing sun, a west olive-grove apron along the join so the ground layer
 * has no holes, three date palm trees, a small mud-brick caravanserai (adobe
 * inn) at the southeast corner, a focal sandstone obelisk pillar with a
 * hieroglyphic band and a resting camel statue with a red saddle blanket.
 */
function buildFarEastDesertOasis(f: NodeFactory): SceneNode {
  return f.group("Far East Desert Oasis", [
    // Desert ground plane — sand surfaced with the new colour + depth map
    // pair so the dune crests and pebbles read as raised relief.
    f.mesh(
      "Desert Ground",
      plane(DESERT_OASIS_W, DESERT_OASIS_D),
      std(C.desertSand, 0.95, {
        texture: "desert-sand",
        textureScale: [4, 6],
        bumpMap: "desert-sand-bump",
        bumpScale: 0.06,
      }),
      { position: DESERT_OASIS_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // West apron — overlaps the olive grove's east edge with a sun-bleached
    // olive-tone strip so the seam reads as a continuous Mediterranean join.
    f.mesh(
      "Desert West Apron",
      plane(3, DESERT_OASIS_D),
      std(C.oliveGroveApron, 0.95, { texture: "grass", textureScale: [1, 10] }),
      {
        position: [
          DESERT_OASIS_POS[0] - DESERT_OASIS_W / 2 + 1.5,
          -0.019,
          DESERT_OASIS_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildDuneMounds(f),
    buildDatePalms(f),
    buildCaravanserai(f, CARAVANSERAI_POS),
    buildDesertObelisk(f, DESERT_OBELISK_POS),
    buildCamelStatue(f, CAMEL_STATUE_POS),
  ]);
}

/**
 * Three low rolling dune mounds scattered across the desert sand — slim
 * sphere-derived hummocks suggesting wind-driven sand piles. The mounds are
 * placed off-axis so the grove reads as a hand-scattered landscape rather
 * than machine-perfect.
 */
function buildDuneMounds(f: NodeFactory): SceneNode {
  const sand = std(C.desertSandShade, 0.95, { flatShading: true });
  const sandHi = std(C.desertSandHi, 0.95, { flatShading: true });
  const rng = mulberry32(0xdc7e57);
  const cx = DESERT_OASIS_POS[0];
  const cz = DESERT_OASIS_POS[2];
  const mounds: SceneNode[] = [];
  const layouts: { x: number; z: number; s: number }[] = [
    { x: cx - 4, z: cz - 6, s: 1.0 },
    { x: cx + 4.5, z: cz - 3, s: 1.4 },
    { x: cx - 3, z: cz + 6, s: 1.2 },
    { x: cx + 2.5, z: cz + 9, s: 1.0 },
  ];
  for (let i = 0; i < layouts.length; i++) {
    const l = layouts[i]!;
    const px = l.x + (rng() - 0.5) * 0.5;
    const pz = l.z + (rng() - 0.5) * 0.5;
    mounds.push(
      f.group(`Dune ${i + 1}`, [
        // Main mound — wide low sphere with sandy color.
        f.mesh("Mound Body", sphere(0.9 * l.s, 16, 10), sand, {
          position: [0, 0.15 * l.s, 0],
          scale: [1.6, 0.35, 1.1],
        }, { castShadow: true, receiveShadow: true }),
        // Highlight crest — slim sphere along the sun-side of the mound.
        f.mesh("Mound Crest", sphere(0.6 * l.s, 14, 10), sandHi, {
          position: [0.15 * l.s, 0.25 * l.s, 0.05 * l.s],
          scale: [1.4, 0.18, 0.9],
        }, { castShadow: false }),
      ], { position: [px, 0, pz], rotation: [0, rng() * Math.PI, 0] }),
    );
  }
  return f.group("Dune Mounds", mounds);
}

/**
 * Three date palm trees scattered across the desert plane — each tree is a
 * slim columnar trunk with a wide frond crown and a pendant cluster of dark
 * date fruit hanging below the fronds. The trees route around the obelisk,
 * the caravanserai and the camel so the silhouettes read at a glance.
 */
function buildDatePalms(f: NodeFactory): SceneNode {
  const trunk = std(C.palmTrunk, 0.95, { texture: "bark", textureScale: [1, 3], flatShading: true });
  const trunkShade = std(C.palmTrunkShade, 0.95, { flatShading: true });
  const frond = std(C.palmFrond, 0.85, { flatShading: true });
  const frondShade = std(C.palmFrondShade, 0.9, { flatShading: true });
  const frondHi = std(C.palmFrondHi, 0.8, { flatShading: true });
  const dates = std(C.dateClusters, 0.65, { flatShading: true });
  const datesHi = std(C.dateClustersHi, 0.6, { flatShading: true });
  const rng = mulberry32(0xda7e9a17);
  const palms: SceneNode[] = [];
  const layouts: { x: number; z: number; s: number }[] = [
    { x: DESERT_OASIS_POS[0] - 4, z: DESERT_OASIS_POS[2] + 3, s: 1.0 },
    { x: DESERT_OASIS_POS[0] + 2, z: DESERT_OASIS_POS[2] - 6, s: 1.15 },
    { x: DESERT_OASIS_POS[0] - 5, z: DESERT_OASIS_POS[2] - 9, s: 0.9 },
  ];
  for (let p = 0; p < layouts.length; p++) {
    const l = layouts[p]!;
    const trunkH = 3.0 * l.s;
    const parts: SceneNode[] = [];
    // Trunk — slim slightly tapered cylinder with ringed banding suggesting
    // palm bark plates.
    parts.push(
      f.mesh("Trunk", cylinder(0.16, 0.22, trunkH, 10), trunk, {
        position: [0, trunkH / 2, 0],
      }, { castShadow: true, receiveShadow: true }),
    );
    // Five horizontal banding rings on the trunk.
    for (let r = 0; r < 5; r++) {
      const y = (r + 0.5) / 5 * trunkH;
      parts.push(
        f.mesh(`Trunk Ring ${r}`, cylinder(0.2, 0.2, 0.06, 10), trunkShade, {
          position: [0, y, 0],
        }, { castShadow: false }),
      );
    }
    // Crown base — a fat darker sphere at the top of the trunk.
    parts.push(
      f.mesh("Crown Base", sphere(0.22, 12, 8), trunkShade, {
        position: [0, trunkH + 0.05, 0],
      }, { castShadow: false }),
    );
    // ── Eight fronds fanning outward and down from the crown ──
    const fronds = 9;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2;
      const tilt = -0.65 + (i % 2) * 0.15; // alternate tilts so fronds layer
      const frondL = 1.2 + (i % 3) * 0.18;
      const m = i % 3 === 0 ? frondHi : (i % 3 === 1 ? frond : frondShade);
      // Frond spine — slim elongated box angled out + down.
      parts.push(
        f.mesh(`Frond ${i} Spine`, box(0.06, 0.05, frondL), m, {
          position: [
            Math.cos(a) * frondL * 0.5,
            trunkH + 0.05 + Math.sin(tilt) * frondL * 0.5,
            Math.sin(a) * frondL * 0.5,
          ],
          rotation: [tilt * Math.sin(a), a, -tilt * Math.cos(a)],
        }, { castShadow: true, receiveShadow: true }),
      );
      // Frond leaflet cluster — wider angled box at the spine end.
      parts.push(
        f.mesh(`Frond ${i} Leaflets`, box(0.34, 0.05, frondL * 0.7), m, {
          position: [
            Math.cos(a) * frondL * 0.75,
            trunkH + 0.05 + Math.sin(tilt) * frondL * 0.75 - 0.08,
            Math.sin(a) * frondL * 0.75,
          ],
          rotation: [tilt * Math.sin(a), a, -tilt * Math.cos(a)],
        }, { castShadow: false }),
      );
    }
    // ── Pendant date cluster — dark fruit hanging below the crown ──
    const cluster = 5;
    for (let i = 0; i < cluster; i++) {
      const a = (i / cluster) * Math.PI * 2;
      const m = i % 2 === 0 ? dates : datesHi;
      parts.push(
        f.mesh(`Date ${i}`, sphere(0.07, 8, 6), m, {
          position: [Math.cos(a) * 0.18, trunkH - 0.18, Math.sin(a) * 0.18],
          scale: [1.0, 1.4, 1.0],
        }, { castShadow: false }),
      );
    }
    palms.push(
      f.group(`Date Palm ${p + 1}`, parts, {
        position: [l.x, 0, l.z],
        rotation: [0, rng() * Math.PI * 2, 0],
      }),
    );
  }
  return f.group("Date Palms", palms);
}

/**
 * A small mud-brick caravanserai (adobe travellers' inn) at the southeast
 * corner of the oasis — a low square box with sand-coloured adobe walls,
 * arched front entrance, round wooden roof-beam ends protruding through the
 * upper walls (a characteristic adobe detail) and a flat sun-baked clay roof
 * with a slim parapet around its edges. A short shaded archway over the
 * entrance and a small round window on the south wall round out the silhouette.
 */
function buildCaravanserai(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wall = std(C.adobeWall, 0.95, { texture: "cobblestone", textureScale: [2, 1.5], flatShading: true });
  const wallShade = std(C.adobeWallShade, 0.95, { flatShading: true });
  const wallHi = std(C.adobeWallHi, 0.9, { flatShading: true });
  const beam = std(C.adobeRoofBeam, 0.95, { texture: "wood", textureScale: [1, 1], flatShading: true });
  const door = std(C.adobeDoor, 0.95, { texture: "wood", textureScale: [1, 2] });
  const archTrim = std(C.adobeArchTrim, 0.9, { flatShading: true });
  const windowPane: MaterialDef = {
    color: "#3a2a18",
    roughness: 0.4,
    metalness: 0.2,
    transparent: true,
    opacity: 0.75,
  };
  const wallW = 2.6;
  const wallH = 2.0;
  const wallD = 2.2;
  const parts: SceneNode[] = [
    // Footing slab — slightly wider than the walls.
    f.mesh("Caravanserai Footing", box(wallW + 0.4, 0.08, wallD + 0.4), wallShade, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    // Main adobe box — sloped slightly so the walls read as hand-built.
    f.mesh("Caravanserai Body", box(wallW, wallH, wallD), wall, {
      position: [0, wallH / 2 + 0.08, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Slim parapet ring around the top of the walls — a slightly raised
    // brim suggesting the flat-roof drainage edge.
    f.mesh("Parapet F", box(wallW + 0.12, 0.18, 0.1), wallHi, {
      position: [0, wallH + 0.17, wallD / 2 + 0.05],
    }, { castShadow: false }),
    f.mesh("Parapet B", box(wallW + 0.12, 0.18, 0.1), wallHi, {
      position: [0, wallH + 0.17, -(wallD / 2 + 0.05)],
    }, { castShadow: false }),
    f.mesh("Parapet L", box(0.1, 0.18, wallD + 0.12), wallHi, {
      position: [-(wallW / 2 + 0.05), wallH + 0.17, 0],
    }, { castShadow: false }),
    f.mesh("Parapet R", box(0.1, 0.18, wallD + 0.12), wallHi, {
      position: [wallW / 2 + 0.05, wallH + 0.17, 0],
    }, { castShadow: false }),
    // Flat roof slab — slightly inset within the parapet, sun-baked clay tone.
    f.mesh("Flat Roof", box(wallW - 0.05, 0.06, wallD - 0.05), wallShade, {
      position: [0, wallH + 0.14, 0],
    }, { receiveShadow: true }),
  ];
  // ── Round wooden roof-beam ends protruding through the front wall ──
  for (let i = 0; i < 5; i++) {
    const x = -wallW / 2 + 0.2 + i * (wallW - 0.4) / 4;
    parts.push(
      f.mesh(`Beam End ${i}`, cylinder(0.08, 0.08, 0.18, 8), beam, {
        position: [x, wallH - 0.16, wallD / 2 + 0.09],
        rotation: [Math.PI / 2, 0, 0],
      }, { castShadow: true }),
      f.mesh(`Beam Cap ${i}`, sphere(0.08, 10, 6), beam, {
        position: [x, wallH - 0.16, wallD / 2 + 0.18],
        scale: [1.0, 1.0, 0.5],
      }, { castShadow: false }),
    );
  }
  // ── Arched front entrance ──
  // Doorway box (recessed into the wall).
  parts.push(
    // Arched white trim around the doorway.
    f.mesh("Arch Outer", box(0.78, 1.3, 0.04), archTrim, {
      position: [0, 0.72, wallD / 2 + 0.025],
    }, { castShadow: false }),
    // Doorway inset — darker recess so the arch reads as a deep entry.
    f.mesh("Door Recess", box(0.62, 1.18, 0.06), wallShade, {
      position: [0, 0.66, wallD / 2 + 0.04],
    }, { castShadow: false }),
    // Plank door.
    f.mesh("Door", box(0.5, 1.05, 0.04), door, {
      position: [0, 0.6, wallD / 2 + 0.07],
    }, { castShadow: true }),
    // Door bands — two iron strips across the planks.
    f.mesh("Door Band U", box(0.5, 0.04, 0.05), beam, {
      position: [0, 0.95, wallD / 2 + 0.09],
    }, { castShadow: false }),
    f.mesh("Door Band L", box(0.5, 0.04, 0.05), beam, {
      position: [0, 0.3, wallD / 2 + 0.09],
    }, { castShadow: false }),
    // Slim arched top trim above the door — a half-disc reading as the
    // top of the arch.
    f.mesh("Arch Top", cylinder(0.4, 0.4, 0.06, 16), archTrim, {
      position: [0, 1.32, wallD / 2 + 0.04],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1.0, 1.0, 0.5],
    }, { castShadow: false }),
  );
  // ── Two small round windows on the side walls ──
  parts.push(
    // East side window.
    f.mesh("Window E Frame", cylinder(0.18, 0.18, 0.04, 16), archTrim, {
      position: [wallW / 2 + 0.025, 1.35, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
    f.mesh("Window E Glass", cylinder(0.14, 0.14, 0.05, 16), windowPane, {
      position: [wallW / 2 + 0.04, 1.35, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
    // West side window.
    f.mesh("Window W Frame", cylinder(0.18, 0.18, 0.04, 16), archTrim, {
      position: [-(wallW / 2 + 0.025), 1.35, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
    f.mesh("Window W Glass", cylinder(0.14, 0.14, 0.05, 16), windowPane, {
      position: [-(wallW / 2 + 0.04), 1.35, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: false }),
  );
  // ── A small clay water jar leaning against the east wall corner ──
  parts.push(
    f.mesh("Water Jar", sphere(0.18, 12, 10), std(C.terracotta, 0.95), {
      position: [wallW / 2 + 0.2, 0.22, -wallD / 2 + 0.3],
      scale: [1.0, 1.4, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Jar Neck", cylinder(0.07, 0.1, 0.12, 10), std(C.terracotta, 0.95), {
      position: [wallW / 2 + 0.2, 0.48, -wallD / 2 + 0.3],
    }, { castShadow: false }),
    f.mesh("Jar Lip", cylinder(0.1, 0.1, 0.03, 10), std("#7a4a2e", 0.95), {
      position: [wallW / 2 + 0.2, 0.54, -wallD / 2 + 0.3],
    }, { castShadow: false }),
  );
  return f.group("Caravanserai", parts, { position: pos, rotation: [0, -Math.PI / 8, 0] });
}

/**
 * A focal sandstone obelisk pillar in the centre of the oasis — a tall square
 * pylon with a pyramidal cap, a slim hieroglyphic relief band carved into the
 * shaft and a wider stepped pedestal at the base. The obelisk's stone reads
 * with subtle veined relief thanks to the `marble` bumpMap being reused on
 * the cap accent ring, and the rough cobblestone texture on the shaft
 * suggests weathered sandstone bedding.
 */
function buildDesertObelisk(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.obeliskStone, 0.95, { texture: "cobblestone", textureScale: [1.5, 4], flatShading: true });
  const stoneShade = std(C.obeliskStoneShade, 0.95, { flatShading: true });
  const glyph = std(C.obeliskGlyph, 0.85, { flatShading: true });
  const parts: SceneNode[] = [
    // Stepped pedestal — three slabs stacked, each smaller than the one below.
    f.mesh("Pedestal L", box(1.4, 0.18, 1.4), stoneShade, {
      position: [0, 0.09, 0],
    }, { receiveShadow: true }),
    f.mesh("Pedestal M", box(1.1, 0.16, 1.1), stone, {
      position: [0, 0.26, 0],
    }, { receiveShadow: true }),
    f.mesh("Pedestal U", box(0.85, 0.12, 0.85), stone, {
      position: [0, 0.4, 0],
    }, { receiveShadow: true }),
    // Obelisk shaft — a tall slim square pylon tapering very slightly.
    f.mesh("Obelisk Shaft", box(0.55, 3.6, 0.55), stone, {
      position: [0, 0.48 + 3.6 / 2, 0],
      scale: [1.0, 1.0, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    // Pyramidal cap — small pyramid (cone with 4 sides) capping the shaft.
    f.mesh("Obelisk Cap", cone(0.4, 0.7, 4), stone, {
      position: [0, 0.48 + 3.6 + 0.35, 0],
      rotation: [0, Math.PI / 4, 0],
    }, { castShadow: true }),
  ];
  // ── Hieroglyphic relief band — slim dark glyphs on each shaft face ──
  // Stack of small dark dabs at 4 heights × 4 columns per face × 4 faces.
  for (let face = 0; face < 4; face++) {
    const angle = (face / 4) * Math.PI * 2;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        const y = 0.9 + row * 0.7;
        const x = (col - 1) * 0.16;
        parts.push(
          f.mesh(`Glyph ${face}-${row}-${col}`, box(0.08, 0.12, 0.02), glyph, {
            position: [
              Math.cos(angle) * 0.29 + Math.sin(angle) * x,
              y,
              Math.sin(angle) * 0.29 + Math.cos(angle) * x,
            ],
            rotation: [0, angle, 0],
          }, { castShadow: false }),
        );
      }
    }
  }
  // ── Four corner markers around the pedestal ──
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(
      f.mesh(`Corner Stone ${i}`, sphere(0.12, 8, 6), stoneShade, {
        position: [Math.cos(a) * 0.85, 0.06, Math.sin(a) * 0.85],
        scale: [1.0, 0.6, 1.0],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  return f.group("Desert Obelisk", parts, { position: pos });
}

/**
 * A small resting camel statue with a red saddle blanket and gold tassels —
 * a sandstone-tan body lying on the desert sand, with the typical camel
 * silhouette of a long arched neck, two humps on the back and folded legs
 * tucked beneath the body. Slim copper-patina bridle ring and brass tassel
 * dots on the saddle add metallic accents.
 */
function buildCamelStatue(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const body = std(C.camelBody, 0.85, { flatShading: true });
  const bodyShade = std(C.camelBodyShade, 0.9, { flatShading: true });
  const saddle = std(C.camelSaddle, 0.65, { flatShading: true });
  const tassel = std(C.camelTassel, 0.45, { metalness: 0.6 });
  const eye = std(C.carouselEye, 0.7);
  const parts: SceneNode[] = [
    // Belly — wide flattened sphere on the sand.
    f.mesh("Belly", sphere(0.45, 14, 10), bodyShade, {
      position: [0, 0.22, 0],
      scale: [2.0, 0.7, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    // Body — main barrel of the camel, swelled.
    f.mesh("Body", sphere(0.4, 14, 10), body, {
      position: [0, 0.4, 0],
      scale: [2.2, 1.0, 1.1],
    }, { castShadow: true, receiveShadow: true }),
    // Front hump.
    f.mesh("Hump F", sphere(0.22, 12, 8), body, {
      position: [0.18, 0.62, 0],
      scale: [1.0, 1.1, 0.9],
    }, { castShadow: true, receiveShadow: true }),
    // Back hump.
    f.mesh("Hump B", sphere(0.22, 12, 8), body, {
      position: [-0.18, 0.62, 0],
      scale: [1.0, 1.1, 0.9],
    }, { castShadow: true, receiveShadow: true }),
    // Saddle — red blanket draped over the humps.
    f.mesh("Saddle", box(0.7, 0.06, 0.5), saddle, {
      position: [0, 0.78, 0],
    }, { castShadow: false }),
    // Saddle trim — gold edging along the blanket's perimeter.
    f.mesh("Saddle Trim F", box(0.7, 0.04, 0.04), tassel, {
      position: [0, 0.79, 0.27],
    }, { castShadow: false }),
    f.mesh("Saddle Trim B", box(0.7, 0.04, 0.04), tassel, {
      position: [0, 0.79, -0.27],
    }, { castShadow: false }),
    // Saddle tassel dots — four small gold balls at the saddle corners.
    f.mesh("Tassel NE", sphere(0.04, 8, 6), tassel, {
      position: [0.34, 0.77, 0.27],
    }, { castShadow: false }),
    f.mesh("Tassel NW", sphere(0.04, 8, 6), tassel, {
      position: [-0.34, 0.77, 0.27],
    }, { castShadow: false }),
    f.mesh("Tassel SE", sphere(0.04, 8, 6), tassel, {
      position: [0.34, 0.77, -0.27],
    }, { castShadow: false }),
    f.mesh("Tassel SW", sphere(0.04, 8, 6), tassel, {
      position: [-0.34, 0.77, -0.27],
    }, { castShadow: false }),
  ];
  // ── Neck arching forward + up from the body ──
  parts.push(
    f.mesh("Neck", cylinder(0.13, 0.18, 0.7, 12), body, {
      position: [0.72, 0.65, 0],
      rotation: [0, 0, -Math.PI / 3],
    }, { castShadow: true, receiveShadow: true }),
  );
  // ── Head ──
  parts.push(
    f.mesh("Head", sphere(0.16, 14, 10), body, {
      position: [1.0, 0.88, 0],
      scale: [1.5, 1.0, 1.0],
    }, { castShadow: true, receiveShadow: true }),
    // Muzzle — elongated darker patch.
    f.mesh("Muzzle", sphere(0.09, 12, 8), bodyShade, {
      position: [1.15, 0.84, 0],
      scale: [1.5, 0.9, 1.0],
    }, { castShadow: false }),
    // Two small floppy ears.
    f.mesh("Ear L", cone(0.04, 0.08, 6), body, {
      position: [0.98, 1.0, 0.07],
      rotation: [0.3, 0, -0.2],
    }, { castShadow: false }),
    f.mesh("Ear R", cone(0.04, 0.08, 6), body, {
      position: [0.98, 1.0, -0.07],
      rotation: [-0.3, 0, -0.2],
    }, { castShadow: false }),
    // Eyes.
    f.mesh("Eye L", sphere(0.018, 8, 6), eye, {
      position: [1.05, 0.92, 0.1],
    }, { castShadow: false }),
    f.mesh("Eye R", sphere(0.018, 8, 6), eye, {
      position: [1.05, 0.92, -0.1],
    }, { castShadow: false }),
    // Bridle ring — slim copper-patina ring around the muzzle.
    f.mesh("Bridle Ring", cylinder(0.1, 0.1, 0.02, 16), tassel, {
      position: [1.12, 0.84, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
  );
  // ── Folded front legs tucked beneath the chest ──
  parts.push(
    f.mesh("Leg F Tuck L", cylinder(0.08, 0.09, 0.32, 8), body, {
      position: [0.5, 0.18, 0.18],
      rotation: [0, 0, Math.PI / 2.2],
    }, { castShadow: true }),
    f.mesh("Leg F Tuck R", cylinder(0.08, 0.09, 0.32, 8), body, {
      position: [0.5, 0.18, -0.18],
      rotation: [0, 0, Math.PI / 2.2],
    }, { castShadow: true }),
    f.mesh("Leg B Tuck L", cylinder(0.08, 0.09, 0.34, 8), body, {
      position: [-0.55, 0.18, 0.18],
      rotation: [0, 0, Math.PI / 2.2],
    }, { castShadow: true }),
    f.mesh("Leg B Tuck R", cylinder(0.08, 0.09, 0.34, 8), body, {
      position: [-0.55, 0.18, -0.18],
      rotation: [0, 0, Math.PI / 2.2],
    }, { castShadow: true }),
    // Slim tail flicked to one side.
    f.mesh("Tail", cylinder(0.025, 0.04, 0.32, 6), bodyShade, {
      position: [-0.85, 0.36, 0.1],
      rotation: [0, 0, Math.PI / 3],
    }, { castShadow: false }),
  );
  return f.group("Camel Statue", parts, { position: pos, rotation: [0, Math.PI / 5, 0] });
}

/* ─────────────── twenty-second-pass courtyard prop ─────────────── */

/**
 * A Victorian wrought-iron flagpole stand with a striped triangular pennant
 * flag on a fluted marble base. The piece pairs a swelled marble plinth
 * (carrying the existing `marble` colour + bump pair so the stone reads with
 * veined relief), a slim copper-patina vertical pole capped by a finial ball
 * (reusing the existing `copper-patina` colour + bump pair so the verdigris
 * mottling reads as crusted relief on the cast metal), a slim halyard ring
 * carrying a triangular pennant flag with cream-and-rose horizontal stripes
 * fluttering off to the east and a small tip tassel on the pennant's outer
 * point. Parked on the front-west outside-gate apron just beyond the picket
 * fence — a focal piece punctuating the gate approach.
 */
function buildFlagpoleStand(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const pole: MaterialDef = {
    color: C.carouselPole,
    roughness: 0.55,
    metalness: 0.7,
    texture: "copper-patina",
    textureScale: [1, 4],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.02,
  };
  const poleHi = std(C.carouselPoleHi, 0.4, { metalness: 0.85 });
  const marble = std(C.flagpolePlinth, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.03,
  });
  const marbleShade = std(C.flagpolePlinthShade, 0.95, { flatShading: true });
  const rope = std(C.flagpoleRope, 0.95, { flatShading: true });
  const flagCream = std(C.flagFieldCream, 0.65, { flatShading: true });
  const flagRose = std(C.flagFieldRose, 0.7, { flatShading: true });
  const flagShade = std(C.flagFieldShade, 0.85, { flatShading: true });
  const parts: SceneNode[] = [];
  // ── Fluted marble plinth — small square footing and round column ──
  parts.push(
    f.mesh("Plinth Footing", box(0.62, 0.08, 0.62), marbleShade, {
      position: [0, 0.04, 0],
    }, { receiveShadow: true }),
    f.mesh("Plinth Base", cylinder(0.28, 0.3, 0.1, 18), marble, {
      position: [0, 0.13, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Plinth Column", cylinder(0.22, 0.24, 0.5, 18), marble, {
      position: [0, 0.43, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Plinth Cap", cylinder(0.28, 0.28, 0.05, 18), marble, {
      position: [0, 0.71, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Copper-patina trim band at the cap.
    f.mesh("Plinth Cap Trim", cylinder(0.27, 0.27, 0.022, 20), pole, {
      position: [0, 0.745, 0],
    }, { castShadow: false }),
  );
  // Six slim fluting grooves around the column.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      f.mesh(`Plinth Flute ${i}`, box(0.022, 0.45, 0.025), marbleShade, {
        position: [Math.cos(a) * 0.23, 0.43, Math.sin(a) * 0.23],
        rotation: [0, a, 0],
      }, { castShadow: false }),
    );
  }
  // ── Vertical copper-patina flagpole rising from the plinth cap ──
  const poleY = 0.75;
  const poleH = 2.6;
  parts.push(
    f.mesh("Flagpole", cylinder(0.035, 0.045, poleH, 12), pole, {
      position: [0, poleY + poleH / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Slim swelled bead at the pole midshaft.
    f.mesh("Pole Bead", sphere(0.06, 12, 8), poleHi, {
      position: [0, poleY + poleH * 0.55, 0],
    }, { castShadow: false }),
    // Finial ball capping the pole tip.
    f.mesh("Pole Cap", sphere(0.08, 14, 10), pole, {
      position: [0, poleY + poleH + 0.02, 0],
    }, { castShadow: true }),
    // Bright highlight crown on the finial ball.
    f.mesh("Pole Cap Hi", sphere(0.06, 12, 8), poleHi, {
      position: [0, poleY + poleH + 0.05, 0],
      scale: [0.9, 0.7, 0.9],
    }, { castShadow: false }),
    // Halyard ring near the top of the pole.
    f.mesh("Halyard Ring", cylinder(0.07, 0.07, 0.018, 16), pole, {
      position: [0, poleY + poleH * 0.92, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
    // Halyard ring near the base of the pole.
    f.mesh("Halyard Ring Lower", cylinder(0.05, 0.05, 0.015, 14), pole, {
      position: [0, poleY + poleH * 0.3, 0],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
    // Slim halyard rope running down the east side of the pole.
    f.mesh("Halyard Rope", cylinder(0.01, 0.01, poleH * 0.62, 6), rope, {
      position: [0.05, poleY + poleH * 0.61, 0],
    }, { castShadow: false }),
    // Tied-off rope cleat — small cylindrical knot near the lower ring.
    f.mesh("Rope Knot", sphere(0.025, 8, 6), rope, {
      position: [0.05, poleY + poleH * 0.3, 0],
    }, { castShadow: false }),
  );
  // ── Triangular striped pennant flag fluttering off to the east ──
  // Flag attaches at the upper halyard ring (y ≈ poleY + poleH * 0.92) and
  // tapers eastward to a small tip. Built from three horizontal stripe slats
  // so cream/rose/cream reads as a tricolour bunting in glancing sun.
  const flagY0 = poleY + poleH * 0.92;
  const flagY1 = poleY + poleH * 0.7;
  const flagCentreY = (flagY0 + flagY1) / 2;
  const flagH = flagY0 - flagY1;
  // Hoist edge — slim vertical strip clamped against the halyard ring.
  parts.push(
    f.mesh("Flag Hoist", box(0.02, flagH, 0.04), flagShade, {
      position: [0.06, flagCentreY, 0],
    }, { castShadow: false }),
  );
  // Three horizontal flag stripes tapering to a point at the eastern tip.
  // Use slim slanted box panels so each stripe reads as a tapered triangle.
  for (let s = 0; s < 5; s++) {
    const t = (s + 0.5) / 5;
    const stripeY = flagY0 - t * flagH;
    const stripeMat = s % 2 === 0 ? flagCream : flagRose;
    // Each stripe is a thin tapered slat; we approximate the triangular
    // tip by shrinking the slat width at outer x. Use a sequence of
    // shrinking slats so the silhouette reads as a triangle.
    for (let k = 0; k < 4; k++) {
      const u0 = k / 4;
      const u1 = (k + 1) / 4;
      const segX = 0.08 + ((u0 + u1) / 2) * 1.05;
      const segLen = 0.28;
      const segH = (flagH / 5) * (1 - u0 * 0.85);
      const lift = Math.sin(u0 * Math.PI * 0.7) * 0.04;
      parts.push(
        f.mesh(`Flag Stripe ${s} ${k}`, box(segLen, segH, 0.015), stripeMat, {
          position: [segX, stripeY + lift, 0],
          rotation: [0, 0, lift * -0.2],
        }, { castShadow: false }),
      );
    }
  }
  // Slim cream-and-rose tip tassel hanging from the pennant's outer point.
  parts.push(
    f.mesh("Flag Tip Tassel", cone(0.02, 0.07, 6), flagRose, {
      position: [1.15, flagCentreY - flagH * 0.42, 0],
      rotation: [0, 0, Math.PI],
    }, { castShadow: false }),
    f.mesh("Flag Tip Bead", sphere(0.022, 8, 6), poleHi, {
      position: [1.15, flagCentreY - flagH * 0.3, 0],
    }, { castShadow: false }),
  );
  // Slim dark shade strip just behind the flag so the cloth reads as a
  // soft drop shadow on the marble plinth even when the sun is high.
  parts.push(
    f.mesh("Flag Shade Strip", box(1.0, flagH * 0.95, 0.008), flagShade, {
      position: [0.55, flagCentreY - 0.005, -0.012],
      scale: [1.0, 0.95, 1.0],
    }, { castShadow: false }),
  );
  return f.group("Flagpole Stand", parts, { position: pos, rotation: [0, -0.2, 0] });
}

/* ─────────────── twenty-second-pass house detail ─────────────── */

/**
 * A pair of small Victorian copper sunburst rosettes mounted on the front and
 * back gable faces above the existing oculus windows. Each rosette pairs a
 * slim central marble disc (carrying the existing `marble` colour + bump pair
 * so the stone reads with veined relief), twelve copper-patina rays radiating
 * outward in an alternating long/short pattern (reusing the existing
 * `copper-patina` colour + bump pair so the verdigris reads as crusted relief
 * on the cast metal) and a small central boss covering the ray junction. The
 * rosettes add a tidy ornamental focus to the gable faces in the space
 * between the existing oculus window trim and the gable peak finial.
 */
function buildGableSunbursts(f: NodeFactory): SceneNode {
  return f.group("Gable Sunbursts", [
    buildGableSunburst(f, FRONT_SUNBURST_POS, 0),
    buildGableSunburst(f, BACK_SUNBURST_POS, Math.PI),
  ]);
}

function buildGableSunburst(
  f: NodeFactory,
  pos: [number, number, number],
  yaw: number,
): SceneNode {
  const copper: MaterialDef = {
    color: C.copperPatina,
    roughness: 0.55,
    metalness: 0.6,
    texture: "copper-patina",
    textureScale: [1, 1],
    bumpMap: "copper-patina-bump",
    bumpScale: 0.04,
  };
  const marble = std(C.sunburstDisc, 0.85, {
    texture: "marble",
    bumpMap: "marble-bump",
    bumpScale: 0.03,
  });
  const marbleShade = std(C.sunburstDiscShade, 0.95, { flatShading: true });
  const discR = 0.16;
  const longRay = 0.22;
  const shortRay = 0.14;
  const parts: SceneNode[] = [];
  // Twelve rays radiating outward — alternating long/short for a classic
  // sunburst silhouette. Each ray is a slim slat tilted along its bearing
  // and tapering outward.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const isLong = i % 2 === 0;
    const len = isLong ? longRay : shortRay;
    const inner = discR * 0.85;
    const cx = Math.cos(a) * (inner + len / 2);
    const cy = Math.sin(a) * (inner + len / 2);
    const segH = isLong ? 0.05 : 0.04;
    parts.push(
      f.mesh(`Ray ${i}`, box(len, segH, 0.03), copper, {
        position: [cx, cy, 0.012],
        rotation: [0, 0, a],
      }, { castShadow: false }),
    );
    // Slim ray tip bead on the long rays, suggesting a cast-metal terminal.
    if (isLong) {
      const tipX = Math.cos(a) * (inner + len);
      const tipY = Math.sin(a) * (inner + len);
      parts.push(
        f.mesh(`Ray Tip ${i}`, sphere(0.022, 8, 6), copper, {
          position: [tipX, tipY, 0.018],
        }, { castShadow: false }),
      );
    }
  }
  // Central marble disc carrying the rays — slim cylinder backing the boss.
  parts.push(
    // Outer copper rim ring just inside the rays.
    f.mesh("Disc Ring", cylinder(discR, discR, 0.04, 26), copper, {
      position: [0, 0, 0.008],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: true }),
    // Marble disc face — slightly proud of the rim so the stone face reads.
    f.mesh("Disc Face", cylinder(discR * 0.88, discR * 0.88, 0.03, 24), marble, {
      position: [0, 0, 0.025],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
    // Slim marble inset face shading suggesting the chiselled flat.
    f.mesh("Disc Inset", cylinder(discR * 0.66, discR * 0.66, 0.02, 22), marbleShade, {
      position: [0, 0, 0.04],
      rotation: [Math.PI / 2, 0, 0],
    }, { castShadow: false }),
    // Central boss covering the ray junction — small swelled copper dome.
    f.mesh("Disc Boss", sphere(0.07, 14, 10), copper, {
      position: [0, 0, 0.05],
      scale: [1.0, 1.0, 0.85],
    }, { castShadow: false }),
    // Slim boss highlight bead at the boss tip.
    f.mesh("Boss Tip", sphere(0.025, 8, 6), std(C.carouselPoleHi, 0.4, { metalness: 0.85 }), {
      position: [0, 0, 0.085],
    }, { castShadow: false }),
  );
  return f.group("Gable Sunburst", parts, { position: pos, rotation: [0, yaw, 0] });
}

/* ─────────────── twenty-second-pass scene extension ─────────────── */

/**
 * Far-southwest peat-bog moor ground plane and props — tucked south of the
 * lavender field and west of the wheat field, bridging the gap between the
 * lavender field's south edge and the wheat field's west edge. The plane
 * overlaps the lavender field by ~1 unit along its north join and the wheat
 * field by ~1 unit along its east join so the ground layer has no holes at
 * either seam. Carries the new `peat-moor` colour map paired with a turf-cut
 * depth map so the peat-cut blocks and dark pools read as raised relief at
 * glancing sun, a lavender-grass apron along the north join and a
 * wheat-stubble apron along the east join, a small stone crofter's cottage
 * at the south corner with a thatched pitched roof and a slim chimney
 * trailing pale smoke, a stack of three rectangular peat-cuttings on a slate
 * platform, a winding burn (small stream) meandering through the moor
 * crossed by a slim wooden plank footbridge with rope rails, a scatter of
 * seven heather tufts in three bloom tints across the moss and a small tor
 * of three mossy granite boulders at the west edge framing the burn's
 * source.
 */
function buildFarSouthwestPeatMoor(f: NodeFactory): SceneNode {
  return f.group("Far Southwest Peat Moor", [
    // Peat moor ground plane — moss-toned ground with the new colour +
    // depth map pair so the peat-cut blocks and dark pools read as raised
    // relief at glancing sun.
    f.mesh(
      "Peat Moor Ground",
      plane(PEAT_MOOR_W, PEAT_MOOR_D),
      std(C.peatGround, 0.95, {
        texture: "peat-moor",
        textureScale: [4, 4],
        bumpMap: "peat-moor-bump",
        bumpScale: 0.06,
      }),
      { position: PEAT_MOOR_POS, rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    // North apron — overlaps the lavender field's south edge with a
    // dark moss-and-stem strip so the seam reads as a continuous moor
    // join between the cultivated rows and the wild peat ground.
    f.mesh(
      "Peat Moor North Apron",
      plane(PEAT_MOOR_W, 3),
      std(C.lavenderApron, 0.95, { texture: "grass", textureScale: [6, 1] }),
      {
        position: [
          PEAT_MOOR_POS[0],
          -0.02,
          PEAT_MOOR_POS[2] - PEAT_MOOR_D / 2 + 1.5,
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    // East apron — overlaps the wheat field's west edge with a slim
    // stubble-toned strip so the seam reads as a continuous moor fringe.
    f.mesh(
      "Peat Moor East Apron",
      plane(3, PEAT_MOOR_D),
      std(C.wheatStubbleApron, 0.95, { texture: "grass", textureScale: [1, 6] }),
      {
        position: [
          PEAT_MOOR_POS[0] + PEAT_MOOR_W / 2 - 1.5,
          -0.02,
          PEAT_MOOR_POS[2],
        ],
        rotation: [-Math.PI / 2, 0, 0],
      },
      { receiveShadow: true },
    ),
    buildCroftersCottage(f, CROFTERS_COTTAGE_POS),
    buildPeatStack(f, PEAT_STACK_POS),
    buildPeatBurn(f),
    buildPeatPlankBridge(f, PEAT_BRIDGE_POS),
    buildPeatHeatherTufts(f),
    buildPeatBoulderTor(f, PEAT_BOULDER_TOR_POS),
  ]);
}

/**
 * A small stone crofter's cottage — low fieldstone wall courses, a thatched
 * pitched roof, a slim stone chimney trailing pale smoke wisps, a plank
 * front door with a tiny brass knob and a glowing square front window with
 * a cross muntin. A classic island-Scottish moor dwelling.
 */
function buildCroftersCottage(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const stone = std(C.crofterStone, 0.95, { texture: "cobblestone", flatShading: true });
  const stoneDark = std(C.crofterStoneDark, 0.95, { texture: "cobblestone", flatShading: true });
  const thatch = std(C.thatchStraw, 0.95, { texture: "grass", textureScale: [3, 2], flatShading: true });
  const thatchShade = std(C.thatchStrawShade, 0.95, { flatShading: true });
  const door = std(C.crofterDoor, 0.95, { texture: "wood", textureScale: [1, 2], flatShading: true });
  const chimney = std(C.crofterChimney, 0.95, { texture: "cobblestone", flatShading: true });
  const glass: MaterialDef = {
    color: C.crofterGlow,
    roughness: 0.25,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
    emissive: C.crofterGlow,
  };
  const brass = std(C.brass, 0.4, { metalness: 0.7 });
  const smoke: MaterialDef = {
    color: "#e0d8c8",
    roughness: 0.95,
    transparent: true,
    opacity: 0.42,
  };
  const w = 3.4;
  const d = 2.6;
  const wallH = 1.6;
  const parts: SceneNode[] = [];
  // ── Four fieldstone walls ──
  parts.push(
    // South wall (front).
    f.mesh("Wall S", box(w, wallH, 0.22), stone, {
      position: [0, wallH / 2, d / 2],
    }, { castShadow: true, receiveShadow: true }),
    // North wall.
    f.mesh("Wall N", box(w, wallH, 0.22), stone, {
      position: [0, wallH / 2, -d / 2],
    }, { castShadow: true, receiveShadow: true }),
    // West gable wall — taller to meet the roof ridge.
    f.mesh("Wall W", box(0.22, wallH + 0.5, d), stoneDark, {
      position: [-w / 2, (wallH + 0.5) / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
    // East gable wall.
    f.mesh("Wall E", box(0.22, wallH + 0.5, d), stoneDark, {
      position: [w / 2, (wallH + 0.5) / 2, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Slim stone wall courses (irregular highlights) across the south wall.
  for (let i = 0; i < 4; i++) {
    const cy = 0.2 + i * 0.32;
    parts.push(
      f.mesh(`Course ${i}`, box(w - 0.1, 0.04, 0.04), stoneDark, {
        position: [0, cy, d / 2 + 0.13],
      }, { castShadow: false }),
    );
  }
  // ── Pitched thatched roof — two angled slabs meeting at a ridge ──
  const ridgeY = wallH + 0.85;
  const halfD = d / 2 + 0.3;
  const hyp = Math.hypot(0.85, halfD);
  const slope = Math.atan2(0.85, halfD);
  parts.push(
    // South slope.
    f.mesh("Thatch S", box(w + 0.4, 0.16, hyp), thatch, {
      position: [0, ridgeY - 0.42, halfD / 2],
      rotation: [-slope, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // North slope.
    f.mesh("Thatch N", box(w + 0.4, 0.16, hyp), thatch, {
      position: [0, ridgeY - 0.42, -halfD / 2],
      rotation: [slope, 0, 0],
    }, { castShadow: true, receiveShadow: true }),
    // Ridge cap — a slim rope-bound thatch ridge running along the peak.
    f.mesh("Thatch Ridge", cylinder(0.1, 0.1, w + 0.45, 8), thatchShade, {
      position: [0, ridgeY, 0],
      rotation: [0, 0, Math.PI / 2],
    }, { castShadow: true }),
    // Two diagonal rope ties across the ridge.
    f.mesh("Ridge Tie A", cylinder(0.015, 0.015, 0.7, 6), std(C.flagpoleRope, 0.95), {
      position: [-w * 0.3, ridgeY - 0.06, 0],
      rotation: [0, 0, Math.PI / 3],
    }, { castShadow: false }),
    f.mesh("Ridge Tie B", cylinder(0.015, 0.015, 0.7, 6), std(C.flagpoleRope, 0.95), {
      position: [w * 0.3, ridgeY - 0.06, 0],
      rotation: [0, 0, -Math.PI / 3],
    }, { castShadow: false }),
  );
  // ── Slim stone chimney on the east gable peak trailing pale smoke ──
  parts.push(
    f.mesh("Chimney Stack", box(0.34, 0.9, 0.34), chimney, {
      position: [w / 2 + 0.05, ridgeY + 0.2, 0.3],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Chimney Crown", box(0.42, 0.07, 0.42), stoneDark, {
      position: [w / 2 + 0.05, ridgeY + 0.69, 0.3],
    }, { castShadow: true }),
    // Three smoke wisps trailing east of the chimney.
    f.mesh("Smoke A", sphere(0.16, 12, 8), smoke, {
      position: [w / 2 + 0.2, ridgeY + 0.95, 0.3],
      scale: [1.2, 0.9, 1.1],
    }, { castShadow: false }),
    f.mesh("Smoke B", sphere(0.18, 12, 8), smoke, {
      position: [w / 2 + 0.55, ridgeY + 1.18, 0.45],
      scale: [1.3, 0.8, 1.2],
    }, { castShadow: false }),
    f.mesh("Smoke C", sphere(0.2, 12, 8), smoke, {
      position: [w / 2 + 0.95, ridgeY + 1.4, 0.6],
      scale: [1.4, 0.85, 1.2],
    }, { castShadow: false }),
  );
  // ── Plank front door on the south wall ──
  parts.push(
    f.mesh("Door Frame", box(0.55, 1.1, 0.04), stoneDark, {
      position: [-0.6, 0.55, d / 2 + 0.12],
    }, { castShadow: false }),
    f.mesh("Door", box(0.45, 1.0, 0.04), door, {
      position: [-0.6, 0.5, d / 2 + 0.14],
    }, { castShadow: false }),
    // Brass knob.
    f.mesh("Door Knob", sphere(0.03, 8, 6), brass, {
      position: [-0.45, 0.55, d / 2 + 0.18],
    }, { castShadow: false }),
  );
  // ── Glowing square front window on the south wall ──
  parts.push(
    f.mesh("Window Frame", box(0.55, 0.5, 0.04), stoneDark, {
      position: [0.6, 0.95, d / 2 + 0.12],
    }, { castShadow: false }),
    f.mesh("Window Glass", box(0.42, 0.4, 0.02), glass, {
      position: [0.6, 0.95, d / 2 + 0.14],
    }, { castShadow: false }),
    // Cross muntin.
    f.mesh("Window Muntin V", box(0.03, 0.4, 0.025), stoneDark, {
      position: [0.6, 0.95, d / 2 + 0.16],
    }, { castShadow: false }),
    f.mesh("Window Muntin H", box(0.42, 0.03, 0.025), stoneDark, {
      position: [0.6, 0.95, d / 2 + 0.16],
    }, { castShadow: false }),
  );
  // Slim stone front step.
  parts.push(
    f.mesh("Front Step", box(0.7, 0.08, 0.3), stoneDark, {
      position: [-0.6, 0.04, d / 2 + 0.28],
    }, { castShadow: false, receiveShadow: true }),
  );
  return f.group("Crofter's Cottage", parts, { position: pos, rotation: [0, 0.2, 0] });
}

/**
 * A stack of three rectangular peat-cuttings on a slate platform — slim
 * dark earth bricks arranged in a small pyramid as a cottage industry
 * detail, the slate base reads as a flat workbench in the moor.
 */
function buildPeatStack(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const peat = std(C.peatStack, 0.95, { flatShading: true });
  const peatHi = std(C.peatStackHi, 0.95, { flatShading: true });
  const slate = std(C.peatStackSlate, 0.95, { texture: "cobblestone", flatShading: true });
  const parts: SceneNode[] = [];
  // Slate platform.
  parts.push(
    f.mesh("Slate Platform", box(1.2, 0.06, 0.9), slate, {
      position: [0, 0.03, 0],
    }, { castShadow: true, receiveShadow: true }),
  );
  // Bottom row — three peat bricks side by side.
  for (let i = 0; i < 3; i++) {
    const px = (i - 1) * 0.32;
    parts.push(
      f.mesh(`Peat L1 ${i}`, box(0.3, 0.14, 0.5), peat, {
        position: [px, 0.13, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Slim ochre highlight along the brick top so the cut face reads.
      f.mesh(`Peat L1 ${i} Hi`, box(0.28, 0.02, 0.46), peatHi, {
        position: [px, 0.205, 0],
      }, { castShadow: false }),
    );
  }
  // Second row — two peat bricks staggered.
  for (let i = 0; i < 2; i++) {
    const px = (i - 0.5) * 0.32;
    parts.push(
      f.mesh(`Peat L2 ${i}`, box(0.3, 0.14, 0.46), peat, {
        position: [px, 0.27, 0],
      }, { castShadow: true, receiveShadow: true }),
      f.mesh(`Peat L2 ${i} Hi`, box(0.28, 0.02, 0.42), peatHi, {
        position: [px, 0.345, 0],
      }, { castShadow: false }),
    );
  }
  // Top — single peat brick crowning the pyramid.
  parts.push(
    f.mesh("Peat L3", box(0.3, 0.14, 0.42), peat, {
      position: [0, 0.41, 0],
    }, { castShadow: true, receiveShadow: true }),
    f.mesh("Peat L3 Hi", box(0.28, 0.02, 0.38), peatHi, {
      position: [0, 0.485, 0],
    }, { castShadow: false }),
  );
  return f.group("Peat Stack", parts, { position: pos, rotation: [0, 0.4, 0] });
}

/**
 * A winding burn (small stream) meandering through the moor — a slim
 * dark water ribbon set into the peat ground. Carries two layered strips
 * (deep core + glint) so the burn reads as a slow-moving channel.
 */
function buildPeatBurn(f: NodeFactory): SceneNode {
  const water = std(C.burnWater, 0.3, { metalness: 0.4 });
  const waterDeep = std(C.burnWaterShade, 0.35, { metalness: 0.3 });
  const bed = std(C.peatBog, 0.95, { flatShading: true });
  const parts: SceneNode[] = [];
  // Three burn segments at slight angles so the channel reads as winding.
  const segs: Array<{ x: number; z: number; len: number; yaw: number }> = [
    { x: -55, z: PEAT_BURN_Z + 0.5, len: 5.0, yaw: 0.18 },
    { x: -50.5, z: PEAT_BURN_Z, len: 4.4, yaw: -0.15 },
    { x: -46, z: PEAT_BURN_Z - 0.3, len: 4.0, yaw: 0.25 },
  ];
  let i = 0;
  for (const s of segs) {
    // Bed strip (dark) — slightly wider than water so the bank reads.
    parts.push(
      f.mesh(`Burn Bed ${i}`, plane(s.len, 0.7), bed, {
        position: [s.x, 0.005, s.z],
        rotation: [-Math.PI / 2, 0, s.yaw],
      }, { receiveShadow: true }),
      // Deep core water strip.
      f.mesh(`Burn Water ${i}`, plane(s.len * 0.94, 0.45), waterDeep, {
        position: [s.x, 0.012, s.z],
        rotation: [-Math.PI / 2, 0, s.yaw],
      }, { receiveShadow: true }),
      // Bright glint strip — narrow centre highlight.
      f.mesh(`Burn Glint ${i}`, plane(s.len * 0.88, 0.18), water, {
        position: [s.x, 0.018, s.z],
        rotation: [-Math.PI / 2, 0, s.yaw],
      }, { receiveShadow: false }),
    );
    i += 1;
  }
  return f.group("Peat Burn", parts);
}

/**
 * A slim wooden plank footbridge with rope rails crossing the burn — two
 * planks side by side carried on short slim posts, with a slim rope rail
 * threaded through low corner posts on each side. A traveller's crossing.
 */
function buildPeatPlankBridge(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const wood = std(C.shedWall, 0.95, { texture: "wood", textureScale: [3, 1], flatShading: true });
  const post = std(C.logBark, 0.95, { flatShading: true });
  const rope = std(C.flagpoleRope, 0.95);
  const parts: SceneNode[] = [];
  const len = 1.6;
  const planks = 2;
  for (let i = 0; i < planks; i++) {
    const z = (i - 0.5) * 0.22;
    parts.push(
      f.mesh(`Plank ${i}`, box(len, 0.06, 0.18), wood, {
        position: [0, 0.18, z],
      }, { castShadow: true, receiveShadow: true }),
    );
  }
  // Four corner posts carrying the rope rails.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        f.mesh(`Post ${sx}${sz}`, cylinder(0.04, 0.05, 0.5, 8), post, {
          position: [sx * (len / 2 - 0.05), 0.25, sz * 0.28],
        }, { castShadow: true }),
        // Slim ball cap on each post.
        f.mesh(`Post Cap ${sx}${sz}`, sphere(0.05, 10, 8), post, {
          position: [sx * (len / 2 - 0.05), 0.5, sz * 0.28],
        }, { castShadow: false }),
      );
    }
    // Slim rope rail running between the two posts on each side.
    parts.push(
      f.mesh(`Rope Rail ${sx}`, cylinder(0.012, 0.012, len - 0.1, 6), rope, {
        position: [0, 0.42, sx * 0.28],
        rotation: [0, 0, Math.PI / 2],
      }, { castShadow: false }),
    );
  }
  return f.group("Plank Bridge", parts, { position: pos, rotation: [0, 0.15, 0] });
}

/**
 * Seven heather tufts scattered across the moor in three bloom tints
 * (rose, pink, white) — each tuft a low dark moss cushion crowned by a
 * ring of small bloom dabs. Placed off the burn and away from the cottage.
 */
function buildPeatHeatherTufts(f: NodeFactory): SceneNode {
  const moss = std(C.mossPatch, 0.95, { flatShading: true });
  const bloomRose = std(C.heatherTuftRose, 0.85, { flatShading: true });
  const bloomPink = std(C.heatherTuftPink, 0.85, { flatShading: true });
  const bloomWhite = std(C.heatherTuftWhite, 0.85, { flatShading: true });
  const rng = mulberry32(0x9ea7e2);
  const tufts: SceneNode[] = [];
  const cx = PEAT_MOOR_POS[0];
  const cz = PEAT_MOOR_POS[2];
  const placements: Array<{ px: number; pz: number }> = [
    { px: cx - 4, pz: cz - 5 },
    { px: cx + 2, pz: cz - 4 },
    { px: cx + 5, pz: cz + 4 },
    { px: cx - 2, pz: cz + 5.5 },
    { px: cx + 3.5, pz: cz + 1 },
    { px: cx - 6, pz: cz + 4.5 },
    { px: cx - 0.5, pz: cz - 6.5 },
  ];
  let i = 0;
  for (const { px, pz } of placements) {
    const r = 0.32 + rng() * 0.1;
    const bloom: MaterialDef =
      i % 3 === 0 ? bloomRose : i % 3 === 1 ? bloomPink : bloomWhite;
    const tuftParts: SceneNode[] = [
      // Low dark moss cushion.
      f.mesh("Moss Cushion", sphere(r, 12, 8), moss, {
        position: [0, r * 0.45, 0],
        scale: [1.2, 0.55, 1.2],
      }, { castShadow: false, receiveShadow: true }),
    ];
    // Ring of seven small bloom dabs around the cushion crown.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rng() * 0.5;
      const ringR = r * 0.85;
      tuftParts.push(
        f.mesh(`Bloom ${k}`, sphere(0.07 + rng() * 0.02, 10, 8), bloom, {
          position: [Math.cos(a) * ringR, r * 0.7, Math.sin(a) * ringR],
          scale: [1.0, 1.0, 1.0],
        }, { castShadow: false }),
      );
    }
    // Slim crowning bloom dab at the centre top.
    tuftParts.push(
      f.mesh("Bloom Top", sphere(0.08, 10, 8), bloom, {
        position: [0, r * 0.85, 0],
      }, { castShadow: false }),
    );
    tufts.push(
      f.group(`Heather Tuft ${i}`, tuftParts, {
        position: [px, 0, pz],
        rotation: [0, rng() * Math.PI * 2, 0],
      }),
    );
    i += 1;
  }
  return f.group("Peat Heather Tufts", tufts);
}

/**
 * A small tor of three mossy granite boulders at the west edge of the
 * moor framing the burn's source — irregular flattened spheres with moss
 * caps suggesting weathered standing stones.
 */
function buildPeatBoulderTor(f: NodeFactory, pos: [number, number, number]): SceneNode {
  const granite = std(C.mossyBoulder, 0.95, { flatShading: true });
  const graniteShade = std(C.mossyBoulderShade, 0.95, { flatShading: true });
  const moss = std(C.mossPatch, 0.9, { flatShading: true });
  const parts: SceneNode[] = [];
  const boulders: Array<{
    pos: [number, number, number];
    scale: [number, number, number];
    yaw: number;
  }> = [
    { pos: [-0.5, 0.4, 0.1], scale: [1.4, 1.0, 1.2], yaw: 0.3 },
    { pos: [0.6, 0.5, -0.3], scale: [1.6, 1.3, 1.4], yaw: -0.4 },
    { pos: [0.2, 0.32, 0.7], scale: [1.2, 0.85, 1.0], yaw: 0.15 },
  ];
  let i = 0;
  for (const b of boulders) {
    parts.push(
      // Main boulder body.
      f.mesh(`Boulder ${i}`, sphere(0.55, 12, 8), granite, {
        position: b.pos,
        scale: b.scale,
        rotation: [0, b.yaw, 0],
      }, { castShadow: true, receiveShadow: true }),
      // Slim shaded base flange suggesting the boulder seated in turf.
      f.mesh(`Boulder Base ${i}`, sphere(0.5, 10, 8), graniteShade, {
        position: [b.pos[0], 0.18, b.pos[2]],
        scale: [b.scale[0] * 0.95, 0.35, b.scale[2] * 0.95],
      }, { castShadow: false, receiveShadow: true }),
      // Moss cap on the boulder crown.
      f.mesh(`Moss Cap ${i}`, sphere(0.32, 12, 8), moss, {
        position: [b.pos[0], b.pos[1] + b.scale[1] * 0.45, b.pos[2]],
        scale: [b.scale[0] * 0.6, 0.4, b.scale[2] * 0.6],
      }, { castShadow: false }),
    );
    i += 1;
  }
  return f.group("Peat Boulder Tor", parts, { position: pos });
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
 *  - Eleventh pass — yard: a wood-fired stone pizza oven with a
 *    domed terracotta chamber, a short brick chimney trailing
 *    drifting steam wisps and a stacked split-wood alcove, a
 *    slatted-top potting bench with a row of terracotta pots (one
 *    sprouting fresh herbs) and a leaning trowel, and a stone
 *    garden chess set with a marble-checkered board on a fluted
 *    pedestal flanked by two stone stools and a quorum of carved
 *    chess pieces mid-game; house: a cascading wisteria-bloom
 *    drape over the porch canopy with three purple bloom panels
 *    surfaced with the new `wisteria-bloom` colour map paired
 *    with a matching depth map so the floret cells read as
 *    relief; scene: a southwest wheat-field plane bridging the
 *    gap between the west pond garden's south edge and the south
 *    heath's west edge — golden wheat ground (with the new
 *    `wheat-field` colour map paired with a wind-row depth map),
 *    a Dutch-style four-sail tower windmill, scattered wheat
 *    sheaves and stooks, a winding cart trail with darker wheel
 *    ruts running between the field and the windmill door, and a
 *    low stake-and-twine fence along the field's south edge.
 *  - Twelfth pass — yard: a lean-to greenhouse on the back lawn
 *    with a sloped translucent roof, a white-painted timber frame,
 *    glass-pane walls, an open door panel and a row of three
 *    potted seedlings inside; house: a row of Victorian gingerbread
 *    corbel brackets ringing the front and back roof eaves (small
 *    stepped scrolls with drop finials, flanked by filigree slats);
 *    scene: a northwest woodland plane bridging the gap between
 *    the back meadow's west edge and the west pond garden's north
 *    edge — a moss-toned ground, a small grove of tall conifers
 *    (with the new `pine-bark` colour map paired with a depth map
 *    so the ridged trunks read as relief), a mossy fallen log, a
 *    fairy mushroom ring of red toadstools and a small wooden
 *    ranger lookout tower on four stilts with a peaked shingle
 *    roof and a leaning rung ladder.
 *  - Thirteenth pass — yard: a wooden rose pergola on the back-west
 *    lawn with a cross-beam lattice top, draped climbing-rose
 *    clusters and a slatted bench tucked beneath, and an ornamental
 *    dovecote tower on a hexagonal slate platform with four arched
 *    bird openings, a four-sided shingle roof, a turned finial
 *    spire and three perched white doves; house: a central roof
 *    cupola (belvedere) atop the main roof ridge — a small square
 *    turret with arched windows on each face, corner pilasters, a
 *    cornice cap, a peaked shingle roof and a copper-patina spire
 *    finial that reuses the existing `copper-patina` colour + bump
 *    pair so the verdigris reads as crusted relief at the crown of
 *    the house; scene: a southeast vineyard plane bridging the gap
 *    between the side orchard's south edge and the south heath's
 *    east edge — tilled cinnamon-earth ground (with the new
 *    `vineyard-soil` colour map paired with a row-ridge depth map
 *    so the plough furrows read as relief), five rows of grape
 *    trellises with leaf clusters and cobalt-purple grape bunches,
 *    a small stone wine press shed with a peaked shingle roof and
 *    a slim brick chimney, a stack of four oak wine barrels with
 *    iron hoops and a leaning cooper's mallet, and a pair of slim
 *    cypress trees framing the approach from the orchard side.
 *  - Fourteenth pass — yard: a wrought-iron Victorian two-seater
 *    garden glider with a striped canvas canopy on the west side
 *    lawn just outside the fence, and an ornamental brass armillary
 *    sphere on a fluted stone pedestal on the east side lawn just
 *    outside the fence; the armillary's intersecting rings (equator,
 *    prime meridian, tilted meridian) are built from instanced arc
 *    segments and reuse the existing `copper-patina` colour + bump
 *    pair so the verdigris reads as crusted relief on the metal
 *    arcs. House: a pair of round oculus windows centred in the
 *    front and back gables, each ringed by a copper-patina trim
 *    disc that reuses the existing `copper-patina` pair so the
 *    metal frame reads as crusted relief on the gable face, with a
 *    cross of slim trim muntins dividing the tinted glass pane.
 *    Scene: a southeast olive grove plane mirroring the side
 *    orchard's east edge, with a sun-bleached khaki ground (the
 *    new `olive-grove` colour map paired with a pebble depth map
 *    so the scattered olive pits and pale pebbles read as raised
 *    relief at glancing sun), an orchard-grass apron along the
 *    west join, a dry-stone retaining wall along the orchard edge
 *    with a doll-width gap, a grove of six silver-leaved olive
 *    trees with gnarled twin trunks and a sparse scatter of olive
 *    fruits, a south-corner cluster of three clay amphora urns
 *    leaning together on a slate base and a focal old olive-press
 *    millstone wheel ringed with decorative pebbles in the middle
 *    of the grove.
 *  - Fifteenth pass — yard: a pair of cedar Adirondack chairs
 *    facing each other across a slatted side table with a
 *    lemonade pitcher and two tumblers on the back lawn, and a
 *    tall ornamental cascading-flower urn on a fluted marble
 *    pedestal — a swelled terracotta vessel brimming with foliage
 *    and coral / yellow / cream bloom dabs that cascade past the
 *    rim — on the south lawn near the path's first bend. House:
 *    a verdigris brass door knocker (square backplate with a
 *    twelve-segment hoop ring and a striker stud) and a small
 *    house number plaque (stained pine board on a copper-patina
 *    trim frame with three carved-out numerals) mounted on the
 *    front wall beside the arched doorway — both reuse the
 *    existing `copper-patina` colour + bump pair so the metal
 *    fittings carry crusted relief on the door surround. Scene:
 *    a southwest lavender field plane mirroring the southeast
 *    olive grove's footprint on the west side of the lawn, with
 *    a cultivated sage-green ground surfaced with the new
 *    `lavender-field` colour map paired with a row-crest depth
 *    map (registered alongside the other procedural textures)
 *    so the bloom rows read as raised relief at glancing sun, a
 *    pond-garden-grass apron along the east join, a mirror
 *    dry-stone retaining wall along the pond-garden edge with a
 *    doll-width gap, five rows of cultivated lavender bushes
 *    (each a silver-green cushion crowned by a ring of purple
 *    bloom dabs in three shades), a south-corner cluster of
 *    three straw bee skeps on a slate platform, a focal antique
 *    stone watering trough on a slate plinth (with an iron
 *    spigot lip dripping a thin water column into the basin and
 *    a small mossy patch on its shoulder) and a weathered
 *    wooden flower cart parked at the north corner of the field
 *    (loaded with three cut-lavender bundles, faded red sideboard
 *    trim, two spoked wagon wheels and a long handle pole with a
 *    cross-bar grip).
 *  - Sixteenth pass — yard: a Victorian garden gazing ball on a
 *    swirling iron stand (slate footing, central shaft, four C-curve
 *    scrolls fanning up to a cradle holding a polished mirror-finish
 *    chrome sphere) near the south end of the cobble path's first
 *    bend, and a small stone cherub statue holding a basket of
 *    blooms on a low marble plinth opposite the gazing ball across
 *    the path; the cherub reuses the existing `marble` colour + bump
 *    pair so the stone reads with veined relief on the plinth.
 *    House: a pair of climbing-rose trellises mounted on the east
 *    and west exterior side walls — each a lattice grid of slim
 *    painted slats framed by a slightly thicker border, with two
 *    snaking dark vines climbing the verticals and a sparse scatter
 *    of leaf clusters and pink rose bloom dabs across the upper two
 *    thirds of the lattice. Scene: a far-north alpine foothills
 *    plane reaching beyond the lakefront's far edge — a snow-dusted
 *    moss ground surfaced with the new `alpine-foothills` colour map
 *    paired with a snowdrift-and-scree depth map (registered
 *    alongside the other procedural textures) so the drifts and
 *    rock heads read as raised relief at glancing sun, a lakefront-
 *    grass apron along the south join, a small log cabin with six
 *    stacked log courses per wall, a peaked shingle roof with snow
 *    caps, a dark front door, a square window with a warm interior
 *    glow and a tall stone chimney trailing three translucent smoke
 *    wisps, a grove of six snow-dusted conifers (three cone tiers
 *    each, crowned by pale snow caps), three rounded snowdrift
 *    mounds with shaded lee cores, a pair of mossy boulders framing
 *    a focal small frozen tarn pond with a deep-water core, a
 *    pale-blue ice surface, slim crack highlights and a fringe of
 *    exposed alpine pebbles around the shore.
 *  - Seventeenth pass — yard: a wrought-iron Victorian tea table set
 *    on the back-east lawn (round iron pedestal table flanked by two
 *    ornate scrollback chairs, with a porcelain teapot, two cups on
 *    saucers and a three-tier pastry stand laid out for tea), and a
 *    pair of stone owl sentinel statues on slate plinths flanking the
 *    cobble path entrance near the gate — both owl bodies reuse the
 *    existing `marble` colour + bump pair so the stone reads with
 *    veined relief on the rounded shoulders, and the amber eyes carry
 *    a soft emissive glow so the sentinels read at low light. House:
 *    a stained-glass arched fanlight transom panel centred above the
 *    front door, between the door arch trim and the porch canopy — the
 *    panel is surfaced with the new `stained-glass` colour map paired
 *    with a leaded-muntin depth map (registered alongside the other
 *    procedural textures) so the lead cames read as raised relief on
 *    the glass plane, a copper-patina trim arch frames the panel
 *    (reusing the existing copper-patina pair for verdigris relief),
 *    and a warm glow plate behind the colour panel makes the fanlight
 *    read as lit from the interior. Scene: a northeast autumn maple
 *    grove plane bridging the gap between the lakefront's east edge
 *    and the northeast pasture's north edge — an auburn ground
 *    surfaced with the new `autumn-canopy` colour map paired with a
 *    leaf-litter depth map (registered alongside the other procedural
 *    textures) so the leaf piles and exposed soil patches read as
 *    raised relief at glancing sun, a lakefront-grass apron along the
 *    west join and a pasture-grass apron along the south join, a
 *    grove of five maple trees each with three layered foliage clusters
 *    in crimson, amber and gold (different dominant tint per tree), a
 *    small wooden hunting lodge with board-and-batten siding, a peaked
 *    shingle roof, a brass-knob plank front door, a glowing square
 *    front window with cross muntin and a tall stone chimney trailing
 *    pale smoke wisps, a pair of moss-jacketed fallen logs lying at
 *    different yaws across the grove floor, a small stacked-stone
 *    cairn marking a clearing at the back of the grove and a scatter
 *    of windblown crimson / amber / gold leaf dabs across the ground.
 *  - Eighteenth pass — yard: a bronze knight sentinel statue on a
 *    fluted marble pedestal on the east lawn (the bronze armour reuses
 *    the existing `copper-patina` colour + bump pair so the verdigris
 *    mottling reads as crusted relief on the shoulder pauldrons, the
 *    breastplate and the rounded helm), and a raised wooden cold
 *    frame planted with three translucent glass cloche bell jars
 *    sheltering seedlings on the back lawn. House: a pair of carved
 *    Victorian bargeboards with pendant drop finials trimming the
 *    front and back gable rakes — each bargeboard a stepped scroll
 *    panel hugging the eave slope with three pendant finial drops
 *    below it and a small carved central medallion at the gable peak
 *    framing the finial drops. Scene: a northwest waterfall ravine
 *    plane tucked into the gap between the northwest woodland's north
 *    edge, the alpine foothills' west edge and the lakefront's west
 *    edge — a granite-toned ground surfaced with the new
 *    `granite-cliff` colour map paired with a fissure depth map
 *    (registered alongside the other procedural textures) so the
 *    bedding cracks and lichen patches read as raised relief at
 *    glancing sun, a woodland-grass apron along the south join, an
 *    alpine-moss apron along the north join and a lakefront-grass
 *    apron along the east join so the ground layer has no holes at
 *    any of the three seams, a tall four-slab stepped granite cliff
 *    face along the north edge, a tumbling three-tier waterfall
 *    cascading off the cliff into a fern-fringed plunge pool, a
 *    wooden plank footbridge crossing the outflow stream at the
 *    south end with rope railings on slim corner posts, three alpine
 *    pine trees clinging to the cliff rim and a scatter of five
 *    moss-capped boulders ringing the pool.
 *  - Nineteenth pass — yard: a Victorian cast-bronze cupid fountain on
 *    the back-southwest lawn — a tiered marble basin crowned by a slim
 *    cupid figure holding a terracotta flower vase aloft, with a thin
 *    water column trickling from the vase rim into an upper bowl and a
 *    wider sheet of water falling over the rim of the upper bowl into
 *    a lower tiered basin; the cupid body reuses the existing
 *    `copper-patina` colour + bump pair so the verdigris mottling
 *    reads as crusted relief on the wings and the slim limbs, and the
 *    tiered basins reuse the existing `marble` colour + bump pair so
 *    the rim seams read as veined relief on the stone. House: a pair
 *    of ornate cast-iron gable peak finials with copper-patina spires
 *    crowning the front and back gable ridges above the existing
 *    bargeboard medallions — each finial a slim tapered spire with a
 *    lobed medallion cap, four small ornamental lobes around an open
 *    ring, a mid-shaft bead, a tip ball and a slim arrow vane with a
 *    pennant flag at the tip (both reuse the existing `copper-patina`
 *    pair). Scene: a southwest sunflower field plane bridging the gap
 *    south of the wheat field's south edge and west of the south
 *    heath's west edge — a cultivated yellow-and-brown ground
 *    surfaced with the new `sunflower-field` colour map paired with a
 *    row depth map (registered alongside the other procedural
 *    textures) so the planting rows and seed clumps read as raised
 *    relief at glancing sun, a wheat-stubble apron along the north
 *    join and a heath-moss apron along the east join so the ground
 *    layer has no holes at either seam, six rows of tall sunflower
 *    plants (each a slim stem with two leaf clusters and a layered
 *    ray-petal bloom face around a dark seed centre with a brighter
 *    inner core), a small board-and-batten tool shed at the northwest
 *    corner with a peaked shingle roof and a sun-bleached plank door,
 *    a scatter of five rectangular straw bales between the rows and a
 *    slim stake-and-twine fence along the south edge.
 *  - Twentieth pass — yard: a Victorian ornamental iron birdcage aviary
 *    on a fluted marble plinth, parked on the southeast outside-fence
 *    lawn — a swelled domed cage built from a ring of vertical iron
 *    bars and three horizontal hoop rings holds a slender central
 *    perch with a small bright bird, the dome is crowned by a slim
 *    copper-patina finial spire, and the plinth carries a slim
 *    copper-patina trim ring at its cap. The iron cage and finial
 *    reuse the existing `copper-patina` colour + bump pair so the
 *    verdigris reads as crusted relief on the cast metal, and the
 *    plinth reuses the existing `marble` colour + bump pair so the
 *    stone reads with veined relief. House: a row of ornate Victorian
 *    iron ridge cresting pickets running along the main roof ridge
 *    between the front and back gable peaks — each picket a slim
 *    copper-patina spire on a scroll bracket with a mid-shaft bead
 *    and a spear-tip cap, with small ornamental scroll caps between
 *    adjacent pickets reading as the lacy filigree typical of cast-
 *    iron ridge cresting (the cresting reuses the existing
 *    `copper-patina` pair so the verdigris reads as crusted relief on
 *    the cast metal). Scene: a southeast citrus grove plane tucked
 *    into the gap south of the southeast vineyard and east of the
 *    south heath — a sun-baked terracotta-toned ground surfaced with
 *    the new `citrus-grove` colour map paired with a pebble depth map
 *    (registered alongside the other procedural textures) so the
 *    fallen-fruit dabs and pale pebbles read as raised relief at
 *    glancing sun, a vineyard-soil apron along the north join and a
 *    heath-moss apron along the west join so the ground layer has no
 *    holes at either seam, a small grove of six citrus trees (three
 *    lemon and three orange in alternating rows) with bright yellow
 *    and orange fruit dabs in their crowns and windfalls scattered at
 *    their bases, a small stone-walled juice press shed at the
 *    southeast corner with a peaked terracotta-tile roof and a tiny
 *    round east window, a focal weathered wooden produce crate
 *    brimming with ripe citrus near the north-west gate apron and a
 *    low dry-stone retaining wall running along the south and east
 *    edges of the grove with a doll-width gap near the south-west
 *    corner for the doll to step through.
 *  - Twenty-first pass — courtyard: a whimsical Victorian carousel
 *    horse ornament on a fluted marble pedestal, parked on the
 *    back-west outside-fence lawn between the glider and the back
 *    meadow. The horse is a stylised prancing piece with a swirling
 *    copper-patina pole running through its back (reusing the existing
 *    `copper-patina` colour + bump pair so the verdigris reads as
 *    crusted relief on the brass pole, bridle studs and tassel rings),
 *    a cream body with a flowing rose-pink mane and tail, a gilt-trimmed
 *    rose saddle blanket, four legs in a prancing pose and the marble
 *    plinth reuses the existing `marble` colour + bump pair so the
 *    stone reads with veined relief. House: a pair of decorative bay
 *    windows projecting from the east and west side walls of the lower
 *    storey — each bay a small three-sided box bump (front + two
 *    angled sides) with a slim peaked shingle hood, a white painted
 *    trim sash framing tinted glass panes, a slim white sill below
 *    the panes and a terracotta flower box on the sill carrying a
 *    row of pink bloom dabs. Scene: a far-east desert oasis plane
 *    tucked beyond the southeast olive grove's east edge — a sun-baked
 *    sand ground surfaced with the new `desert-sand` colour map paired
 *    with a dune-and-pebble depth map (registered alongside the other
 *    procedural textures) so the dune crests and scattered pebbles
 *    read as raised relief at glancing sun, an olive-grove apron
 *    along the west join so the ground layer has no holes, three
 *    date palm trees with broad frond crowns and pendant date
 *    clusters, a small mud-brick caravanserai (adobe inn) at the
 *    southeast corner with a flat sun-baked roof, round wooden
 *    beam ends protruding from the upper walls and an arched front
 *    entrance, a focal sandstone obelisk pillar with a pyramidal
 *    cap and a hieroglyphic relief band on its shaft, a resting
 *    camel statue with a red saddle blanket and gold tassels and a
 *    scatter of low dune mounds rolling across the sand.
 *  - Twenty-second pass — courtyard: a Victorian wrought-iron flagpole
 *    stand with a striped triangular pennant flag on a fluted marble
 *    base, parked on the front-west outside-gate apron just beyond the
 *    picket fence. The pole, halyard ring and finial ball reuse the
 *    existing `copper-patina` colour + bump pair so the verdigris reads
 *    as crusted relief on the cast metal, the plinth reuses the existing
 *    `marble` colour + bump pair so the stone reads with veined relief,
 *    and the pennant flag carries a slim cream-and-rose stripe pattern
 *    fluttering off to the east. House: a pair of small Victorian copper
 *    sunburst rosettes mounted on the front and back gable faces above
 *    the existing oculus windows — each rosette a slim central marble
 *    disc surrounded by twelve copper-patina rays radiating outward in
 *    an alternating long/short pattern, with a small central boss
 *    covering the ray junction (the rays and boss reuse the existing
 *    `copper-patina` pair and the central disc reuses the existing
 *    `marble` pair). Scene: a far-southwest peat-bog moor plane south
 *    of the lavender field bridging the gap between the lavender field's
 *    south edge and the wheat field's west edge — a moss-toned ground
 *    surfaced with the new `peat-moor` colour map paired with a turf-cut
 *    depth map (registered alongside the other procedural textures) so
 *    the peat-cut blocks and dark pools read as raised relief at
 *    glancing sun, a lavender-grass apron along the north join and a
 *    wheat-stubble apron along the east join so the ground layer has
 *    no holes at either seam, a small stone crofter's cottage at the
 *    south corner with a fieldstone wall, a thatched pitched roof, a
 *    slim chimney trailing pale smoke and a glowing square front window,
 *    a stack of three rectangular peat-cuttings on a slate platform, a
 *    winding burn (small stream) crossed by a slim wooden plank
 *    footbridge with rope rails, a scatter of seven heather tufts in
 *    three bloom tints and a small tor of three mossy granite boulders
 *    at the west edge framing the burn's source.
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
    // Eleventh-pass keep-outs — pizza oven, potting bench and garden chess set.
    { x: PIZZA_OVEN_POS[0], z: PIZZA_OVEN_POS[2], r: 1.6 },
    { x: POTTING_BENCH_POS[0], z: POTTING_BENCH_POS[2], r: 1.4 },
    { x: CHESS_GARDEN_POS[0], z: CHESS_GARDEN_POS[2], r: 1.4 },
    // Twelfth-pass keep-out — the lean-to greenhouse on the back lawn.
    { x: GREENHOUSE_POS[0], z: GREENHOUSE_POS[2], r: 1.4 },
    // Thirteenth-pass keep-outs — rose pergola and dovecote tower.
    { x: ROSE_PERGOLA_POS[0], z: ROSE_PERGOLA_POS[2], r: 1.6 },
    { x: DOVECOTE_POS[0], z: DOVECOTE_POS[2], r: 0.8 },
    // Fourteenth-pass keep-outs — Victorian glider and armillary sphere.
    { x: GLIDER_POS[0], z: GLIDER_POS[2], r: 1.5 },
    { x: ARMILLARY_POS[0], z: ARMILLARY_POS[2], r: 0.9 },
    // Fifteenth-pass keep-outs — Adirondack pair and cascade urn.
    { x: ADIRONDACK_PAIR_POS[0], z: ADIRONDACK_PAIR_POS[2], r: 1.6 },
    { x: CASCADE_URN_POS[0], z: CASCADE_URN_POS[2], r: 0.9 },
    // Sixteenth-pass keep-outs — gazing ball and cherub statue.
    { x: GAZING_BALL_POS[0], z: GAZING_BALL_POS[2], r: 0.8 },
    { x: CHERUB_STATUE_POS[0], z: CHERUB_STATUE_POS[2], r: 0.8 },
    // Seventeenth-pass keep-outs — tea table set and the pair of owl
    // sentinels flanking the cobble path near the gate.
    { x: TEA_TABLE_POS[0], z: TEA_TABLE_POS[2], r: 1.6 },
    { x: OWL_L_POS[0], z: OWL_L_POS[2], r: 0.7 },
    { x: OWL_R_POS[0], z: OWL_R_POS[2], r: 0.7 },
    // Eighteenth-pass keep-outs — bronze knight statue and glass cloche bed.
    { x: KNIGHT_STATUE_POS[0], z: KNIGHT_STATUE_POS[2], r: 0.8 },
    { x: CLOCHE_BED_POS[0], z: CLOCHE_BED_POS[2], r: 1.2 },
    // Nineteenth-pass keep-out — cupid fountain on the back-southwest lawn.
    { x: CUPID_FOUNTAIN_POS[0], z: CUPID_FOUNTAIN_POS[2], r: 1.3 },
    // Twentieth-pass keep-out — Victorian iron birdcage aviary on the east lawn.
    { x: AVIARY_POS[0], z: AVIARY_POS[2], r: 1.0 },
    // Twenty-first-pass keep-out — carousel horse on the back-west outside-fence lawn.
    { x: CAROUSEL_HORSE_POS[0], z: CAROUSEL_HORSE_POS[2], r: 1.1 },
    // Twenty-second-pass keep-out — flagpole stand on the front-west outside-gate apron.
    { x: FLAGPOLE_POS[0], z: FLAGPOLE_POS[2], r: 1.0 },
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
    buildPizzaOven(f, PIZZA_OVEN_POS),
    buildPottingBench(f, POTTING_BENCH_POS),
    buildGardenChess(f, CHESS_GARDEN_POS),
    buildGreenhouse(f, GREENHOUSE_POS),
    buildRosePergola(f, ROSE_PERGOLA_POS),
    buildDovecote(f, DOVECOTE_POS),
    buildVictorianGlider(f, GLIDER_POS),
    buildArmillarySphere(f, ARMILLARY_POS),
    buildAdirondackPair(f, ADIRONDACK_PAIR_POS),
    buildCascadeUrn(f, CASCADE_URN_POS),
    buildGazingBall(f, GAZING_BALL_POS),
    buildCherubStatue(f, CHERUB_STATUE_POS),
    buildVictorianTeaSet(f, TEA_TABLE_POS),
    buildOwlSentinels(f),
    buildKnightStatue(f, KNIGHT_STATUE_POS),
    buildGlassCloches(f, CLOCHE_BED_POS),
    buildCupidFountain(f, CUPID_FOUNTAIN_POS),
    buildBirdcageAviary(f, AVIARY_POS),
    buildCarouselHorse(f, CAROUSEL_HORSE_POS),
    buildFlagpoleStand(f, FLAGPOLE_POS),
  ]);
  const meadow = buildBackMeadow(f);
  const orchard = buildSideOrchard(f);
  const pondGarden = buildWestPondGarden(f);
  const lakefront = buildNorthLakefront(f);
  const heath = buildSouthHeath(f);
  const nePasture = buildNortheastPasture(f);
  const wheatField = buildSouthwestWheatField(f);
  const nwWoodland = buildNorthwestWoodland(f);
  const seVineyard = buildSoutheastVineyard(f);
  const oliveGrove = buildSoutheastOliveGrove(f);
  const lavenderField = buildSouthwestLavenderField(f);
  const alpineFoothills = buildAlpineFoothills(f);
  const neMapleGrove = buildNortheastMapleGrove(f);
  const nwRavine = buildNorthwestWaterfallRavine(f);
  const swSunflowerField = buildSouthwestSunflowerField(f);
  const seCitrusGrove = buildSoutheastCitrusGrove(f);
  const feDesertOasis = buildFarEastDesertOasis(f);
  const fswPeatMoor = buildFarSouthwestPeatMoor(f);
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
    buildPorchWisteria(f),
    buildEaveCorbels(f),
    buildRoofCupola(f, CUPOLA_POS),
    buildGableOculi(f),
    buildFrontDoorFittings(f),
    buildSideTrellises(f),
    buildFanlight(f, FANLIGHT_POS),
    buildGableBargeboards(f),
    buildGablePeakFinials(f),
    buildIronRidgeCresting(f),
    buildSideBayWindows(f),
    buildGableSunbursts(f),
  ]);
  const root: SceneNode = {
    id: "dh-root",
    name: "Dollhouse",
    kind: "group",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    children: [
      garden,
      meadow,
      orchard,
      pondGarden,
      lakefront,
      heath,
      nePasture,
      wheatField,
      nwWoodland,
      seVineyard,
      oliveGrove,
      lavenderField,
      alpineFoothills,
      neMapleGrove,
      nwRavine,
      swSunflowerField,
      seCitrusGrove,
      feDesertOasis,
      fswPeatMoor,
      house,
    ],
  };
  return {
    schemaVersion: DOLLHOUSE_SCHEMA_VERSION,
    kind: "dollhouse",
    root,
    metadata: { name: "Pink Victorian Dollhouse" },
  };
}
