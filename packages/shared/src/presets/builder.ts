import type {
  GeometryDef,
  MaterialDef,
  NodeKind,
  SceneNode,
  Transform,
} from "../model/index.js";
import { makeTransform } from "../model/index.js";

interface MeshOpts {
  castShadow?: boolean;
  receiveShadow?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Stateful helper for building preset documents with stable, deterministic ids.
 * Each instance numbers its nodes sequentially from a prefix, so the same build
 * code always yields the same ids — important for localStorage round-trips and
 * stable editor references.
 */
export class NodeFactory {
  private counter = 0;

  constructor(private readonly prefix: string) {}

  /** Next deterministic id, e.g. "dh-7". */
  id(): string {
    return `${this.prefix}-${this.counter++}`;
  }

  /** A container node (transform only, no geometry). */
  group(
    name: string,
    children: SceneNode[] = [],
    transform?: Partial<Transform>,
    kind: NodeKind = "group",
  ): SceneNode {
    return { id: this.id(), name, kind, transform: makeTransform(transform), children };
  }

  /** A single mesh node. */
  mesh(
    name: string,
    geometry: GeometryDef,
    material: MaterialDef,
    transform?: Partial<Transform>,
    opts: MeshOpts = {},
  ): SceneNode {
    return {
      id: this.id(),
      name,
      kind: "mesh",
      transform: makeTransform(transform),
      geometry,
      material,
      castShadow: opts.castShadow,
      receiveShadow: opts.receiveShadow,
      metadata: opts.metadata,
      children: [],
    };
  }

  /** An instanced-mesh node — one geometry stamped at many transforms. */
  instanced(
    name: string,
    geometry: GeometryDef,
    material: MaterialDef,
    instances: Transform[],
    opts: MeshOpts = {},
  ): SceneNode {
    return {
      id: this.id(),
      name,
      kind: "instancedMesh",
      transform: makeTransform(),
      geometry,
      material,
      instances,
      castShadow: opts.castShadow,
      receiveShadow: opts.receiveShadow,
      children: [],
    };
  }
}
