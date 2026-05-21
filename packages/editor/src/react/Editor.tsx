import { Outliner, PropertiesPanel, Toolbar } from "./panels.js";
import { Viewport } from "./Viewport.js";

/**
 * Full editor UI — toolbar, outliner, viewport and properties panel. Mount it
 * inside an {@link EditorProvider}.
 */
export function Editor() {
  return (
    <div className="flex h-full w-full flex-col bg-[#0f0b16] text-white">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-white/10">
          <Outliner />
        </aside>
        <main className="relative min-w-0 flex-1">
          <Viewport />
        </main>
        <aside className="w-72 shrink-0 border-l border-white/10">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}
