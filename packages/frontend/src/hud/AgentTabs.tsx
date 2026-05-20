import clsx from "clsx";
import { useEffect } from "react";
import { ROOM_COORDS } from "@dollhouse/shared";
import { socketActions } from "../socket/bridge.js";
import { useStore } from "../store/index.js";
import { Terminal } from "./Terminal.js";

export function AgentTabs() {
  const agents = useStore((s) => s.agents);
  const activeId = useStore((s) => s.activeAgentId);
  const setActive = useStore((s) => s.setActiveAgent);

  const list = Object.values(agents);
  const active = activeId ? agents[activeId] : null;

  // Auto-activate the first agent when none is selected.
  useEffect(() => {
    if (!activeId && list.length > 0) setActive(list[0]!.id);
  }, [activeId, list, setActive]);

  if (list.length === 0) {
    return (
      <div className="text-xs text-white/40 italic">
        no agents running. submit a task to spawn dolls.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[260px] gap-2">
      {/* tab bar */}
      <div className="flex gap-1 flex-wrap">
        {list.map((a) => {
          const isActive = a.id === activeId;
          return (
            <button
              key={a.id}
              onClick={() => setActive(a.id)}
              className={clsx(
                "group flex items-center gap-1.5 px-2 py-1 rounded-t-md text-[11px] font-mono border-b-2 transition",
                isActive
                  ? "bg-black/70 border-dollhouse-pink text-white"
                  : "bg-black/30 border-transparent text-white/60 hover:text-white",
              )}
              title={`${a.label} → ${ROOM_COORDS[a.room].label}`}
            >
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  a.status === "working" && "bg-emerald-400 animate-pulse",
                  a.status === "walking" && "bg-amber-400",
                  a.status === "idle" && "bg-white/30",
                  a.status === "exited" && "bg-rose-400",
                )}
              />
              <span className="text-dollhouse-pink">{a.type}</span>
              <span className="text-white/30">·</span>
              <span className="text-amber-200">{ROOM_COORDS[a.room].label}</span>
              {a.status !== "exited" && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    socketActions.killAgent(a.id);
                  }}
                  className="ml-1 px-1 rounded text-rose-300 hover:bg-rose-500/30 text-[10px]"
                >
                  ✕
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* terminals — one per agent, hidden via CSS to preserve scrollback */}
      <div className="flex-1 relative rounded-md border border-white/10 overflow-hidden min-h-[200px] bg-[#100a14]">
        {list.map((a) => (
          <div key={a.id} className="absolute inset-0">
            <Terminal agentId={a.id} visible={a.id === activeId} />
          </div>
        ))}
      </div>

      {/* status strip */}
      {active && (
        <div className="text-[10px] text-white/40 flex gap-3 px-1">
          <span>agent: <span className="text-white/70">{active.id}</span></span>
          {active.pid && <span>pid: {active.pid}</span>}
          <span>status: <span className="text-white/70">{active.status}</span></span>
          <span>room: <span className="text-amber-200/80">{ROOM_COORDS[active.room].label}</span></span>
        </div>
      )}
    </div>
  );
}
