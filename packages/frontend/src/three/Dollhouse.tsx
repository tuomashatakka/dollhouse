import { ModelRenderer } from "@dollhouse/editor";
import { useMemo } from "react";
import { loadDollhouseDocument } from "./model.js";

/**
 * Names that should NOT render on the live home page. The Front Wall + Roof
 * are hidden so the camera can see straight into every room (cross-section
 * style) while the dolls walk between them. The /editor route renders the full
 * dollhouse — these toggles only apply here.
 */
const HOME_PAGE_HIDDEN = ["Front Wall", "Roof"] as const;

/**
 * The dollhouse — data-driven via `DollhouseDocument`. Geometry, materials and
 * world coordinates all come from `@dollhouse/editor`'s `buildDollhouseDocument`
 * (or a localStorage-saved edit) and render through the shared `<ModelRenderer>`.
 */
export function Dollhouse() {
  const document = useMemo(() => loadDollhouseDocument(), []);
  return <ModelRenderer document={document} hiddenNames={HOME_PAGE_HIDDEN} />;
}
