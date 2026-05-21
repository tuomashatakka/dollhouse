import {
  DOLLHOUSE_SCHEMA_VERSION,
  type DollhouseDocument,
  type GeometryDef,
  type MaterialDef,
  type SceneNode,
  type Transform,
} from "../model/index.js";
import { NodeFactory } from "./builder.js";

// World layout (x = left/right, y = up, z = depth):
//   width 7 (x: -3.5..3.5), depth 2 (z: -1..1), height 7.5 (y: 0..7.5)
//   front wall (z = +1) is OMITTED — cross-section faces +Z (the camera).
const W = 7;
const D = 2;
const FLOOR_H = 2.5;
const WALL_T = 0.12;
const BACK_Z = -D / 2;

/** Pink Victorian palette — mirrors the frontend's reference asset. */
const C = {
  exteriorPink: "#f1aac4",
  wallPinkLight: "#f7c6d9",
  wallPinkInterior: "#fde0ec",
  trim: "#e89bb5",
  roofRose: "#e07ba0",
  roofShingle: "#c95f88",
  walnut: "#5a3a26",
  floorWalnut: "#5a3a26",
  floorTileLight: "#fbe4ec",
  floorTileDark: "#d98ab1",
  white: "#fafafa",
  cream: "#fff5ec",
  glass: "#bcd9e8",
  wallpaperTeal: "#3f7780",
  accentMint: "#9ed6c9",
  accentLavender: "#c3aee0",
  bedSpread: "#f6c3d0",
  ground: "#dec6d9",
} as const;

const std = (color: string, roughness = 0.7): MaterialDef => ({ color, roughness });
const box = (width: number, height: number, depth: number): GeometryDef => ({
  type: "box",
  width,
  height,
  depth,
});
const plane = (width: number, height: number): GeometryDef => ({ type: "plane", width, height });

/* ───────────────────────── ground ───────────────────────── */

function buildGround(f: NodeFactory): SceneNode {
  return f.mesh(
    "Lawn",
    plane(28, 16),
    std(C.ground, 0.95),
    { position: [0, -0.01, 1], rotation: [-Math.PI / 2, 0, 0] },
    { receiveShadow: true },
  );
}

/* ───────────────────────── back wall ───────────────────────── */

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
      f.mesh("Frame", box(w + 0.06, h + 0.06, 0.02), std(C.walnut), {}, { castShadow: true }),
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

function buildBackWall(f: NodeFactory): SceneNode {
  return f.group("Back Wall", [
    f.mesh(
      "Back Panel",
      box(W, FLOOR_H * 3, WALL_T),
      std(C.wallPinkInterior, 0.85),
      { position: [0, FLOOR_H * 1.5, BACK_Z] },
      { castShadow: true, receiveShadow: true },
    ),
    f.mesh("Back Trim", box(W + 0.2, 0.12, WALL_T), std(C.trim), {
      position: [0, FLOOR_H * 3 - 0.05, BACK_Z - WALL_T / 2 - 0.005],
    }),
    buildPicture(f, -2.4, 1.3, 0.7, 0.5, C.accentLavender),
    buildPicture(f, -1.5, 1.4, 0.5, 0.4, C.accentMint),
    buildPicture(f, -2.4, 3.8, 0.9, 0.6, C.wallpaperTeal),
    buildWindow(f, 2.3, 1.3),
    buildWindow(f, 2.3, 3.8),
    buildWindow(f, 2.3, 6.3),
  ]);
}

/* ───────────────────────── side walls ───────────────────────── */

function buildSideWalls(f: NodeFactory): SceneNode {
  const wall = (name: string, x: number) =>
    f.mesh(
      name,
      box(WALL_T, FLOOR_H * 3, D),
      std(C.exteriorPink, 0.8),
      { position: [x, FLOOR_H * 1.5, 0] },
      { castShadow: true, receiveShadow: true },
    );
  return f.group("Side Walls", [wall("Left Wall", -W / 2), wall("Right Wall", W / 2)]);
}

/* ───────────────────────── floors ───────────────────────── */

function buildTiledFloor(
  f: NodeFactory,
  name: string,
  y: number,
  colorA: string,
  colorB: string,
): SceneNode {
  const cols = 14;
  const rows = 4;
  const tw = (W - WALL_T * 2) / cols;
  const td = (D - WALL_T * 2) / rows;
  const tiles: SceneNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push(
        f.mesh(
          `Tile ${r}-${c}`,
          plane(tw * 0.95, td * 0.95),
          std((r + c) % 2 === 0 ? colorA : colorB, 0.55),
          {
            position: [
              -W / 2 + WALL_T + tw / 2 + c * tw,
              y + 0.002,
              -D / 2 + WALL_T + td / 2 + r * td,
            ],
            rotation: [-Math.PI / 2, 0, 0],
          },
          { receiveShadow: true },
        ),
      );
    }
  }
  return f.group(name, tiles);
}

