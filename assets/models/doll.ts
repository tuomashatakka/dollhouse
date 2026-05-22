import {
  DOLLHOUSE_SCHEMA_VERSION,
  type DollModel,
  type GeometryDef,
  type MaterialDef,
  type SceneNode,
} from "@dollhouse/shared";
import { NodeFactory } from "./builder.js";

const SKIN = "#fadcc8";
const HAIR = "#3a2a23";
const LEG = "#5a3a26";
/**
 * Placeholder body colour. The frontend overrides every node tagged
 * `metadata.tint === "body"` per agent via the ModelRenderer `tints` prop.
 */
const BODY = "#d29bff";

const capsule = (
  radius: number,
  length: number,
  capSegments: number,
  radialSegments: number,
): GeometryDef => ({ type: "capsule", radius, length, capSegments, radialSegments });

/**
 * Procedural humanoid doll: sphere head + capsule torso + capsule limbs.
 * Rig nodes are named (`head`, `torso`, `leftArm`, `rightArm`, `leftLeg`,
 * `rightLeg`) so the frontend animation can drive them by name.
 */
export function buildDollDocument(): DollModel {
  const f = new NodeFactory("doll");
  const bodyMat: MaterialDef = { color: BODY, roughness: 0.55 };
  const tintBody = { metadata: { tint: "body" }, castShadow: true };

  const torso = f.group(
    "torso",
    [
      f.mesh("torsoBody", capsule(0.16, 0.34, 6, 12), bodyMat, {}, tintBody),
      f.mesh(
        "head",
        { type: "sphere", radius: 0.18, widthSegments: 24, heightSegments: 16 },
        { color: SKIN, roughness: 0.6 },
        { position: [0, 0.42, 0] },
        { castShadow: true },
      ),
      f.mesh(
        "hair",
        {
          type: "sphere",
          radius: 0.185,
          widthSegments: 24,
          heightSegments: 16,
          phiStart: 0,
          phiLength: Math.PI * 2,
          thetaStart: 0,
          thetaLength: Math.PI / 2.1,
        },
        { color: HAIR, roughness: 0.7 },
        { position: [0, 0.52, -0.02] },
      ),
      f.group(
        "leftArm",
        [f.mesh("leftArmLimb", capsule(0.05, 0.32, 4, 8), bodyMat, { position: [0, -0.18, 0] }, tintBody)],
        { position: [-0.22, 0.18, 0] },
      ),
      f.group(
        "rightArm",
        [f.mesh("rightArmLimb", capsule(0.05, 0.32, 4, 8), bodyMat, { position: [0, -0.18, 0] }, tintBody)],
        { position: [0.22, 0.18, 0] },
      ),
    ],
    { position: [0, 0.6, 0] },
  );

  const leftLeg = f.group(
    "leftLeg",
    [f.mesh("leftLegLimb", capsule(0.06, 0.36, 4, 8), { color: LEG, roughness: 0.5 }, { position: [0, -0.2, 0] }, { castShadow: true })],
    { position: [-0.08, 0.4, 0] },
  );

  const rightLeg = f.group(
    "rightLeg",
    [f.mesh("rightLegLimb", capsule(0.06, 0.36, 4, 8), { color: LEG, roughness: 0.5 }, { position: [0, -0.2, 0] }, { castShadow: true })],
    { position: [0.08, 0.4, 0] },
  );

  const root: SceneNode = {
    id: "doll-root",
    name: "Doll",
    kind: "doll",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    children: [torso, leftLeg, rightLeg],
  };

  return { schemaVersion: DOLLHOUSE_SCHEMA_VERSION, kind: "doll", root, metadata: { name: "Doll" } };
}
