// Local transform primitives shared by every scene node.

/** A 3-component vector — a position, an XYZ Euler rotation, or a scale. */
export type Vec3 = readonly [number, number, number];

/** Local transform of a scene node, relative to its parent. */
export interface Transform {
  /** Local position in metres. */
  position: Vec3;
  /** Local rotation as an XYZ Euler triple, in radians. */
  rotation: Vec3;
  /** Local scale multiplier per axis. */
  scale: Vec3;
}

/** Identity transform — no translation, rotation, or scaling. */
export const IDENTITY_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

/** Build a {@link Transform}, filling any omitted channel with identity. */
export function makeTransform(partial: Partial<Transform> = {}): Transform {
  return {
    position: partial.position ?? [0, 0, 0],
    rotation: partial.rotation ?? [0, 0, 0],
    scale: partial.scale ?? [1, 1, 1],
  };
}

/** Copy a {@link Vec3} into a fresh tuple. */
export function cloneVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

/** Deep-copy a {@link Transform}. */
export function cloneTransform(t: Transform): Transform {
  return {
    position: cloneVec3(t.position),
    rotation: cloneVec3(t.rotation),
    scale: cloneVec3(t.scale),
  };
}
