// Geometry definitions. The parametric variants map 1:1 onto the matching
// three.js geometry constructors; `buffer` carries raw vertex data for shapes
// that cannot be expressed parametrically (e.g. the dollhouse roof gable).

/** Discriminated union describing a single mesh's geometry. */
export type GeometryDef =
  | { type: "box"; width: number; height: number; depth: number }
  | { type: "plane"; width: number; height: number }
  | {
      type: "sphere";
      radius: number;
      widthSegments?: number;
      heightSegments?: number;
      phiStart?: number;
      phiLength?: number;
      thetaStart?: number;
      thetaLength?: number;
    }
  | {
      type: "capsule";
      radius: number;
      length: number;
      capSegments?: number;
      radialSegments?: number;
    }
  | {
      type: "cylinder";
      radiusTop: number;
      radiusBottom: number;
      height: number;
      radialSegments?: number;
    }
  | { type: "cone"; radius: number; height: number; radialSegments?: number }
  | {
      type: "buffer";
      attributes: { position: number[]; normal?: number[]; uv?: number[] };
      index?: number[];
    };

/** Discriminant literals for {@link GeometryDef}. */
export type GeometryType = GeometryDef["type"];

/** All parametric (non-`buffer`) geometry discriminants. */
export const PARAMETRIC_GEOMETRY_TYPES: GeometryType[] = [
  "box",
  "plane",
  "sphere",
  "capsule",
  "cylinder",
  "cone",
];
