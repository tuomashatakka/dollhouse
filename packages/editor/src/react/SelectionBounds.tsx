import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useEditor } from "./EditorProvider.js";

/**
 * A wireframe cube tightly enclosing every currently-selected node. The cube
 * geometry is a unit box; we scale + position the LineSegments per frame so we
 * never allocate new geometry. `depthTest=false` keeps it visible through walls.
 */
export function SelectionBounds() {
  const editor = useEditor();
  const { scene } = useThree();
  const ref = useRef<THREE.LineSegments>(null);
  const box = useMemo(() => new THREE.Box3(), []);
  const tmpBox = useMemo(() => new THREE.Box3(), []);
  const tmpSize = useMemo(() => new THREE.Vector3(), []);
  const tmpCenter = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const lines = ref.current;
    if (!lines) return;
    if (editor.selection.size === 0) {
      lines.visible = false;
      return;
    }
    box.makeEmpty();
    scene.traverse((object) => {
      const id = (object.userData as { nodeId?: unknown }).nodeId;
      if (typeof id === "string" && editor.selection.has(id)) {
        tmpBox.setFromObject(object);
        if (!tmpBox.isEmpty()) box.union(tmpBox);
      }
    });
    if (box.isEmpty()) {
      lines.visible = false;
      return;
    }
    box.getSize(tmpSize);
    box.getCenter(tmpCenter);
    lines.visible = true;
    lines.position.copy(tmpCenter);
    lines.scale.set(
      Math.max(tmpSize.x, 0.01),
      Math.max(tmpSize.y, 0.01),
      Math.max(tmpSize.z, 0.01),
    );
  });

  return (
    <lineSegments ref={ref} visible={false} renderOrder={999}>
      <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
      <lineBasicMaterial color="#3fd8ff" depthTest={false} transparent opacity={0.85} />
    </lineSegments>
  );
}
