import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { SetTransformCommand } from "../core/commands.js";
import { useEditor } from "./EditorProvider.js";

/**
 * Drei `TransformControls` bound to the editor's single selection. Translates /
 * rotates / scales the live three.js object, then commits one
 * {@link SetTransformCommand} when the drag ends.
 */
export function TransformGizmo() {
  const editor = useEditor();
  const scene = useThree((state) => state.scene);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);

  const selectedId = editor.selection.size === 1 ? ([...editor.selection][0] ?? null) : null;

  // Resolve the selected node id to its live three.js object.
  useEffect(() => {
    if (!selectedId) {
      setTarget(null);
      return;
    }
    let found: THREE.Object3D | null = null;
    scene.traverse((object) => {
      if (object.userData["nodeId"] === selectedId) found = object;
    });
    setTarget(found);
  }, [selectedId, scene, editor.revision]);

  if (!target || !selectedId) return null;

  // Guard: never attach the gizmo to an object detached from the scene graph —
  // this can happen for a frame after group / ungroup / undo re-parents nodes.
  let ancestor: THREE.Object3D | null = target;
  let inScene = false;
  while (ancestor) {
    if (ancestor === scene) {
      inScene = true;
      break;
    }
    ancestor = ancestor.parent;
  }
  if (!inScene) return null;

  return (
    <TransformControls
      object={target}
      mode={editor.transformMode}
      onMouseUp={() => {
        editor.execute(
          new SetTransformCommand(editor.root, selectedId, {
            position: [target.position.x, target.position.y, target.position.z],
            rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
            scale: [target.scale.x, target.scale.y, target.scale.z],
          }),
        );
      }}
    />
  );
}
