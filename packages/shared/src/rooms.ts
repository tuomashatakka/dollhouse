// World coordinates for each room in the procedural dollhouse.
// Coordinate system: +X right, +Y up, +Z toward camera (cross-section is at Z=0).
// The dollhouse is roughly 8 wide x 9 tall x 2 deep (units = meters).

export type RoomId =
  | "bedroom"        // floor 2 left
  | "nursery"        // floor 2 right (with balcony)
  | "living"         // floor 1 left
  | "studio"         // floor 1 right — UI/frontend work
  | "kitchen"        // floor 0 left — refactor/cleanup
  | "bathroom"       // floor 0 center — debug/tests scratch
  | "workshop"       // floor 0 right — backend/server/db work
  | "library"        // floor 1 center back — docs work
  | "spawnPoint";    // ground level outside, where dolls appear

export interface RoomDef {
  id: RoomId;
  label: string;
  /** World position the doll walks to (floor center, facing camera). */
  position: readonly [number, number, number];
  /** Optional kind hint used by the heuristic delegator. */
  kinds: readonly string[];
}

export const ROOM_COORDS: Record<RoomId, RoomDef> = {
  spawnPoint: {
    id: "spawnPoint",
    label: "Front Yard",
    position: [0, 0.1, 2.6],
    kinds: ["spawn"],
  },
  kitchen: {
    id: "kitchen",
    label: "Kitchen",
    position: [-2.2, 0.05, 0.4],
    kinds: ["refactor", "cleanup", "format"],
  },
  bathroom: {
    id: "bathroom",
    label: "Bathroom",
    position: [0, 0.05, 0.4],
    kinds: ["test", "debug", "fixture"],
  },
  workshop: {
    id: "workshop",
    label: "Workshop",
    position: [2.2, 0.05, 0.4],
    kinds: ["api", "backend", "server", "db", "infra"],
  },
  living: {
    id: "living",
    label: "Living Room",
    position: [-2.2, 2.55, 0.4],
    kinds: ["product", "spec", "planning"],
  },
  library: {
    id: "library",
    label: "Library",
    position: [0, 2.55, -0.4],
    kinds: ["docs", "readme", "writing"],
  },
  studio: {
    id: "studio",
    label: "Studio",
    position: [2.2, 2.55, 0.4],
    kinds: ["ui", "frontend", "component", "design", "css"],
  },
  bedroom: {
    id: "bedroom",
    label: "Bedroom",
    position: [-2.2, 5.05, 0.4],
    kinds: ["idle", "rest"],
  },
  nursery: {
    id: "nursery",
    label: "Nursery",
    position: [2.2, 5.05, 0.4],
    kinds: ["experiment", "prototype", "sandbox"],
  },
} as const;

export const ALL_ROOM_IDS = Object.keys(ROOM_COORDS) as RoomId[];
