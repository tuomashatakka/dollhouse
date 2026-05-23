// Enhanced dollhouse model — a snapshot imported from
// packages/editor/src/presets/, with incrementally enhanced meshes for the
// house and its courtyard, layered over three enhancement passes.
//   Pass 1 — courtyard: flower beds, path hedges, a slatted bench, a stone
//   bird bath, a lamp post and a picket garden gate; house: a brick chimney,
//   window dressing (shutters + flower boxes) and a tiled roof ridge.
//   Pass 2 — courtyard: an ornamental lily pond, a rose trellis arch and a
//   wheelbarrow; house: a porch canopy, door lanterns, a rooftop weather vane
//   and stone corner quoins.
//   Pass 3 — courtyard: a stone wishing well, a sundial, a fenced vegetable
//   patch and a hanging garden swing; house: a stone foundation skirt, copper
//   rain gutters with corner downspouts, two pitched dormer windows and
//   climbing ivy on the left side wall.
export { NodeFactory, mulberry32 } from "./builder.js";
export {
  bakeBufferGeometry,
  buildFloorWithHoles,
  buildLowPolyTree,
  buildWallWithDoors,
} from "./geometryHelpers.js";
export { buildDollhouseDocument } from "./dollhouse.js";