function buildFloors(f: NodeFactory): SceneNode {
  return f.group("Floors", [
    buildTiledFloor(f, "Ground Floor", 0, C.floorTileLight, C.floorTileDark),
    f.mesh(
      "Mid Floor",
      plane(W - WALL_T * 2, D - WALL_T * 2),
      std(C.floorWalnut, 0.7),
      { position: [0, FLOOR_H + 0.001, 0], rotation: [-Math.PI / 2, 0, 0] },
      { receiveShadow: true },
    ),
    buildTiledFloor(f, "Top Floor", FLOOR_H * 2, C.wallPinkLight, C.bedSpread),
  ]);
}

/* ─────────────────── room dividers (interior walls) ─────────────────── */

function buildRoomDividers(f: NodeFactory): SceneNode {
  const levels: SceneNode[] = [];
  [0, FLOOR_H, FLOOR_H * 2].forEach((y, i) => {
    const parts: SceneNode[] = [
      f.mesh(
        "Left Divider",
        box(WALL_T, FLOOR_H, D * 0.5),
        std(C.wallPinkInterior),
        { position: [-1.2, y + FLOOR_H / 2, -0.25] },
        { castShadow: true, receiveShadow: true },
      ),
      f.mesh(
        "Right Divider",
        box(WALL_T, FLOOR_H, D * 0.5),
        std(C.wallPinkInterior),
        { position: [1.2, y + FLOOR_H / 2, -0.25] },
        { castShadow: true, receiveShadow: true },
      ),
    ];
    if (i < 2) {
      parts.push(
        f.mesh(
          "Ceiling",
          box(W - WALL_T * 2, 0.04, D - WALL_T * 2),
          std(C.wallPinkInterior),
          { position: [0, y + FLOOR_H - 0.02, 0] },
          { receiveShadow: true },
        ),
      );
    }
    levels.push(f.group(`Level ${i + 1} Dividers`, parts));
  });
  return f.group("Room Dividers", levels);
}

/* ───────────────────────── stairs ───────────────────────── */

function buildStairs(f: NodeFactory): SceneNode {
  const steps = 8;
  const stepH = FLOOR_H / steps;
  const stepD = 0.18;
  const flights: SceneNode[] = [];
  [0, FLOOR_H].forEach((baseY, floor) => {
    const parts: SceneNode[] = [];
    for (let i = 0; i < steps; i++) {
      parts.push(
        f.mesh(
          `Step ${i + 1}`,
          box(0.8, stepH, stepD * 1.05),
          std(C.white, 0.7),
          { position: [2.95, baseY + stepH * (i + 0.5), 0.55 - i * stepD] },
          { castShadow: true, receiveShadow: true },
        ),
      );
    }
    parts.push(
      f.mesh(
        "Railing",
        box(0.04, 0.04, steps * stepD * 1.05),
        std(C.white),
        {
          position: [2.6, baseY + FLOOR_H / 2 + 0.2, 0.1],
          rotation: [Math.atan2(FLOOR_H, steps * stepD), 0, 0],
        },
        { castShadow: true },
      ),
    );
    flights.push(f.group(`Stair Flight ${floor + 1}`, parts));
  });
  return f.group("Stairs", flights);
}

/* ───────────────────────── roof ───────────────────────── */

