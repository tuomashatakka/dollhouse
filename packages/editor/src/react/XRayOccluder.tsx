import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useEditor } from "./EditorProvider.js";

interface Saved {
  mesh: THREE.Mesh;
  prevOpacity: number;
  prevTransparent: boolean;
  prevDepthWrite: boolean;
}

/**
 * X-ray mode: every frame we cast a ray from the camera toward each selected
 * node's centre and fade any user meshes blocking the view. We track which
 * meshes were affected and restore their previous material state once they're
 * no longer occluding — so the effect feels reactive but leaves no trace.
 *
 * Only meshes carrying a `userData.nodeId` are considered (skips gizmos / grid).
 */
export function XRayOccluder({ opacity = 0.18 }: { opacity?: number }) {
  const editor = useEditor();
  const { camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const saved = useRef(new Map<string, Saved>());

  const restore = (key: string, entry: Saved): void => {
    const mat = entry.mesh.material;
    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
      mat.opacity = entry.prevOpacity;
      mat.transparent = entry.prevTransparent;
      mat.depthWrite = entry.prevDepthWrite;
    }
    saved.current.delete(key);
  };

  const apply = (mesh: THREE.Mesh): void => {
    const mat = mesh.material;
    if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshBasicMaterial)) {
      return;
    }
    const key = mesh.uuid;
    if (saved.current.has(key)) return;
    saved.current.set(key, {
      mesh,
      prevOpacity: mat.opacity,
      prevTransparent: mat.transparent,
      prevDepthWrite: mat.depthWrite,
    });
    mat.opacity = opacity;
    mat.transparent = true;
    mat.depthWrite = false;
  };

  useFrame(() => {
    const ids = editor.selection;
    if (ids.size === 0) {
      for (const [key, entry] of [...saved.current]) restore(key, entry);
      return;
    }

    // Collect a representative world position per selected node.
    const targets: THREE.Vector3[] = [];
    const selectedAncestorObjects: THREE.Object3D[] = [];
    scene.traverse((object) => {
      const id = (object.userData as { nodeId?: unknown }).nodeId;
      if (typeof id === "string" && ids.has(id)) {
        selectedAncestorObjects.push(object);
        targets.push(object.getWorldPosition(new THREE.Vector3()));
      }
    });

    const stillAffected = new Set<string>();
    for (const point of targets) {
      direction.copy(point).sub(camera.position);
      const dist = direction.length();
      if (dist < 0.001) continue;
      direction.normalize();
      raycaster.set(camera.position, direction);
      raycaster.far = dist - 0.01;
      const hits = raycaster.intersectObject(scene, true);
      for (const hit of hits) {
        const obj = hit.object;
        if (!(obj instanceof THREE.Mesh)) continue;
        const id = (obj.userData as { nodeId?: unknown }).nodeId;
        if (typeof id !== "string") continue; // skip gizmo / grid / outlines
        // Skip the selected nodes themselves or their descendants.
        let isSelf = false;
        let ancestor: THREE.Object3D | null = obj;
        while (ancestor) {
          if (selectedAncestorObjects.includes(ancestor)) {
            isSelf = true;
            break;
          }
          ancestor = ancestor.parent;
        }
        if (isSelf) continue;
        apply(obj);
        stillAffected.add(obj.uuid);
      }
    }

    // Restore anything no longer occluding.
    for (const [key, entry] of [...saved.current]) {
      if (!stillAffected.has(key)) restore(key, entry);
    }
  });

  return null;
}
