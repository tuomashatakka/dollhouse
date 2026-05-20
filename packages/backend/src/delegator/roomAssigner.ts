import { ALL_ROOM_IDS, ROOM_COORDS, type RoomId } from "@dollhouse/shared";

/**
 * Pick a room for a subtask based on keyword heuristics.
 * Returns a fallback (workshop) if nothing matches — never throws.
 */
export function inferRoom(subtask: string): RoomId {
  const lower = subtask.toLowerCase();
  for (const id of ALL_ROOM_IDS) {
    if (id === "spawnPoint") continue;
    const def = ROOM_COORDS[id];
    if (def.kinds.some((k) => lower.includes(k))) return id;
  }
  return "workshop";
}

/** Validate an LLM-provided room or coerce it via inferRoom(). */
export function validateRoom(maybeRoom: unknown, subtaskFallback: string): RoomId {
  if (typeof maybeRoom === "string" && maybeRoom in ROOM_COORDS) {
    return maybeRoom as RoomId;
  }
  return inferRoom(subtaskFallback);
}