function buildRoof(f: NodeFactory): SceneNode {
  const roofH = 2;
  const roofTop = FLOOR_H * 3;
  const slope = Math.atan2(roofH, W / 2 + 0.4);
  const hyp = Math.hypot(roofH, W / 2 + 0.4);

  const pitches: SceneNode[] = [];
  ([-1, 1] as const).forEach((side) => {
    const cols = 14;
    const rows = 6;
    const depth = D + 0.6;
    const sw = (hyp / cols) * 1.1;
    const sd = (depth / rows) * 1.05;
    const instances: Transform[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offset = r % 2 === 0 ? 0 : sw / 2;
        instances.push({
          position: [
            -hyp / 2 + sw / 2 + c * sw + offset,
            0.07,
            -depth / 2 + sd / 2 + r * sd,
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
            box(hyp, 0.12, depth),
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

  const gable = f.mesh(
    "Gable",
    {
      type: "buffer",
      attributes: {
        position: [
          -(W / 2 + 0.3), -roofH / 2, 0,
          W / 2 + 0.3, -roofH / 2, 0,
          0, roofH / 2 + 0.05, 0,
        ],
        normal: [0, 0, -1, 0, 0, -1, 0, 0, -1],
      },
    },
    { color: C.exteriorPink, roughness: 0.7, side: "double" },
    { position: [0, roofH / 2, BACK_Z - 0.02] },
    { castShadow: true },
  );

  return f.group("Roof", [...pitches, gable], { position: [0, roofTop, 0] });
}

/* ───────────────────────── balcony rail ───────────────────────── */

function buildBalconyRail(f: NodeFactory): SceneNode {
  const posts: SceneNode[] = [];
  let idx = 0;
  for (let x = 0.2; x <= 3.2; x += 0.18) {
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
    { position: [0, FLOOR_H * 2 + 0.55, 0.95] },
  );
}

/* ───────────────────────── front porch ───────────────────────── */

function buildFrontPorch(f: NodeFactory): SceneNode {
  return f.mesh(
    "Front Porch",
    box(W + 0.4, 0.08, 0.8),
    std(C.trim),
    { position: [0, 0.04, 1.4] },
    { receiveShadow: true },
  );
}

/* ───────────────────────── furniture ───────────────────────── */

function buildFurniture(f: NodeFactory): SceneNode {
  const item = (
    name: string,
    pos: [number, number, number],
    size: [number, number, number],
    color: string,
  ): SceneNode =>
    f.mesh(name, box(size[0], size[1], size[2]), std(color), { position: pos }, {
      castShadow: true,
      receiveShadow: true,
    });

  return f.group("Furniture", [
    item("Kitchen Counter", [-2.6, 0.45, -0.5], [1.3, 0.9, 0.4], C.white),
    item("Kitchen Stove", [-1.6, 0.35, -0.5], [0.4, 0.7, 0.4], C.walnut),
    item("Bathtub", [0, 0.18, 0.2], [0.9, 0.35, 0.5], C.white),
    item("Bath Water", [0, 0.25, 0.2], [0.75, 0.25, 0.35], C.wallPinkLight),
    item("Workbench", [2.4, 0.45, -0.5], [1.0, 0.9, 0.45], C.walnut),
    item("Sofa Base", [-2.4, FLOOR_H + 0.35, 0.0], [1.4, 0.6, 0.55], C.accentMint),
    item("Sofa Back", [-2.4, FLOOR_H + 0.65, -0.25], [1.4, 0.55, 0.18], C.accentMint),
    item("Bookcase", [0, FLOOR_H + 0.9, -0.78], [1.2, 1.5, 0.2], C.walnut),
    item("Bookshelf Upper", [0, FLOOR_H + 1.1, -0.7], [1.0, 0.05, 0.18], C.cream),
    item("Bookshelf Lower", [0, FLOOR_H + 0.7, -0.7], [1.0, 0.05, 0.18], C.cream),
    item("Desk Top", [2.4, FLOOR_H + 0.4, -0.4], [1.0, 0.05, 0.5], C.walnut),
    item("Desk Leg", [2.4, FLOOR_H + 0.2, -0.4], [1.0, 0.4, 0.05], C.walnut),
    item("Monitor Arm", [2.4, FLOOR_H + 0.7, -0.6], [0.55, 0.4, 0.04], C.walnut),
    item("Monitor Screen", [2.4, FLOOR_H + 0.7, -0.58], [0.5, 0.35, 0.01], C.wallpaperTeal),
    item("Bed Frame", [-2.4, FLOOR_H * 2 + 0.25, 0.2], [1.6, 0.45, 0.9], C.walnut),
    item("Bed Spread", [-2.4, FLOOR_H * 2 + 0.55, 0.2], [1.55, 0.15, 0.85], C.bedSpread),
    item("Headboard", [-2.95, FLOOR_H * 2 + 0.6, 0.2], [0.05, 0.4, 0.85], C.walnut),
    item("Crib", [2.4, FLOOR_H * 2 + 0.35, 0.0], [1.0, 0.55, 0.7], C.white),
    item("Crib Mattress", [2.4, FLOOR_H * 2 + 0.45, 0.0], [0.95, 0.1, 0.65], C.bedSpread),
  ]);
}

/* ───────────────────────── document ───────────────────────── */

/**
 * Build the default dollhouse document — a faithful data port of the previously
 * hardcoded procedural `Dollhouse` component. Deterministic: the same ids are
 * produced on every call.
 */
export function buildDollhouseDocument(): DollhouseDocument {
  const f = new NodeFactory("dh");
  const root: SceneNode = {
    id: "dh-root",
    name: "Dollhouse",
    kind: "group",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    children: [
      buildGround(f),
      buildBackWall(f),
      buildSideWalls(f),
      buildFloors(f),
      buildRoomDividers(f),
      buildFurniture(f),
      buildStairs(f),
      buildRoof(f),
      buildBalconyRail(f),
      buildFrontPorch(f),
    ],
  };
  return {
    schemaVersion: DOLLHOUSE_SCHEMA_VERSION,
    kind: "dollhouse",
    root,
    metadata: { name: "Pink Victorian Dollhouse" },
  };
}
