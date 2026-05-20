import { useState } from "react";
import { socketActions } from "../socket/bridge.js";
import { useStore } from "../store/index.js";

export function MasterChat() {
  const [value, setValue] = useState("");
  const wsReady = useStore((s) => s.workspaceStatus) === "ready";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v || !wsReady) return;
    socketActions.submitMasterTask(v);
    setValue("");
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-dollhouse-pink/80">
        Master task
      </div>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        placeholder={
          wsReady
            ? "describe what you want the agents to do… (⌘/Ctrl+Enter)"
            : "set a workspace first"
        }
        disabled={!wsReady}
        className="w-full px-2 py-1.5 text-sm rounded-md bg-black/40 border border-white/10 focus:border-dollhouse-rose outline-none text-white placeholder-white/30 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!wsReady || !value.trim()}
        className="w-full px-3 py-1.5 text-sm rounded-md bg-dollhouse-plum hover:bg-dollhouse-rose text-white font-medium disabled:opacity-40"
      >
        Delegate ✨
      </button>
    </form>
  );
}
