import { DOLLHOUSE_SCHEMA_VERSION, type ModelDocument } from "@dollhouse/shared";

/** localStorage keys, shared between the editor and the frontend renderer. */
export const STORAGE_KEY: Record<ModelDocument["kind"], string> = {
  dollhouse: "dollhouse:doc:dollhouse",
  doll: "dollhouse:doc:doll",
};

/** Deep-copy a document. */
export function cloneDocument(doc: ModelDocument): ModelDocument {
  return structuredClone(doc);
}

/** Serialize a document to pretty-printed JSON. */
export function serializeDocument(doc: ModelDocument): string {
  return JSON.stringify(doc, null, 2);
}

function migrate(doc: ModelDocument): ModelDocument {
  // Schema v1 is current — no migrations needed yet. Future versions branch
  // on doc.schemaVersion here.
  return doc;
}

/** Parse and validate a document from JSON. Throws on malformed input. */
export function deserializeDocument(json: string): ModelDocument {
  const parsed = JSON.parse(json) as Partial<ModelDocument>;
  if (!parsed || (parsed.kind !== "dollhouse" && parsed.kind !== "doll")) {
    throw new Error("Not a valid dollhouse model document");
  }
  if (!parsed.root || typeof parsed.root !== "object") {
    throw new Error("Model document is missing a root node");
  }
  if (typeof parsed.schemaVersion !== "number") {
    parsed.schemaVersion = DOLLHOUSE_SCHEMA_VERSION;
  }
  return migrate(parsed as ModelDocument);
}

/** Read a saved document from localStorage, or null when absent / invalid. */
export function loadFromStorage(kind: ModelDocument["kind"]): ModelDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY[kind]);
    return raw ? deserializeDocument(raw) : null;
  } catch {
    return null;
  }
}

/** Persist a document to localStorage. */
export function saveToStorage(doc: ModelDocument): void {
  try {
    localStorage.setItem(STORAGE_KEY[doc.kind], serializeDocument(doc));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Trigger a browser download of the document as a `.json` file. */
export function downloadDocument(doc: ModelDocument, filename = `${doc.kind}.json`): void {
  const blob = new Blob([serializeDocument(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
