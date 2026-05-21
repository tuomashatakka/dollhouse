import { buildDollDocument, buildDollhouseDocument, type ModelDocument } from "@dollhouse/shared";
import { cloneDocument, loadFromStorage } from "@dollhouse/editor";

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

/** A fresh, independent copy of the dollhouse for the editor to mutate. */
export function loadEditorDocument(): ModelDocument {
  return cloneDocument(loadDollhouseDocument());
}
