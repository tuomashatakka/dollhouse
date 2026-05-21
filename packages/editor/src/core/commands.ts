import type { GeometryDef, MaterialDef, SceneNode, Transform } from "@dollhouse/shared";
import {
  cloneTransform,
  findNode,
  findParent,
  genId,
  matrixToTransform,
  worldMatrix,
} from "./util.js";

/** An undoable editor operation (the Command pattern). */
export interface Command {
  /** Short human-readable label, shown in history / tooltips. */
  readonly label: string;
  /** Apply the change. Also re-applied on redo. */
  execute(): void;
  /** Revert the change. */
  undo(): void;
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/** Replace a node's local transform. Backs the move / rotate / scale gizmo. */
export class SetTransformCommand implements Command {
  readonly label = "Transform";
  private readonly before: Transform;

  constructor(
    private readonly root: SceneNode,
    private readonly nodeId: string,
    private readonly after: Transform,
  ) {
    const node = findNode(root, nodeId);
    this.before = cloneTransform(node ? node.transform : after);
  }

  private apply(t: Transform): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.transform = cloneTransform(t);
  }
  execute(): void {
    this.apply(this.after);
  }
  undo(): void {
    this.apply(this.before);
  }
}

/** Replace a node's geometry definition. Backs the resize controls. */
export class SetGeometryCommand implements Command {
  readonly label = "Resize";
  private readonly before: GeometryDef | undefined;

  constructor(
    private readonly root: SceneNode,
    private readonly nodeId: string,
    private readonly after: GeometryDef,
  ) {
    const node = findNode(root, nodeId);
    this.before = node?.geometry ? deepClone(node.geometry) : undefined;
  }

  execute(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.geometry = deepClone(this.after);
  }
  undo(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.geometry = this.before ? deepClone(this.before) : undefined;
  }
}

/** Replace a node's material definition. */
export class SetMaterialCommand implements Command {
  readonly label = "Material";
  private readonly before: MaterialDef | undefined;

  constructor(
    private readonly root: SceneNode,
    private readonly nodeId: string,
    private readonly after: MaterialDef,
  ) {
    const node = findNode(root, nodeId);
    this.before = node?.material ? deepClone(node.material) : undefined;
  }

  execute(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.material = deepClone(this.after);
  }
  undo(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.material = this.before ? deepClone(this.before) : undefined;
  }
}

/** Toggle (or set) a node's visibility. */
export class SetVisibilityCommand implements Command {
  readonly label = "Visibility";
  private readonly before: boolean | undefined;

  constructor(
    private readonly root: SceneNode,
    private readonly nodeId: string,
    private readonly after: boolean,
  ) {
    this.before = findNode(root, nodeId)?.visible;
  }

  execute(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.visible = this.after;
  }
  undo(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.visible = this.before;
  }
}

/** Rename a node. */
export class RenameNodeCommand implements Command {
  readonly label = "Rename";
  private readonly before: string;

  constructor(
    private readonly root: SceneNode,
    private readonly nodeId: string,
    private readonly after: string,
  ) {
    this.before = findNode(root, nodeId)?.name ?? after;
  }

  execute(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.name = this.after;
  }
  undo(): void {
    const node = findNode(this.root, this.nodeId);
    if (node) node.name = this.before;
  }
}

/** Add a new node as the last child of a parent. */
export class AddNodeCommand implements Command {
  readonly label = "Add";

  constructor(
    private readonly root: SceneNode,
    private readonly parentId: string,
    private readonly node: SceneNode,
  ) {}

  execute(): void {
    const parent = findNode(this.root, this.parentId);
    if (parent) parent.children.push(this.node);
  }
  undo(): void {
    const parent = findNode(this.root, this.parentId);
    if (!parent) return;
    const i = parent.children.indexOf(this.node);
    if (i >= 0) parent.children.splice(i, 1);
  }
}

/** Remove a node (and its subtree) from the document. */
export class RemoveNodeCommand implements Command {
  readonly label = "Delete";
  private readonly parentId: string | null;
  private readonly index: number;
  private readonly node: SceneNode | null;

  constructor(
    private readonly root: SceneNode,
    nodeId: string,
  ) {
    const parent = findParent(root, nodeId);
    this.node = findNode(root, nodeId);
    this.parentId = parent ? parent.id : null;
    this.index = parent && this.node ? parent.children.indexOf(this.node) : -1;
  }

  execute(): void {
    if (!this.parentId || !this.node) return;
    const parent = findNode(this.root, this.parentId);
    if (!parent) return;
    const i = parent.children.indexOf(this.node);
    if (i >= 0) parent.children.splice(i, 1);
  }
  undo(): void {
    if (!this.parentId || !this.node) return;
    const parent = findNode(this.root, this.parentId);
    if (!parent) return;
    parent.children.splice(Math.min(this.index, parent.children.length), 0, this.node);
  }
}

