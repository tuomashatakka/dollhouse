// Material definitions. Maps onto a three.js MeshStandardMaterial (PBR).

/** Which faces of a surface are rendered. */
export type MaterialSide = "front" | "back" | "double";

/** PBR material definition for a mesh node. */
export interface MaterialDef {
  /** Base colour as a CSS hex string, e.g. "#f1aac4". */
  color: string;
  /** Surface micro-roughness, 0 (mirror) to 1 (fully diffuse). */
  roughness?: number;
  /** Metalness, 0 (dielectric) to 1 (metal). */
  metalness?: number;
  /** Optional self-illumination colour (hex). */
  emissive?: string;
  /** Opacity, 0 to 1. Only honoured when `transparent` is true. */
  opacity?: number;
  /** Whether the material blends with what is behind it. */
  transparent?: boolean;
  /** Which faces to render. Defaults to "front". */
  side?: MaterialSide;
}

/** A sensible fallback material — opaque mid-roughness grey. */
export const DEFAULT_MATERIAL: MaterialDef = {
  color: "#cccccc",
  roughness: 0.7,
  metalness: 0,
};
