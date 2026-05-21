import { ContactShadows, OrbitControls, Sky } from "@react-three/drei";
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
      camera={{ position: [13, 9, 17], fov: 38 }}
      gl={{ antialias: true, toneMappingExposure: 1.05 }}
      className="!absolute inset-0"
    >
      <Sky
        sunPosition={[40, 20, 30]}
        turbidity={6}
        rayleigh={2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <fog attach="fog" args={["#c8d8e8", 35, 80]} />
      <Lighting />
      <Dollhouse />
      {Object.values(agents).map((a) => (
        <Doll key={a.id} agent={a} />
      ))}
      <ContactShadows
        position={[0, 0, 0.6]}
        opacity={0.5}
        scale={30}
        blur={2.5}
        far={6}
      />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={6}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 3, 0]}
      />
    </Canvas>
  );
}
