import { Instance, Instances } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { PALETTE } from "./materials.js";

// World layout (x = left/right, y = up, z = depth):
//   width 7 (x: -3.5..3.5), depth 2 (z: -1..1), height 7.5 (y: 0..7.5)
//   front wall (z = +1) is OMITTED — cross-section facing +Z (the camera).
//   floors: 0, 2.5, 5; ceilings: 2.5, 5, 7.5; roof gable up to y≈9.5

const W = 7;
const D = 2;
const FLOOR_H = 2.5;
const WALL_T = 0.12;
const BACK_Z = -D / 2;

export function Dollhouse() {
  return (
    <group position={[0, 0, 0]}>
      <Ground />
      <BackWall />
      <SideWalls />
      <Floors />
      <RoomDividers />
      <Furniture />
      <Stairs />
      <Roof />
      <BalconyRail />
      <FrontPorch />
    </group>
  );
}

/* ───────────────────────── ground / lawn ───────────────────────── */

function Ground() {
  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 1]}
    >
      <planeGeometry args={[28, 16]} />
      <meshStandardMaterial color={PALETTE.ground} roughness={0.95} />
    </mesh>
  );
}

/* ───────────────────────── back wall ────────────────────────────── */

function BackWall() {
  return (
    <group>
      {/* solid pink back panel */}
      <mesh receiveShadow castShadow position={[0, FLOOR_H * 1.5, BACK_Z]}>
        <boxGeometry args={[W, FLOOR_H * 3, WALL_T]} />
        <meshStandardMaterial
          color={PALETTE.wallPinkInterior}
          roughness={0.85}
        />
      </mesh>
      {/* exterior trim strip on top of back wall */}
      <mesh position={[0, FLOOR_H * 3 - 0.05, BACK_Z - WALL_T / 2 - 0.005]}>
        <boxGeometry args={[W + 0.2, 0.12, WALL_T]} />
        <meshStandardMaterial color={PALETTE.trim} />
      </mesh>
      {/* decorative pictures / windows on back wall */}
      <Picture x={-2.4} y={1.3} w={0.7} h={0.5} color={PALETTE.accentLavender} />
      <Picture x={-1.5} y={1.4} w={0.5} h={0.4} color={PALETTE.accentMint} />
      <Picture x={-2.4} y={3.8} w={0.9} h={0.6} color={PALETTE.wallpaperTeal} />
      <Window x={2.3} y={1.3} />
      <Window x={2.3} y={3.8} />
      <Window x={2.3} y={6.3} />
    </group>
  );
}

function Picture({
  x,
  y,
  w,
  h,
  color,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}) {
  return (
    <group position={[x, y, BACK_Z + WALL_T / 2 + 0.003]}>
      <mesh castShadow>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.02]} />
        <meshStandardMaterial color={PALETTE.walnut} />
      </mesh>
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function Window({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, y, BACK_Z + WALL_T / 2 + 0.003]}>
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.9, 0.03]} />
        <meshStandardMaterial color={PALETTE.white} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[0.66, 0.76]} />
        <meshStandardMaterial
          color={PALETTE.glass}
          transparent
          opacity={0.55}
          metalness={0.1}
          roughness={0.05}
        />
      </mesh>
      {/* mullion cross */}
      <mesh position={[0, 0, 0.025]}>
        <boxGeometry args={[0.04, 0.78, 0.005]} />
        <meshStandardMaterial color={PALETTE.white} />
      </mesh>
      <mesh position={[0, 0, 0.025]}>
        <boxGeometry args={[0.68, 0.04, 0.005]} />
        <meshStandardMaterial color={PALETTE.white} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── side walls ─────────────────────────── */

