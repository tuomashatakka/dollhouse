import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useStore } from "../store/index.js";
import { Doll } from "./Doll.js";
import { Dollhouse } from "./Dollhouse.js";
import { Lighting } from "./lighting.js";

export function Scene() {
  const agents = useStore((s) => s.agents);

  return (
    <Canvas
      shadows
      camera={{ position: [9, 6, 11], fov: 38 }}
      gl={{ antialias: true, toneMappingExposure: 1.1 }}
      className="!absolute inset-0"
    >
      <color attach="background" args={["#1a0e1c"]} />
      <fog attach="fog" args={["#1a0e1c", 22, 45]} />
      <Lighting />
      <Dollhouse />
      {Object.values(agents).map((a) => (
        <Doll key={a.id} agent={a} />
      ))}
      <ContactShadows
        position={[0, 0, 0.6]}
        opacity={0.55}
        scale={20}
        blur={2.5}
        far={6}
      />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={6}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 3, 0]}
      />
    </Canvas>
  );
}
