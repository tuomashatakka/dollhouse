// Enhanced dollhouse model — a snapshot imported from
// packages/editor/src/presets/, with incrementally enhanced meshes for the
// house and its courtyard, layered over two enhancement passes.
//   Pass 1 — courtyard: flower beds, path hedges, a slatted bench, a stone
//   bird bath, a lamp post and a picket garden gate; house: a brick chimney,
//   window dressing (shutters + flower boxes) and a tiled roof ridge.
//   Pass 2 — courtyard: an ornamental lily pond, a rose trellis arch and a
//   wheelbarrow; house: a porch canopy, door lanterns, a rooftop weather vane
//   and stone corner quoins.
export { NodeFactory, mulberry32 } from "./builder.js";
export {
  bakeBufferGeometry,
  buildFloorWithHoles,
  buildLowPolyTree,
  buildWallWithDoors,
} from "./geometryHelpers.js";
export { buildDollhouseDocument } from "./dollhouse.js";
