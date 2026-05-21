import { ModelRenderer } from "@dollhouse/editor";
import { useMemo } from "react";
import { loadDollhouseDocument } from "./model.js";

/**
 * The dollhouse — now data-driven. Geometry comes from a DollhouseDocument
 * (authored / edited in the @dollhouse/editor package) and is rendered through
 * the shared <ModelRenderer>. The procedural builder lives in
 * @dollhouse/shared's `buildDollhouseDocument`.
 */
export function Dollhouse() {
  const document = useMemo(() => loadDollhouseDocument(), []);
  return <ModelRenderer document={document} />;
}
