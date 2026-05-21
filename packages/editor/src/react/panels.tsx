import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  type GeometryDef,
  type MaterialDef,
  type ModelDocument,
  type SceneNode,
  type Transform,
} from "@dollhouse/shared";
import {
  deserializeDocument,
  downloadDocument,
  type EditorState,
  type EditorTool,
  findNode,
  GroupCommand,
  loadFromStorage,
  saveToStorage,
  SetGeometryCommand,
  SetMaterialCommand,
  SetTransformCommand,
  SetVisibilityCommand,
  UngroupCommand,
} from "../core/index.js";
import { buildDollDocument, buildDollhouseDocument } from "../presets/index.js";
import { useEditor } from "./EditorProvider.js";

/* ───────────────────────── shared chrome ───────────────────────── */

function PanelShell({ children }: { children: ReactNode }) {
  return <div className="h-full flex flex-col bg-[#171120]">{children}</div>;
}

function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-2 border-b border-white/5 text-[10px] font-semibold uppercase tracking-wider text-pink-200/70">
      {children}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-white/5 pt-3 first:border-0 first:pt-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-pink-200/70">{title}</h3>
      {children}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="p-4 text-[11px] text-white/35 leading-relaxed">{text}</div>;
}

function Divider() {
  return <span className="w-px h-5 bg-white/10 mx-0.5" />;
}

/* ───────────────────────── number inputs ───────────────────────── */

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function NumberField({
  value,
  onCommit,
  step = 0.1,
}: {
  value: number;
  onCommit: (value: number) => void;
  step?: number;
}) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    else setDraft(formatNumber(value));
  };

  return (
    <input
      type="number"
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white/90 outline-none focus:border-pink-300/60"
    />
  );
}

function Vec3Field({
  label,
  value,
  step,
  onCommit,
}: {
  label: string;
  value: readonly [number, number, number];
  step?: number;
  onCommit: (value: [number, number, number]) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-white/35">{label}</div>
      <div className="grid grid-cols-3 gap-1">
        <NumberField value={value[0]} step={step} onCommit={(x) => onCommit([x, value[1], value[2]])} />
        <NumberField value={value[1]} step={step} onCommit={(y) => onCommit([value[0], y, value[2]])} />
        <NumberField value={value[2]} step={step} onCommit={(z) => onCommit([value[0], value[1], z])} />
      </div>
    </div>
  );
}

/* ───────────────────────── property sections ───────────────────────── */

function TransformFields({ editor, node }: { editor: EditorState; node: SceneNode }) {
  const t = node.transform;
  const commit = (next: Transform) =>
    editor.execute(new SetTransformCommand(editor.root, node.id, next));
  return (
    <PanelSection title="Transform">
      <Vec3Field label="Position" value={t.position} step={0.05} onCommit={(position) => commit({ ...t, position })} />
      <Vec3Field label="Rotation (rad)" value={t.rotation} step={0.05} onCommit={(rotation) => commit({ ...t, rotation })} />
      <Vec3Field label="Scale" value={t.scale} step={0.05} onCommit={(scale) => commit({ ...t, scale })} />
    </PanelSection>
  );
}