function SideWalls() {
  return (
    <>
      {[-W / 2, W / 2].map((x, i) => (
        <mesh
          key={i}
          castShadow
          receiveShadow
          position={[x, FLOOR_H * 1.5, 0]}
        >
          <boxGeometry args={[WALL_T, FLOOR_H * 3, D]} />
          <meshStandardMaterial color={PALETTE.exteriorPink} roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

/* ───────────────────────── floors ─────────────────────────────── */

function Floors() {
  // floor 0 = ground tile (kitchen/bathroom/workshop)
  // floor 1 = walnut planks (living/library/studio)
  // floor 2 = pink checker (bedroom/nursery)
  return (
    <>
      <TiledFloor y={0} colorA={PALETTE.floorTileLight} colorB={PALETTE.floorTileDark} />
      <WoodFloor y={FLOOR_H} />
      <CheckerFloor y={FLOOR_H * 2} />
    </>
  );
}

function WoodFloor({ y }: { y: number }) {
  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, y + 0.001, 0]}
    >
      <planeGeometry args={[W - WALL_T * 2, D - WALL_T * 2]} />
      <meshStandardMaterial color={PALETTE.floorWalnut} roughness={0.7} />
    </mesh>
  );
}

function TiledFloor({
  y,
  colorA,
  colorB,
}: {
  y: number;
  colorA: string;
  colorB: string;
}) {
  // 12 x 4 tile grid for the ground floor
  const tiles = [];
  const cols = 14;
  const rows = 4;
  const tw = (W - WALL_T * 2) / cols;
  const td = (D - WALL_T * 2) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push(
        <mesh
          key={`${r}-${c}`}
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            -W / 2 + WALL_T + tw / 2 + c * tw,
            y + 0.002,
            -D / 2 + WALL_T + td / 2 + r * td,
          ]}
        >
          <planeGeometry args={[tw * 0.95, td * 0.95]} />
          <meshStandardMaterial
            color={(r + c) % 2 === 0 ? colorA : colorB}
            roughness={0.55}
          />
        </mesh>,
      );
    }
  }
  return <>{tiles}</>;
}

function CheckerFloor({ y }: { y: number }) {
  return (
    <TiledFloor y={y} colorA={PALETTE.wallPinkLight} colorB={PALETTE.bedSpread} />
  );
}

/* ───────────────────── room dividers (interior walls) ─────────── */

