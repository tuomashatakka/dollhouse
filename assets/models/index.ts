// Enhanced dollhouse model — a snapshot imported from
// packages/editor/src/presets/, with incrementally enhanced meshes for the
// house and its courtyard, layered over three enhancement passes.
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
export { NodeFactory, mulberry32 } from "./builder.js";
export {
  bakeBufferGeometry,
  buildFloorWithHoles,
  buildLowPolyTree,
  buildWallWithDoors,
} from "./geometryHelpers.js";
export { buildDollhouseDocument } from "./dollhouse.js";
