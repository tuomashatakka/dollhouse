import type { RoomId } from "../rooms.js";
import type { GeometryDef } from "./geometry.js";
import type { MaterialDef } from "./material.js";
import type { Transform } from "./transform.js";

/**
 * Semantic role of a node. Rendering is driven by data shape (presence of
 * `geometry` / `instances`), not by `kind` — `kind` only informs editor
 * affordances such as outliner icons and grouping rules.
 */
export type NodeKind = "group" | "mesh" | "instancedMesh" | "doll" | "room";

/**
 * A single node in a model document's scene graph. Nodes form a tree; every
 * node carries a local {@link Transform} relative to its parent.
 *
 * - A node with `instances` renders as an instanced mesh.
 * - A node with `geometry` + `material` renders as a single mesh.
 * - Otherwise it renders as an empty group (a pure transform container).
 */
export interface SceneNode {
  /** Stable unique id. Survives serialization; keys selection and commands. */
  id: string;
  /** Human-readable label. Also the three.js object name (rig lookup key). */
  name: string;
  /** Semantic role — see {@link NodeKind}. */
  kind: NodeKind;
  /** Local transform relative to the parent node. */
  transform: Transform;
  /** Whether the node (and its subtree) is rendered. Defaults to true. */
  visible?: boolean;
  /** Whether the mesh casts shadows. */
  castShadow?: boolean;
  /** Whether the mesh receives shadows. */
  receiveShadow?: boolean;
  /** Editor flag — when true the node cannot be selected or transformed. */
  locked?: boolean;
  /** Geometry definition — present on mesh / instancedMesh nodes. */
  geometry?: GeometryDef;
  /** Material definition — present on mesh / instancedMesh nodes. */
  material?: MaterialDef;
  /** Per-instance transforms — present only on instancedMesh nodes. */
  instances?: Transform[];
  /** Room this node belongs to — present on `room` nodes. */
  roomId?: RoomId;
  /** Child nodes. */
  children: SceneNode[];
  /**
   * Free-form annotations. A string `tint` value keys into the
   * ModelRenderer colour-override map (used to recolour dolls per agent).
   */
  metadata?: Record<string, unknown>;
}
