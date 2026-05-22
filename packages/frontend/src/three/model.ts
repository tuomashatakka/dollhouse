import type { ModelDocument } from "@dollhouse/shared";
import {
  buildDollDocument,
  buildDollhouseDocument,
  cloneDocument,
  loadFromStorage,
} from "@dollhouse/editor";

// Module-level caches: every doll shares one doc instance, and the dollhouse is
// built once. Editor saves land in localStorage and are picked up on reload.
let dollhouseCache: ModelDocument | null = null;
let dollCache: ModelDocument | null = null;

/** The dollhouse document the frontend renders (saved edits, else the default). */
export function loadDollhouseDocument(): ModelDocument {
  if (!dollhouseCache) {
    dollhouseCache = loadFromStorage("dollhouse") ?? buildDollhouseDocument();
  }
  return dollhouseCache;
}

/** The doll document the frontend renders for every agent. */
export function loadDollDocument(): ModelDocument {
  if (!dollCache) {
    dollCache = loadFromStorage("doll") ?? buildDollDocument();
  }
  return dollCache;
}

const LAST_EDITED_KIND_KEY = "dollhouse:editor:lastKind";

/** Remember which model was last open in the editor. */
export function saveLastEditedKind(kind: ModelDocument["kind"]): void {
  try {
    localStorage.setItem(LAST_EDITED_KIND_KEY, kind);
  } catch {
    /* storage unavailable */
  }
}

/** The kind of model last open in the editor, defaulting to "dollhouse". */
export function loadLastEditedKind(): ModelDocument["kind"] {
  try {
    const raw = localStorage.getItem(LAST_EDITED_KIND_KEY);
    if (raw === "doll" || raw === "dollhouse") return raw;
  } catch {
    /* storage unavailable */
  }
  return "dollhouse";
}

/** A fresh, independent copy of the given model for the editor to mutate. */
export function loadEditorDocument(kind: ModelDocument["kind"] = "dollhouse"): ModelDocument {
  return cloneDocument(kind === "doll" ? loadDollDocument() : loadDollhouseDocument());
}
