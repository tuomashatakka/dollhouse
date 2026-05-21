import * as THREE from "three";
import type { SceneNode, Transform, Vec3 } from "@dollhouse/shared";

/** Generate a stable unique id for a freshly created node. */
export function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `n-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
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

/** Depth-first search for a node by id. */
export function findNode(root: SceneNode, id: string): SceneNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Find the parent of `id`, or null when `id` is the root or missing. */
export function findParent(root: SceneNode, id: string): SceneNode | null {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

/** Path of nodes from root to `id`, inclusive. Empty when `id` is not found. */
export function getPath(root: SceneNode, id: string): SceneNode[] {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const sub = getPath(child, id);
    if (sub.length > 0) return [root, ...sub];
  }
  return [];
}

/** Visit every node in the subtree depth-first. */
export function walk(
  node: SceneNode,
  visit: (node: SceneNode, parent: SceneNode | null) => void,
  parent: SceneNode | null = null,
): void {
  visit(node, parent);
  for (const child of node.children) walk(child, visit, node);
}

/** True when `candidateId` is `id` itself or an ancestor of `id`. */
export function isAncestor(root: SceneNode, candidateId: string, id: string): boolean {
  return getPath(root, id).some((n) => n.id === candidateId);
}

const _euler = new THREE.Euler();

/** Compose a {@link Transform} into a `THREE.Matrix4`. */
export function transformToMatrix(t: Transform): THREE.Matrix4 {
  const position = new THREE.Vector3(t.position[0], t.position[1], t.position[2]);
  const quaternion = new THREE.Quaternion().setFromEuler(
    _euler.set(t.rotation[0], t.rotation[1], t.rotation[2], "XYZ"),
  );
  const scale = new THREE.Vector3(t.scale[0], t.scale[1], t.scale[2]);
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

/** Decompose a `THREE.Matrix4` back into a {@link Transform} (XYZ Euler). */
export function matrixToTransform(m: THREE.Matrix4): Transform {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(position, quaternion, scale);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z],
  };
}

/** World matrix of `id`, chaining local transforms from the root down. */
export function worldMatrix(root: SceneNode, id: string): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  for (const node of getPath(root, id)) m.multiply(transformToMatrix(node.transform));
  return m;
}
