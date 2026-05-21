import { ModelRenderer } from "@dollhouse/editor";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { a, useSpring } from "@react-spring/three";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ROOM_COORDS } from "@dollhouse/shared";
import type { AgentState } from "../store/agentsSlice.js";
import { useStore } from "../store/index.js";
import { AGENT_COLOR, PALETTE } from "./materials.js";
import { loadDollDocument } from "./model.js";

interface DollProps {
  agent: AgentState;
}

const SPAWN_POS = ROOM_COORDS.spawnPoint.position;

/** The named rig nodes the animation drives, resolved from the rendered doll. */
interface Rig {
  head: THREE.Object3D | null;
  torso: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
}

function emptyRig(): Rig {
  return { head: null, torso: null, leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
}

/**
 * Procedural humanoid doll. The body geometry now comes from the shared
 * DollModel document, rendered via <ModelRenderer>; this component keeps the
 * status-driven animation FSM and walks the named rig nodes per frame:
 *   - "walking": react-spring lerps position to the assigned room; limbs swing
 *   - "working": torso lean + arm twitch loop
 *   - "idle":    gentle Y-bob
 *   - "exited":  scale-down tween, then unmount
 */
export function Doll({ agent }: DollProps) {
  const setStatus = useStore((s) => s.setStatus);
  const removeAgent = useStore((s) => s.removeAgent);
  const setActive = useStore((s) => s.setActiveAgent);

  const target = ROOM_COORDS[agent.room].position;
  // Slight per-doll offset so multiple dolls in one room don't z-fight.
  const offset = useMemo(() => {
    let h = 0;
    for (let i = 0; i < agent.id.length; i++) h = (h * 31 + agent.id.charCodeAt(i)) | 0;
    return [((h & 7) - 3) * 0.06, 0, (((h >> 3) & 7) - 3) * 0.06] as const;
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

  // Trigger walk on spawn, scale-down on exit.
  useEffect(() => {
    if (agent.status === "walking") {
      api.start({
        pos: targetPos,
        onRest: () => {
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

  const dollDocument = useMemo(() => loadDollDocument(), []);
  const tints = useMemo(() => ({ body: bodyColor }), [bodyColor]);

  // Rig nodes are resolved by name once the doll model has mounted.
  const rig = useRef<Rig>(emptyRig());
  const handleReady = useCallback((root: THREE.Group) => {
    rig.current = {
      head: root.getObjectByName("head") ?? null,
      torso: root.getObjectByName("torso") ?? null,
      leftArm: root.getObjectByName("leftArm") ?? null,
      rightArm: root.getObjectByName("rightArm") ?? null,
      leftLeg: root.getObjectByName("leftLeg") ?? null,
      rightLeg: root.getObjectByName("rightLeg") ?? null,
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const st = agent.status;
    const walking = st === "walking";
    const working = st === "working";
    const idle = st === "idle";
    const { head, torso, leftArm, rightArm, leftLeg, rightLeg } = rig.current;

    // Limb swing — faster when walking, twitchy when working, slow when idle.
    const swingRate = walking ? 7 : working ? 6 : 1.6;
    const swingAmp = walking ? 0.6 : working ? 0.25 : 0.06;

    if (leftArm && rightArm) {
      const phase = Math.sin(t * swingRate);
      leftArm.rotation.x = phase * swingAmp;
      rightArm.rotation.x = -phase * swingAmp;
    }
    if (leftLeg && rightLeg) {
      if (walking) {
        const phase = Math.sin(t * swingRate);
        leftLeg.rotation.x = -phase * swingAmp * 0.8;
        rightLeg.rotation.x = phase * swingAmp * 0.8;
      } else {
        leftLeg.rotation.x *= 0.9;
        rightLeg.rotation.x *= 0.9;
      }
    }

    // Torso lean forward when working; gentle bob when idle.
    if (torso) {
      const targetLean = working ? 0.35 : 0;
      torso.rotation.x += (targetLean - torso.rotation.x) * 0.1;
      const bobY = idle ? Math.sin(t * 2) * 0.04 : 0;
      torso.position.y = 0.6 + bobY;
    }
    if (head) {
      const targetTurn = working
        ? Math.sin(t * 4) * 0.08
        : idle
          ? Math.sin(t * 0.6) * 0.5
          : 0;
      head.rotation.y += (targetTurn - head.rotation.y) * 0.08;
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
      <ModelRenderer document={dollDocument} tints={tints} onReady={handleReady} />
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
