import { useState } from "react";
import { Outliner, PropertiesPanel, Toolbar } from "./panels.js";
import { Viewport } from "./Viewport.js";

/**
 * Full editor UI — toolbar, outliner, viewport and properties panel. Mount it
 * inside an {@link EditorProvider}.
 */
export function Editor() {
  const [outlinerOpen, setOutlinerOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);

  return (
    <div className="flex h-full w-full flex-col bg-[#0f0b16] text-white">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <aside
          className="shrink-0 overflow-hidden border-r border-white/10 transition-[width] duration-150"
          style={{ width: outlinerOpen ? 240 : 0 }}
        >
          <div className="h-full w-[240px]">
            <Outliner />
          </div>
        </aside>
        <button
          type="button"
          title={outlinerOpen ? "Collapse outliner" : "Expand outliner"}
          onClick={() => setOutlinerOpen((v) => !v)}
          className="flex w-3.5 shrink-0 items-center justify-center bg-[#0f0b16] text-white/20 transition-colors hover:bg-white/5 hover:text-pink-300/70"
        >
          <span className="text-[8px]">{outlinerOpen ? "◂" : "▸"}</span>
        </button>
        <main className="relative min-w-0 flex-1">
          <Viewport />
        </main>
        <button
          type="button"
          title={propertiesOpen ? "Collapse properties" : "Expand properties"}
          onClick={() => setPropertiesOpen((v) => !v)}
          className="flex w-3.5 shrink-0 items-center justify-center bg-[#0f0b16] text-white/20 transition-colors hover:bg-white/5 hover:text-pink-300/70"
        >
          <span className="text-[8px]">{propertiesOpen ? "▸" : "◂"}</span>
        </button>
        <aside
          className="shrink-0 overflow-hidden border-l border-white/10 transition-[width] duration-150"
          style={{ width: propertiesOpen ? 288 : 0 }}
        >
          <div className="h-full w-[288px]">
            <PropertiesPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}
