import { useState } from "react";
import { socketActions } from "../socket/bridge.js";
import { useStore } from "../store/index.js";

export function WorkspacePicker() {
  const path = useStore((s) => s.workspacePath);
  const status = useStore((s) => s.workspaceStatus);
  const message = useStore((s) => s.workspaceMessage);
  const [value, setValue] = useState(
    path ?? "/Users/mia/Documents/Projects/dollhouse",
  );
  const [isGit, setIsGit] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    socketActions.setWorkspace(value.trim(), isGit);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-dollhouse-pink/80">
        Workspace
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="/path/to/repo or git url"
          className="flex-1 px-2 py-1.5 text-sm rounded-md bg-black/40 border border-white/10 focus:border-dollhouse-rose outline-none text-white placeholder-white/30"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm rounded-md bg-dollhouse-rose hover:bg-dollhouse-pink text-black font-medium"
          disabled={status === "loading"}
        >
          {status === "loading" ? "…" : "Load"}
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-white/60">
        <input
          type="checkbox"
          checked={isGit}
          onChange={(e) => setIsGit(e.target.checked)}
        />{" "}
        clone as git repo
      </label>
      {status === "ready" && (
        <div className="text-xs text-emerald-300">✓ {path}</div>
      )}
      {status === "error" && (
        <div className="text-xs text-rose-300">✗ {message}</div>
      )}
    </form>
  );
}