function GeometryFields({ editor, node }: { editor: EditorState; node: SceneNode }) {
  const geometry = node.geometry;
  if (!geometry) return null;
  const commit = (next: GeometryDef) =>
    editor.execute(new SetGeometryCommand(editor.root, node.id, next));

  const fields: { key: string; value: number; set: (v: number) => GeometryDef }[] = [];
  switch (geometry.type) {
    case "box":
      fields.push(
        { key: "width", value: geometry.width, set: (v) => ({ ...geometry, width: v }) },
        { key: "height", value: geometry.height, set: (v) => ({ ...geometry, height: v }) },
        { key: "depth", value: geometry.depth, set: (v) => ({ ...geometry, depth: v }) },
      );
      break;
    case "plane":
      fields.push(
        { key: "width", value: geometry.width, set: (v) => ({ ...geometry, width: v }) },
        { key: "height", value: geometry.height, set: (v) => ({ ...geometry, height: v }) },
      );
      break;
    case "sphere":
      fields.push({ key: "radius", value: geometry.radius, set: (v) => ({ ...geometry, radius: v }) });
      break;
    case "capsule":
      fields.push(
        { key: "radius", value: geometry.radius, set: (v) => ({ ...geometry, radius: v }) },
        { key: "length", value: geometry.length, set: (v) => ({ ...geometry, length: v }) },
      );
      break;
    case "cylinder":
      fields.push(
        { key: "radiusTop", value: geometry.radiusTop, set: (v) => ({ ...geometry, radiusTop: v }) },
        { key: "radiusBottom", value: geometry.radiusBottom, set: (v) => ({ ...geometry, radiusBottom: v }) },
        { key: "height", value: geometry.height, set: (v) => ({ ...geometry, height: v }) },
      );
      break;
    case "cone":
      fields.push(
        { key: "radius", value: geometry.radius, set: (v) => ({ ...geometry, radius: v }) },
        { key: "height", value: geometry.height, set: (v) => ({ ...geometry, height: v }) },
      );
      break;
    case "buffer":
      break;
  }

  return (
    <PanelSection title={`Geometry · ${geometry.type}`}>
      {fields.length === 0 ? (
        <p className="text-[11px] text-white/35">Raw buffer geometry — not parametrically resizable.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {fields.map((field) => (
            <label key={field.key} className="space-y-0.5 text-[10px] capitalize text-white/45">
              <span>{field.key}</span>
              <NumberField value={field.value} step={0.05} onCommit={(v) => commit(field.set(v))} />
            </label>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function MaterialFields({ editor, node }: { editor: EditorState; node: SceneNode }) {
  const material = node.material;
  if (!material) return null;
  const commit = (patch: Partial<MaterialDef>) =>
    editor.execute(new SetMaterialCommand(editor.root, node.id, { ...material, ...patch }));

  return (
    <PanelSection title="Material">
      <label className="flex items-center justify-between text-[11px] text-white/45">
        <span>Color</span>
        <input
          type="color"
          value={material.color}
          onChange={(e) => commit({ color: e.target.value })}
          className="h-6 w-10 cursor-pointer rounded bg-transparent"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-0.5 text-[10px] text-white/45">
          <span>Roughness</span>
          <NumberField value={material.roughness ?? 0.7} step={0.05} onCommit={(v) => commit({ roughness: clamp01(v) })} />
        </label>
        <label className="space-y-0.5 text-[10px] text-white/45">
          <span>Metalness</span>
          <NumberField value={material.metalness ?? 0} step={0.05} onCommit={(v) => commit({ metalness: clamp01(v) })} />
        </label>
        <label className="space-y-0.5 text-[10px] text-white/45">
          <span>Opacity</span>
          <NumberField value={material.opacity ?? 1} step={0.05} onCommit={(v) => commit({ opacity: clamp01(v) })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-white/45">
        <input
          type="checkbox"
          checked={material.transparent ?? false}
          onChange={(e) => commit({ transparent: e.target.checked })}
        />
        Transparent
      </label>
    </PanelSection>
  );
}

/* ───────────────────────── properties panel ───────────────────────── */

export function PropertiesPanel() {
  const editor = useEditor();
  const ids = [...editor.selection];

  if (ids.length === 0) {
    return (
      <PanelShell>
        <PanelHeading>Properties</PanelHeading>
        <EmptyHint text="Select a mesh in the viewport or outliner to edit its transform, geometry and material." />
      </PanelShell>
    );
  }
  if (ids.length > 1) {
    return (
      <PanelShell>
        <PanelHeading>Properties</PanelHeading>
        <EmptyHint text={`${ids.length} nodes selected. Use Group, or select a single node to edit it.`} />
      </PanelShell>
    );
  }
  const node = findNode(editor.root, ids[0] ?? "");
  if (!node) {
    return (
      <PanelShell>
        <PanelHeading>Properties</PanelHeading>
        <EmptyHint text="The selected node no longer exists." />
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <div className="px-3 py-2 border-b border-white/5">
        <div className="truncate text-xs font-semibold text-white/90">{node.name}</div>
        <div className="text-[10px] text-white/35">
          {node.kind} · {node.id.slice(0, 8)}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <TransformFields editor={editor} node={node} />
        {node.geometry && <GeometryFields editor={editor} node={node} />}
        {node.material && <MaterialFields editor={editor} node={node} />}
      </div>
    </PanelShell>
  );
}

/* ───────────────────────── outliner ───────────────────────── */

function nodeGlyph(node: SceneNode): string {
  if (node.instances) return "instances";
  if (node.geometry) return "mesh";
  return node.kind;
}

function OutlinerRow({
  editor,
  node,
  depth,
}: {
  editor: EditorState;
  node: SceneNode;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const selected = editor.selection.has(node.id);
  const hasChildren = node.children.length > 0;
  const visible = node.visible !== false;

  return (
    <div>
      <div
        className={
          "flex items-center gap-1 py-0.5 pr-1 cursor-pointer select-none " +
          (selected ? "bg-pink-400/25 text-white" : "text-white/70 hover:bg-white/5") +
          (visible ? "" : " opacity-40")
        }
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={(e) => editor.select([node.id], e.shiftKey || e.metaKey || e.ctrlKey)}
      >
        <button
          type="button"
          className="w-3 shrink-0 text-white/40"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </button>
        <span className="truncate">{node.name}</span>
        <span className="ml-auto pl-2 text-[9px] text-white/25">{nodeGlyph(node)}</span>
        <button
          type="button"
          title={visible ? "Hide" : "Show"}
          className="w-4 shrink-0 text-center text-white/40 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            editor.execute(new SetVisibilityCommand(editor.root, node.id, !visible));
          }}
        >
          {visible ? "◉" : "○"}
        </button>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <OutlinerRow key={child.id} editor={editor} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Outliner() {
  const editor = useEditor();
  return (
    <PanelShell>
      <PanelHeading>Outliner</PanelHeading>
      <div className="flex-1 overflow-y-auto py-1 text-[12px]">
        <OutlinerRow editor={editor} node={editor.root} depth={0} />
      </div>
    </PanelShell>
  );
}

/* ───────────────────────── toolbar ───────────────────────── */

function ModeButton({ tool, label }: { tool: EditorTool; label: string }) {
  const editor = useEditor();
  const active = editor.tool === tool;
  return (
    <button
      type="button"
      onClick={() => editor.setTool(tool)}
      className={
        "px-2 py-1 rounded border " +
        (active
          ? "bg-pink-400/30 border-pink-300/50 text-white"
          : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10")
      }
    >
      {label}
    </button>
  );
}

function ToolButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 rounded border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function importDocument(onLoad: (doc: ModelDocument) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        onLoad(deserializeDocument(text));
      } catch (error) {
        console.error("[editor] failed to import document", error);
      }
    });
  };
  input.click();
}

export function Toolbar() {
  const editor = useEditor();
  const selectionIds = [...editor.selection];
  const soleSelected =
    selectionIds.length === 1 ? findNode(editor.root, selectionIds[0] ?? "") : null;
  const canUngroup =
    soleSelected !== null &&
    !soleSelected.geometry &&
    soleSelected.children.length > 0 &&
    soleSelected.id !== editor.root.id;

  const doGroup = () => {
    if (selectionIds.length < 2) return;
    const command = new GroupCommand(editor.root, selectionIds);
    editor.execute(command);
    editor.select([command.group.id]);
  };
  const doUngroup = () => {
    if (soleSelected) editor.execute(new UngroupCommand(editor.root, soleSelected));
  };
  const switchDoc = (kind: ModelDocument["kind"]) => {
    if (editor.document.kind === kind) return;
    const next =
      loadFromStorage(kind) ??
      (kind === "doll" ? buildDollDocument() : buildDollhouseDocument());
    editor.setDocument(next);
  };

  return (
    <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#171120] px-3 py-2 text-[12px]">
      <span className="mr-1 font-display text-sm text-pink-200">Dollhouse Editor</span>
      <Divider />
      <ModeButton tool="select" label="Select" />
      <ModeButton tool="pan" label="Pan" />
      <Divider />
      <ModeButton tool="translate" label="Move" />
      <ModeButton tool="rotate" label="Rotate" />
      <ModeButton tool="scale" label="Scale" />
      <Divider />
      <ToolButton onClick={doGroup} disabled={selectionIds.length < 2}>
        Group
      </ToolButton>
      <ToolButton onClick={doUngroup} disabled={!canUngroup}>
        Ungroup
      </ToolButton>
      <Divider />
      <ToolButton onClick={() => editor.undo()} disabled={!editor.history.canUndo}>
        Undo
      </ToolButton>
      <ToolButton onClick={() => editor.redo()} disabled={!editor.history.canRedo}>
        Redo
      </ToolButton>
      <Divider />
      <ToolButton onClick={() => saveToStorage(editor.document)}>Save</ToolButton>
      <ToolButton onClick={() => downloadDocument(editor.document)}>Export</ToolButton>
      <ToolButton onClick={() => importDocument((doc) => editor.setDocument(doc))}>
        Import
      </ToolButton>
      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-white/35">Editing</span>
        <select
          value={editor.document.kind}
          onChange={(e) => switchDoc(e.target.value as ModelDocument["kind"])}
          className="rounded border border-white/10 bg-black/40 px-1.5 py-1 text-white/80 outline-none"
        >
          <option value="dollhouse">Dollhouse</option>
          <option value="doll">Doll</option>
        </select>
      </div>
    </div>
  );
}
