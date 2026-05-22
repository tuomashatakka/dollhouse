import { Editor, EditorProvider } from "@dollhouse/editor";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { loadEditorDocument, loadLastEditedKind } from "./three/model.js";

/** The /editor route — the dollhouse / doll model editor. */
export function EditorPage() {
  // Resume whichever model was last open; fresh copy so mutations don't
  // touch the live home-page scene — changes land via Save (localStorage).
  const document = useMemo(() => loadEditorDocument(loadLastEditedKind()), []);
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
