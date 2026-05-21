import { Editor, EditorProvider } from "@dollhouse/editor";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { loadEditorDocument } from "./three/model.js";

/** The /editor route — the dollhouse / doll model editor. */
export function EditorPage() {
  // A fresh copy so editor mutations don't touch the live home-page scene;
  // changes reach the frontend only via Save (localStorage).
  const document = useMemo(() => loadEditorDocument(), []);
  return (
    <div className="relative h-full w-full">
      <EditorProvider initialDocument={document}>
        <Editor />
      </EditorProvider>
      <Link
        to="/"
        className="absolute bottom-3 left-3 z-50 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white/80 hover:bg-black/80"
      >
        ← Back to dollhouse
      </Link>
    </div>
  );
}
