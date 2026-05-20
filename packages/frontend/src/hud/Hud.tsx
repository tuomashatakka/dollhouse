import { useStore } from "../store/index.js";
import { AgentTabs } from "./AgentTabs.js";
import { DelegatorPlanView } from "./DelegatorPlanView.js";
import { MasterChat } from "./MasterChat.js";
import { WorkspacePicker } from "./WorkspacePicker.js";

export function Hud() {
  const connected = useStore((s) => s.connected);
  return (
    <div className="absolute inset-0 pointer-events-none z-10 p-4 flex gap-4">
      {/* left rail — workspace + master chat */}
      <div className="pointer-events-auto w-[320px] flex flex-col gap-4">
        <Header connected={connected} />
        <Panel>
          <WorkspacePicker />
        </Panel>
        <Panel>
          <MasterChat />
        </Panel>
        <Panel>
          <DelegatorPlanView />
        </Panel>
      </div>

      {/* spacer for the 3D canvas behind */}
      <div className="flex-1" />

      {/* right rail — agent terminals */}
      <div className="pointer-events-auto w-[480px] flex flex-col gap-4">
        <Panel className="flex-1 min-h-0">
          <AgentTabs />
        </Panel>
      </div>
    </div>
  );
}

function Header({ connected }: { connected: boolean }) {
  return (
    <div className="rounded-xl border border-dollhouse-rose/40 bg-black/60 backdrop-blur p-3 flex items-center gap-3">
      <span className="text-2xl">🏠</span>
      <div className="flex-1">
        <div className="text-base font-bold text-dollhouse-pink leading-tight">
          DollhouseDev
        </div>
        <div className="text-[10px] uppercase tracking-wide text-white/50">
          spatial multi-agent dev
        </div>
      </div>
      <span
        className={`h-2 w-2 rounded-full ${
          connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse"
        }`}
        title={connected ? "connected" : "disconnected"}
      />
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-black/55 backdrop-blur p-3 ${className}`}
    >
      {children}
    </div>
  );
}
