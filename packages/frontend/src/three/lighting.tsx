import { Environment } from "@react-three/drei";

export function Lighting() {
  return (
    <>
      {/* Soft warm HDR — gives the dollhouse PBR a believable studio glow. */}
      <Environment preset="apartment" background={false} />
      <ambientLight intensity={0.35} color="#fff0e6" />
      {/*
        Key sun light. Shadow frustum widened to cover the full extended
        scene — the back meadow (z ≤ -10), the side orchard (x up to +42)
        and the west pond garden (x down to -42). A 64-unit far plane keeps
        the willow and apple canopies inside the cascade, and a 4096 shadow
        map preserves crispness over the larger area.
      */}
      <directionalLight
        castShadow
        position={[12, 22, 14]}
        intensity={1.55}
        color="#fff5e6"
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.5}
        shadow-camera-far={64}
        shadow-camera-left={-44}
        shadow-camera-right={44}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {/* Pink rim fill from camera-left to keep the interior from going flat. */}
      <directionalLight position={[-10, 6, 4]} intensity={0.35} color="#ffd5e2" />
      {/*
        A cool, dim fill from the west — bounce light off the new pond
        garden so its boulders and willows don't fall completely flat
        when the sun is on the orchard side.
      */}
      <directionalLight position={[-18, 8, 6]} intensity={0.22} color="#b9d6e6" />
      {/*
        Sky / ground hemisphere fill added in the ninth enhancement
        pass. A warm pink sky tint above and a cool moss tint below
        approximates indirect bounce off the lawn and into the
        shadowed undersides of foliage, gazebo eaves and the new
        south-heath standing stones. Intensity is intentionally low
        so the directional sun stays the dominant shaper of shadows.
      */}
      <hemisphereLight args={["#ffe6ea", "#5d6d3a", 0.35]} />
    </>
  );
}
