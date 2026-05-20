import { ROOM_COORDS } from "@dollhouse/shared";
import { useStore } from "../store/index.js";

export function DelegatorPlanView() {
  const plan = useStore((s) => s.lastPlan);
  if (!plan) {
    return (
      <div className="text-xs text-white/40 italic">
        no plan yet — the delegator's chat output will appear here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-dollhouse-pink/80">
        Last plan
      </div>
      <div className="text-xs text-white/80 italic">{plan.plan}</div>
      <ul className="space-y-1">
        {plan.tasks.map((t, i) => (
          <li
            key={i}
            className="text-xs flex items-center gap-2 bg-black/30 px-2 py-1 rounded-md border border-white/5"
          >
            <span className="text-dollhouse-pink">{t.agentType}</span>
            <span className="text-white/60">→</span>
            <span className="text-amber-200">
              {ROOM_COORDS[t.assignedRoom].label}
            </span>
            <span className="text-white/40 truncate ml-auto max-w-[180px]">
              {t.subtask}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