function RoomDividers() {
  // each floor: partial wall around x = ±1.2 area to suggest rooms without
  // blocking the camera view of the room interior.
  return (
    <>
      {[0, FLOOR_H, FLOOR_H * 2].map((y, i) => (
        <group key={i}>
          {/* slim left/right divider walls (back portion only, so dolls visible from front) */}
          <mesh castShadow receiveShadow position={[-1.2, y + FLOOR_H / 2, -0.25]}>
            <boxGeometry args={[WALL_T, FLOOR_H, D * 0.5]} />
            <meshStandardMaterial color={PALETTE.wallPinkInterior} />
          </mesh>
          <mesh castShadow receiveShadow position={[1.2, y + FLOOR_H / 2, -0.25]}>
            <boxGeometry args={[WALL_T, FLOOR_H, D * 0.5]} />
            <meshStandardMaterial color={PALETTE.wallPinkInterior} />
          </mesh>
          {/* ceiling slab (acts as upper floor's base if not top) */}
          {i < 2 && (
            <mesh
              receiveShadow
              position={[0, y + FLOOR_H - 0.02, 0]}
            >
              <boxGeometry args={[W - WALL_T * 2, 0.04, D - WALL_T * 2]} />
              <meshStandardMaterial color={PALETTE.wallPinkInterior} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

/* ───────────────────────── stairs ─────────────────────────────── */

function Stairs() {
  // White Victorian staircase on the right of each floor.
  const steps = 8;
  const stepH = FLOOR_H / steps;
  const stepD = 0.18;
  return (
    <>
      {[0, FLOOR_H].map((baseY, floor) => (
        <group key={floor}>
          {Array.from({ length: steps }, (_, i) => (
            <mesh
              key={i}
              castShadow
              receiveShadow
              position={[2.95, baseY + stepH * (i + 0.5), 0.55 - i * stepD]}
            >
              <boxGeometry args={[0.8, stepH, stepD * 1.05]} />
              <meshStandardMaterial color={PALETTE.white} roughness={0.7} />
            </mesh>
          ))}
          {/* simple stair railing */}
          <mesh
            castShadow
            position={[2.6, baseY + FLOOR_H / 2 + 0.2, 0.1]}
            rotation={[Math.atan2(FLOOR_H, steps * stepD), 0, 0]}
          >
            <boxGeometry args={[0.04, 0.04, steps * stepD * 1.05]} />
            <meshStandardMaterial color={PALETTE.white} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/* ───────────────────────── roof ─────────────────────────────── */

function Roof() {
  const roofH = 2;
  const roofTop = FLOOR_H * 3;
  const slope = useMemo(() => {
    return Math.atan2(roofH, W / 2 + 0.4);
  }, []);
  const hyp = useMemo(() => Math.hypot(roofH, W / 2 + 0.4), []);

  return (
    <group position={[0, roofTop, 0]}>
      {/* left and right pitched slabs */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * (W / 4 + 0.1), roofH / 2, 0]}
          rotation={[0, 0, -side * slope]}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[hyp, 0.12, D + 0.6]} />
            <meshStandardMaterial color={PALETTE.roofRose} roughness={0.85} />
          </mesh>
          <Shingles width={hyp} depth={D + 0.6} />
        </group>
      ))}
      {/* gable triangle (back face) */}
      <mesh position={[0, roofH / 2, BACK_Z - 0.02]} castShadow>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -(W / 2 + 0.3), -roofH / 2, 0,
                W / 2 + 0.3, -roofH / 2, 0,
                0, roofH / 2 + 0.05, 0,
              ]),
              3,
            ]}
          />
          <bufferAttribute
            attach="attributes-normal"
            args={[new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1]), 3]}
          />
        </bufferGeometry>
        <meshStandardMaterial color={PALETTE.exteriorPink} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Shingles({ width, depth }: { width: number; depth: number }) {
  // Stamp scallop shingle rows across the roof slab using instancing.
  const cols = 14;
  const rows = 6;
  const sw = (width / cols) * 1.1;
  const sd = (depth / rows) * 1.05;
  const positions: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = r % 2 === 0 ? 0 : sw / 2;
      positions.push([
        -width / 2 + sw / 2 + c * sw + offset,
        0.07,
        -depth / 2 + sd / 2 + r * sd,
      ]);
    }
  }
  return (
    <Instances limit={positions.length} castShadow receiveShadow>
      <sphereGeometry args={[sw * 0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={PALETTE.roofShingle} roughness={0.7} />
      {positions.map((p, i) => (
        <Instance key={i} position={p} scale={[1, 0.4, 1]} />
      ))}
    </Instances>
  );
}

/* ─────────────────────── balcony rail ─────────────────────────── */

function BalconyRail() {
  // upper-floor (nursery side) balcony rail along the front-right.
  const posts: number[] = [];
  for (let x = 0.2; x <= 3.2; x += 0.18) posts.push(x);
  return (
    <group position={[0, FLOOR_H * 2 + 0.55, 0.95]}>
      {/* top rail */}
      <mesh castShadow position={[1.7, 0.55, 0]}>
        <boxGeometry args={[3.1, 0.06, 0.08]} />
        <meshStandardMaterial color={PALETTE.white} />
      </mesh>
      {/* bottom rail */}
      <mesh castShadow position={[1.7, 0.08, 0]}>
        <boxGeometry args={[3.1, 0.06, 0.08]} />
        <meshStandardMaterial color={PALETTE.white} />
      </mesh>
      {posts.map((x) => (
        <mesh key={x} castShadow position={[x, 0.32, 0]}>
          <boxGeometry args={[0.04, 0.5, 0.04]} />
          <meshStandardMaterial color={PALETTE.white} />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────── front porch (ground level slab) ─────── */

function FrontPorch() {
  return (
    <mesh receiveShadow position={[0, 0.04, 1.4]}>
      <boxGeometry args={[W + 0.4, 0.08, 0.8]} />
      <meshStandardMaterial color={PALETTE.trim} />
    </mesh>
  );
}

/* ─────────────────────── furniture per room ─────────────────── */

function Furniture() {
  return (
    <>
      {/* kitchen — counter + stove */}
      <Box pos={[-2.6, 0.45, -0.5]} size={[1.3, 0.9, 0.4]} color={PALETTE.white} />
      <Box pos={[-1.6, 0.35, -0.5]} size={[0.4, 0.7, 0.4]} color={PALETTE.walnut} />
      {/* bathroom — bathtub */}
      <Box pos={[0, 0.18, 0.2]} size={[0.9, 0.35, 0.5]} color={PALETTE.white} />
      <Box pos={[0, 0.25, 0.2]} size={[0.75, 0.25, 0.35]} color={PALETTE.wallPinkLight} />
      {/* workshop — workbench */}
      <Box pos={[2.4, 0.45, -0.5]} size={[1.0, 0.9, 0.45]} color={PALETTE.walnut} />
      {/* living — sofa */}
      <Box pos={[-2.4, FLOOR_H + 0.35, 0.0]} size={[1.4, 0.6, 0.55]} color={PALETTE.accentMint} />
      <Box pos={[-2.4, FLOOR_H + 0.65, -0.25]} size={[1.4, 0.55, 0.18]} color={PALETTE.accentMint} />
      {/* library — bookcase */}
      <Box pos={[0, FLOOR_H + 0.9, -0.78]} size={[1.2, 1.5, 0.2]} color={PALETTE.walnut} />
      <Box pos={[0, FLOOR_H + 1.1, -0.7]} size={[1.0, 0.05, 0.18]} color={PALETTE.cream} />
      <Box pos={[0, FLOOR_H + 0.7, -0.7]} size={[1.0, 0.05, 0.18]} color={PALETTE.cream} />
      {/* studio — desk + monitor */}
      <Box pos={[2.4, FLOOR_H + 0.4, -0.4]} size={[1.0, 0.05, 0.5]} color={PALETTE.walnut} />
      <Box pos={[2.4, FLOOR_H + 0.2, -0.4]} size={[1.0, 0.4, 0.05]} color={PALETTE.walnut} />
      <Box pos={[2.4, FLOOR_H + 0.7, -0.6]} size={[0.55, 0.4, 0.04]} color={PALETTE.walnut} />
      <Box pos={[2.4, FLOOR_H + 0.7, -0.58]} size={[0.5, 0.35, 0.01]} color={PALETTE.wallpaperTeal} />
      {/* bedroom — bed */}
      <Box pos={[-2.4, FLOOR_H * 2 + 0.25, 0.2]} size={[1.6, 0.45, 0.9]} color={PALETTE.walnut} />
      <Box pos={[-2.4, FLOOR_H * 2 + 0.55, 0.2]} size={[1.55, 0.15, 0.85]} color={PALETTE.bedSpread} />
      <Box pos={[-2.95, FLOOR_H * 2 + 0.6, 0.2]} size={[0.05, 0.4, 0.85]} color={PALETTE.walnut} />
      {/* nursery — crib */}
      <Box pos={[2.4, FLOOR_H * 2 + 0.35, 0.0]} size={[1.0, 0.55, 0.7]} color={PALETTE.white} />
      <Box pos={[2.4, FLOOR_H * 2 + 0.45, 0.0]} size={[0.95, 0.1, 0.65]} color={PALETTE.bedSpread} />
    </>
  );
}

function Box({
  pos,
  size,
  color,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh castShadow receiveShadow position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}
