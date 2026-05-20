import { Environment } from "@react-three/drei";

export function Lighting() {
  return (
    <>
      {/* Soft warm HDR — gives the dollhouse PBR a believable studio glow. */}
      <Environment preset="apartment" background={false} />
      <ambientLight intensity={0.35} color="#fff0e6" />
      <directionalLight
        castShadow
        position={[8, 14, 9]}
        intensity={1.5}
        color="#fff5e6"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-2}
        shadow-bias={-0.0005}
      />
      {/* Pink rim fill from camera-left to keep the interior from going flat. */}
      <directionalLight position={[-10, 6, 4]} intensity={0.35} color="#ffd5e2" />
    </>
  );
}
