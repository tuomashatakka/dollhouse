import type { ModelDocument, SceneNode } from "@dollhouse/shared";
import type { Command } from "./commands.js";
import { Signal } from "./Signals.js";
import { findNode } from "./util.js";

/** Gizmo manipulation mode — the subset of {@link EditorTool} that shows a gizmo. */
export type TransformMode = "translate" | "rotate" | "scale";

/**
 * The active editor tool. `select` picks nodes with no gizmo; `pan` drags the
 * camera with the left mouse button; `translate` / `rotate` / `scale` show the
 * transform gizmo.
 */
export type EditorTool = "select" | "pan" | TransformMode;

/** Undo / redo stack of {@link Command}s. */
export class History {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  /** Run a command and record it; clears the redo stack. */
  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }
  /** Undo the most recent command. */
  undo(): Command | null {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.undo();
    this.redoStack.push(command);
    return command;
  }
  /** Redo the most recently undone command. */
  redo(): Command | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.execute();
    this.undoStack.push(command);
    return command;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

/**
 * Central editor model — the framework-agnostic counterpart of mrdoob's
 * `Editor`. Holds the document, selection and gizmo mode; mutates the document
 * through {@link Command}s and broadcasts changes over typed {@link Signal}s.
 */
export class EditorState {
  document: ModelDocument;
  selection: ReadonlySet<string> = new Set();
  tool: EditorTool = "select";
  /** Bumped on every document mutation — a cache-buster for `React.memo`. */
  revision = 0;
  readonly history = new History();
  readonly signals = {
    documentChanged: new Signal(),
    selectionChanged: new Signal(),
    toolChanged: new Signal(),
  };

  constructor(document: ModelDocument) {
    this.document = document;
  }

  /** Root node of the active document. */
  get root(): SceneNode {
    return this.document.root;
  }

  /** Run a command through history and broadcast the change. */
  execute(command: Command): void {
    this.history.execute(command);
    this.afterMutation();
  }
  undo(): void {
    if (this.history.undo()) this.afterMutation();
  }
  redo(): void {
    if (this.history.redo()) this.afterMutation();
  }

  private afterMutation(): void {
    this.revision += 1;
    this.document.metadata = { ...this.document.metadata, updatedAt: Date.now() };
    this.pruneSelection();
    this.signals.documentChanged.dispatch();
  }

  /** Drop selection ids whose nodes no longer exist (after a delete / ungroup). */
  private pruneSelection(): void {
    if (this.selection.size === 0) return;
    const alive = new Set<string>();
    for (const id of this.selection) {
      if (findNode(this.document.root, id)) alive.add(id);
    }
    if (alive.size !== this.selection.size) {
      this.selection = alive;
      this.signals.selectionChanged.dispatch();
    }
  }

  /** Replace the selection, or toggle ids into it when `additive` is true. */
  select(ids: string[], additive = false): void {
    if (additive) {
      const next = new Set(this.selection);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      this.selection = next;
    } else {
      this.selection = new Set(ids);
    }
    this.signals.selectionChanged.dispatch();
  }
  clearSelection(): void {
    if (this.selection.size === 0) return;
    this.selection = new Set();
    this.signals.selectionChanged.dispatch();
  }

  /** Switch the active tool (select / pan / translate / rotate / scale). */
  setTool(tool: EditorTool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    this.signals.toolChanged.dispatch();
  }

  /** Swap in a different document (e.g. dollhouse ⇄ doll), resetting state. */
  setDocument(document: ModelDocument): void {
    this.document = document;
    this.selection = new Set();
    this.tool = "select";
    this.history.clear();
    this.revision += 1;
    this.signals.documentChanged.dispatch();
    this.signals.selectionChanged.dispatch();
  }
}
