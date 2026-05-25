// Enhanced dollhouse model — a snapshot imported from
// packages/editor/src/presets/, with incrementally enhanced meshes for the
// house and its courtyard, layered over five enhancement passes.
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
export { NodeFactory, mulberry32 } from "./builder.js";
export {
  bakeBufferGeometry,
  buildFloorWithHoles,
  buildLowPolyTree,
  buildWallWithDoors,
} from "./geometryHelpers.js";
export { buildDollhouseDocument } from "./dollhouse.js";
