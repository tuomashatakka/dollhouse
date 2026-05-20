import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { a, useSpring } from "@react-spring/three";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ROOM_COORDS } from "@dollhouse/shared";
import type { AgentState } from "../store/agentsSlice.js";
import { useStore } from "../store/index.js";
import { AGENT_COLOR, PALETTE } from "./materials.js";

interface DollProps {
  agent: AgentState;
}

const SPAWN_POS = ROOM_COORDS.spawnPoint.position;

/**
 * Procedural humanoid: sphere head + capsule torso + cylinder limbs.
 * Animation FSM driven by AgentState.status:
 *   - "walking": react-spring lerps position from spawn to assigned room,
 *                arms/legs swing via sine on useFrame
 *   - "working": torso lean + arm tap loop
 *   - "idle":    gentle Y-bob
 *   - "exited":  scale-down tween then unmount (handled by parent)
 */
export function Doll({ agent }: DollProps) {
  const setStatus = useStore((s) => s.setStatus);
  const removeAgent = useStore((s) => s.removeAgent);
  const setActive = useStore((s) => s.setActiveAgent);

  const target = ROOM_COORDS[agent.room].position;
  // Slight per-doll offset so multiple dolls in the same room don't z-fight.
  const offset = useMemo(() => {
    let h = 0;
    for (let i = 0; i < agent.id.length; i++) h = (h * 31 + agent.id.charCodeAt(i)) | 0;
    return [(((h & 7) - 3) * 0.06), 0, (((h >> 3) & 7) - 3) * 0.06] as const;
  }, [agent.id]);

  const targetPos: [number, number, number] = [
    target[0] + offset[0],
    target[1],
    target[2] + offset[2],
  ];

  const [spring, api] = useSpring(
    () => ({
      pos: [SPAWN_POS[0], SPAWN_POS[1], SPAWN_POS[2]] as [number, number, number],
      scale: 1,
      config: { mass: 1.4, tension: 60, friction: 22 },
    }),
    [],
  );

  // Trigger walk on spawn, scale-down on exit
  useEffect(() => {
    if (agent.status === "walking") {
      api.start({
        pos: targetPos,
        onRest: () => {
          // Flip to idle once we arrive — the next stdout chunk will promote
          // to "working".
          if (useStore.getState().agents[agent.id]?.status === "walking") {
            setStatus(agent.id, "idle");
          }
        },
      });
    }
    if (agent.status === "exited") {
      api.start({
        scale: 0,
        config: { tension: 180, friction: 18 },
        onRest: () => removeAgent(agent.id),
      });
    }
  }, [agent.status, agent.id, agent.room, api, setStatus, removeAgent, targetPos]);

  const colorKey = AGENT_COLOR[agent.type] ?? "dollEcho";
  const bodyColor = PALETTE[colorKey];

  // Per-frame animation refs
  const leftArm = useRef<THREE.Group>(null!);
  const rightArm = useRef<THREE.Group>(null!);
  const leftLeg = useRef<THREE.Group>(null!);
  const rightLeg = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Mesh>(null!);
  const torso = useRef<THREE.Group>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const st = agent.status;
    const walking = st === "walking";
    const working = st === "working";
    const idle = st === "idle";

    // Limb swing — faster when walking, twitchy when working, slow when idle.
    const swingRate = walking ? 7 : working ? 6 : 1.6;
    const swingAmp = walking ? 0.6 : working ? 0.25 : 0.06;

    if (leftArm.current && rightArm.current) {
      const phase = Math.sin(t * swingRate);
      leftArm.current.rotation.x = phase * swingAmp;
      rightArm.current.rotation.x = -phase * swingAmp;
    }
    if (leftLeg.current && rightLeg.current && walking) {
      const phase = Math.sin(t * swingRate);
      leftLeg.current.rotation.x = -phase * swingAmp * 0.8;
      rightLeg.current.rotation.x = phase * swingAmp * 0.8;
    } else if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x *= 0.9;
      rightLeg.current.rotation.x *= 0.9;
    }

    // Torso lean forward when working; gentle bob when idle.
    if (torso.current) {
      const targetLean = working ? 0.35 : 0;
      torso.current.rotation.x +=
        (targetLean - torso.current.rotation.x) * 0.1;
      const bobY = idle ? Math.sin(t * 2) * 0.04 : 0;
      torso.current.position.y = 0.6 + bobY;
    }
    if (head.current) {
      const targetTurn = working
        ? Math.sin(t * 4) * 0.08
        : idle
          ? Math.sin(t * 0.6) * 0.5
          : 0;
      head.current.rotation.y += (targetTurn - head.current.rotation.y) * 0.08;
    }
  });

  return (
    <a.group
      position={spring.pos as unknown as THREE.Vector3Tuple}
      scale={spring.scale}
      onClick={(e) => {
        e.stopPropagation();
        setActive(agent.id);
      }}
    >
      {/* Shadow caster group */}
      <group ref={torso} position={[0, 0.6, 0]}>
        {/* torso */}
        <mesh castShadow>
          <capsuleGeometry args={[0.16, 0.34, 6, 12]} />
          <meshStandardMaterial color={bodyColor} roughness={0.55} />
        </mesh>
        {/* head */}
        <mesh ref={head} castShadow position={[0, 0.42, 0]}>
          <sphereGeometry args={[0.18, 24, 16]} />
          <meshStandardMaterial color={PALETTE.skin} roughness={0.6} />
        </mesh>
        {/* hair cap */}
        <mesh position={[0, 0.52, -0.02]}>
          <sphereGeometry
            args={[0.185, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.1]}
          />
          <meshStandardMaterial color={PALETTE.hair} roughness={0.7} />
        </mesh>
        {/* arms — pivot at shoulder */}
        <group ref={leftArm} position={[-0.22, 0.18, 0]}>
          <mesh castShadow position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.05, 0.32, 4, 8]} />
            <meshStandardMaterial color={bodyColor} roughness={0.55} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.22, 0.18, 0]}>
          <mesh castShadow position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.05, 0.32, 4, 8]} />
            <meshStandardMaterial color={bodyColor} roughness={0.55} />
          </mesh>
        </group>
      </group>
      {/* legs — pivot at hip */}
      <group ref={leftLeg} position={[-0.08, 0.4, 0]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.06, 0.36, 4, 8]} />
          <meshStandardMaterial color={PALETTE.walnut} roughness={0.5} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.08, 0.4, 0]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.06, 0.36, 4, 8]} />
          <meshStandardMaterial color={PALETTE.walnut} roughness={0.5} />
        </mesh>
      </group>
      {/* nameplate */}
      <Html
        position={[0, 1.45, 0]}
        center
        distanceFactor={8}
        occlude={false}
        pointerEvents="none"
      >
        <div className="px-2 py-0.5 text-[10px] rounded-full bg-black/70 border border-white/20 text-white whitespace-nowrap font-mono select-none">
          {agent.label}{" "}
          <span
            className={
              agent.status === "working"
                ? "text-emerald-300"
                : agent.status === "walking"
                  ? "text-amber-300"
                  : agent.status === "exited"
                    ? "text-rose-300"
                    : "text-white/50"
            }
          >
            • {agent.status}
          </span>
        </div>
      </Html>
    </a.group>
  );
}
