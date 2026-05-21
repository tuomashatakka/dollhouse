import type { SceneNode } from "./node.js";

/** Bump whenever the document shape changes incompatibly. Drives migrations. */
export const DOLLHOUSE_SCHEMA_VERSION = 2;

interface BaseDocument {
  /** Schema version the document was written with. */
  schemaVersion: number;
  /** Root node of the scene graph — usually an identity-transform group. */
  root: SceneNode;
  /** Optional bookkeeping. */
  metadata?: {
    name?: string;
    /** Epoch millis of the last edit. */
    updatedAt?: number;
  };
}

/** A full dollhouse scene — walls, floors, furniture, roof. */
export interface DollhouseDocument extends BaseDocument {
  kind: "dollhouse";
}

/**
 * A single doll model. The root subtree is expected to contain rig nodes named
 * after {@link DOLL_RIG_NODES} so the frontend animation can drive them by name.
 */
export interface DollModel extends BaseDocument {
  kind: "doll";
}

/** Any editable model document the editor can open. */
export type ModelDocument = DollhouseDocument | DollModel;

/** Discriminant literals for {@link ModelDocument}. */
export type ModelDocumentKind = ModelDocument["kind"];

/** Conventional rig node names a {@link DollModel} should expose by `name`. */
export const DOLL_RIG_NODES = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
] as const;

/** A name from {@link DOLL_RIG_NODES}. */
export type DollRigNode = (typeof DOLL_RIG_NODES)[number];
