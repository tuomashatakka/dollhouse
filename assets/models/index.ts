// Enhanced dollhouse model — a snapshot imported from
// packages/editor/src/presets/, with incrementally enhanced meshes for the
// house and its courtyard, layered over eight enhancement passes.
//   Pass 1 — courtyard: flower beds, path hedges, a slatted bench, a stone
//   bird bath, a lamp post and a picket garden gate; house: a brick chimney,
//   window dressing (shutters + flower boxes) and a tiled roof ridge.
//   Pass 2 — courtyard: an ornamental lily pond, a rose trellis arch and a
//   wheelbarrow; house: a porch canopy, door lanterns, a rooftop weather vane
//   and stone corner quoins.
//   Pass 3 — courtyard: a raised vegetable plot, a garden gnome, a red-flag
//   mailbox at the gate, a shepherd's-hook bird feeder and stepping stones to
//   the bird bath; house: copper downspouts on the front corners, a stone
//   front step with a jute welcome mat and terracotta urns with topiary balls
//   flanking the door.
//   Pass 4 — courtyard: a stone sundial with a bronze gnomon, solar stake
//   lights along the cobble path, a cottage birdhouse on a pole and festoon
//   bulbs strung along the rose-arch crown; house: climbing ivy creeping up
//   the chimney's south and east faces and a wrought-iron lightning rod on
//   the chimney crown.
//   Pass 5 — courtyard: a board-and-batten garden shed with a pitched
//   shingle roof, a stacked firewood pile beside it, an A-frame garden
//   swing and a clothesline strung with three pieces of laundry; house:
//   copper half-round eaves gutters and white porch railings flanking the
//   front step; scene: a back-meadow ground plane that extends the scene
//   beyond the rear fence, with a rolling hill, a brook crossed by a
//   wooden footbridge, scattered wildflowers, meadow trees and a perimeter
//   post-and-rail fence.
//   Pass 6 — courtyard: a burlap-headed scarecrow with a crow on its
//   crossarm, a five-pumpkin patch, a parasol-shaded bistro patio set
//   with two chairs, and a coiled garden hose on a wall reel with a
//   brass spigot; house: a pair of cascading hanging flower baskets on
//   the porch canopy and a pine-needle wreath on the front door; scene:
//   a side-orchard ground plane east of the lawn with a dry-stone wall,
//   a grove of fruiting apple trees with windfall apples, gentle earth
//   mounds, an old hay cart and a stone water well with a peaked
//   shingle roof and a winched bucket.
//   Pass 7 — courtyard: a round stone fire pit with crossed logs,
//   glowing embers and three log-round stools, a hexagonal cottage
//   gazebo with a shingled dome and a curved interior bench, and a
//   pair of slatted compost bins with a leaning pitchfork; house:
//   a formal topiary edging of clipped hedge balls along the cobble
//   path from porch to gate, and striped canvas awnings over the
//   upper-storey back-wall windows; scene: a Japanese-style west
//   pond garden plane with a koi pond, an arched stone bridge,
//   stone lanterns, weeping willows and moss-flecked boulders.
//   Pass 8 — courtyard: a rustic picnic table with a red-checkered
//   tablecloth and matching slatted benches, a three-tier cascading
//   stone fountain on the south lawn and an A-frame tool rack of
//   leaning garden implements with a galvanised bucket beside the
//   back-corner shed; house: a strand of warm bistro string lights
//   running along the front roof eave from porch to weather vane;
//   scene: a north lakefront plane stretching beyond the back
//   meadow's far edge, carrying an open lake with deep / shallow
//   layers and drift highlights, a wooden plank pier on stout posts
//   with a lake-end lantern and a mooring cleat, a moored rowboat
//   with oars and a painter, cattail fringes along the shoreline,
//   a grove of lakeside conifers and a red-and-white channel buoy
//   with a tiny pennant flag.
export { NodeFactory, mulberry32 } from "./builder.js";
export {
  bakeBufferGeometry,
  buildFloorWithHoles,
  buildLowPolyTree,
  buildWallWithDoors,
} from "./geometryHelpers.js";
export { buildDollhouseDocument } from "./dollhouse.js";
