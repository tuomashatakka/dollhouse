import { Grid, OrbitControls, Sky } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback } from "react";
import * as THREE from "three";
import { useEditor } from "./EditorProvider.js";
import { ModelRenderer } from "./ModelRenderer.js";
import { SelectionBounds } from "./SelectionBounds.js";
import { TransformGizmo } from "./TransformGizmo.js";
import { XRayOccluder } from "./XRayOccluder.js";

/** The editable 3D viewport — its own Canvas, grid, lighting and gizmo. */
export function Viewport() {
  const editor = useEditor();
  const handleSelect = useCallback(
    (id: string, additive: boolean) => editor.select([id], additive),
    [editor],
  );

  return (
    <Canvas
      shadows
      camera={{ position: [13, 9, 17], fov: 38 }}
      gl={{ antialias: true }}
      onPointerMissed={() => editor.clearSelection()}
    >
      <Sky sunPosition={[40, 20, 30]} turbidity={6} rayleigh={2} mieCoefficient={0.005} mieDirectionalG={0.8} />
      <ambientLight intensity={0.55} color="#fff0e6" />
      <directionalLight
        castShadow
        position={[8, 14, 9]}
        intensity={1.35}
        color="#fff5e6"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-10, 6, 4]} intensity={0.3} color="#ffd5e2" />
      <Grid
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#3a2f48"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#6b5685"
        infiniteGrid
        fadeDistance={60}
        fadeStrength={1.5}
      />
      <ModelRenderer
        document={editor.document}
        revision={editor.revision}
        selectable
        selectedIds={editor.selection}
        onSelectNode={handleSelect}
      />
      <SelectionBounds />
      <XRayOccluder />
      <TransformGizmo />
      <OrbitControls
        makeDefault
        target={[0, 3, 0]}
        minDistance={3}
        maxDistance={40}
        mouseButtons={{
          LEFT: editor.tool === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: editor.tool === "pan" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
        }}
      />
    </Canvas>
  );
}