interface GroupMember {
  node: SceneNode;
  parentId: string;
  index: number;
  /** Local transform before grouping (restored on undo). */
  originalTransform: Transform;
  /** Local transform inside the new group (preserves world placement). */
  groupedTransform: Transform;
}

/**
 * Wrap the selected nodes in a new identity-transform group, re-parenting them
 * while preserving each node's world transform.
 */
export class GroupCommand implements Command {
  readonly label = "Group";
  /** The newly created group node — select this after running the command. */
  readonly group: SceneNode;
  private readonly targetParentId: string;
  private readonly members: GroupMember[] = [];

  constructor(
    private readonly root: SceneNode,
    nodeIds: string[],
  ) {
    const ids = nodeIds.filter((id) => id !== root.id && findNode(root, id) !== null);
    const firstId = ids[0];
    const firstParent = (firstId ? findParent(root, firstId) : null) ?? root;
    this.targetParentId = firstParent.id;
    const groupWorldInverse = worldMatrix(root, firstParent.id).invert();

    for (const id of ids) {
      const node = findNode(root, id);
      const parent = findParent(root, id);
      if (!node || !parent) continue;
      const groupedMatrix = groupWorldInverse.clone().multiply(worldMatrix(root, id));
      this.members.push({
        node,
        parentId: parent.id,
        index: parent.children.indexOf(node),
        originalTransform: cloneTransform(node.transform),
        groupedTransform: matrixToTransform(groupedMatrix),
      });
    }

    this.group = {
      id: genId(),
      name: "Group",
      kind: "group",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      children: [],
    };
  }

  execute(): void {
    const targetParent = findNode(this.root, this.targetParentId);
    if (!targetParent) return;
    for (const m of this.members) {
      const parent = findNode(this.root, m.parentId);
      if (!parent) continue;
      const i = parent.children.indexOf(m.node);
      if (i >= 0) parent.children.splice(i, 1);
    }
    this.group.children = [];
    for (const m of this.members) {
      m.node.transform = cloneTransform(m.groupedTransform);
      this.group.children.push(m.node);
    }
    targetParent.children.push(this.group);
  }

  undo(): void {
    const targetParent = findNode(this.root, this.targetParentId);
    if (targetParent) {
      const gi = targetParent.children.indexOf(this.group);
      if (gi >= 0) targetParent.children.splice(gi, 1);
    }
    this.group.children = [];
    for (const m of [...this.members].sort((a, b) => a.index - b.index)) {
      const parent = findNode(this.root, m.parentId);
      if (!parent) continue;
      m.node.transform = cloneTransform(m.originalTransform);
      parent.children.splice(Math.min(m.index, parent.children.length), 0, m.node);
    }
  }
}

/** Dissolve a group, re-parenting its children while preserving world transforms. */
export class UngroupCommand implements Command {
  readonly label = "Ungroup";
  private readonly parentId: string;
  private readonly groupIndex: number;
  private readonly entries: { node: SceneNode; inside: Transform; outside: Transform }[] = [];

  constructor(
    private readonly root: SceneNode,
    private readonly group: SceneNode,
  ) {
    const parent = findParent(root, group.id) ?? root;
    this.parentId = parent.id;
    this.groupIndex = parent.children.indexOf(group);
    const parentWorldInverse = worldMatrix(root, parent.id).invert();
    for (const child of group.children) {
      this.entries.push({
        node: child,
        inside: cloneTransform(child.transform),
        outside: matrixToTransform(
          parentWorldInverse.clone().multiply(worldMatrix(root, child.id)),
        ),
      });
    }
  }

  execute(): void {
    const parent = findNode(this.root, this.parentId);
    if (!parent) return;
    const gi = parent.children.indexOf(this.group);
    if (gi >= 0) parent.children.splice(gi, 1);
    let at = gi >= 0 ? gi : parent.children.length;
    for (const e of this.entries) {
      e.node.transform = cloneTransform(e.outside);
      parent.children.splice(at, 0, e.node);
      at += 1;
    }
    this.group.children = [];
  }

  undo(): void {
    const parent = findNode(this.root, this.parentId);
    if (!parent) return;
    for (const e of this.entries) {
      const i = parent.children.indexOf(e.node);
      if (i >= 0) parent.children.splice(i, 1);
      e.node.transform = cloneTransform(e.inside);
    }
    this.group.children = this.entries.map((e) => e.node);
    parent.children.splice(Math.min(this.groupIndex, parent.children.length), 0, this.group);
  }
}
