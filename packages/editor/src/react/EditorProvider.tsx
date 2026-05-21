import { createContext, useContext, useEffect, useReducer, useState } from "react";
import type { ReactNode } from "react";
import type { ModelDocument } from "@dollhouse/shared";
import { EditorState } from "../core/EditorState.js";

const EditorContext = createContext<EditorState | null>(null);

/** Provides a single {@link EditorState} instance to the React tree. */
export function EditorProvider({
  initialDocument,
  children,
}: {
  initialDocument: ModelDocument;
  children: ReactNode;
}) {
  const [editor] = useState(() => new EditorState(initialDocument));
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}

/**
 * Access the {@link EditorState} and subscribe the calling component to its
 * signals — the component re-renders on any document / selection / mode change.
 *
 * The subscription lives here (not in the provider) because a provider holding
 * state cannot re-render a referentially-stable `children` element; each
 * consumer must subscribe itself.
 */
export function useEditor(): EditorState {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditor must be used within <EditorProvider>");
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = [
      editor.signals.documentChanged.add(() => forceRender()),
      editor.signals.selectionChanged.add(() => forceRender()),
      editor.signals.toolChanged.add(() => forceRender()),
    ];
    return () => {
      for (const off of unsubscribe) off();
    };
  }, [editor]);
  return editor;
}
