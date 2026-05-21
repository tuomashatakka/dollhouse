import * as THREE from "three";
import type { GeometryDef, MaterialDef } from "@dollhouse/shared";

/**
 * Build a `THREE.BufferGeometry` from a {@link GeometryDef}. The caller owns
 * the result and is responsible for `.dispose()`.
 */
export function createGeometry(def: GeometryDef): THREE.BufferGeometry {
  switch (def.type) {
    case "box":
      return new THREE.BoxGeometry(def.width, def.height, def.depth);
    case "plane":
      return new THREE.PlaneGeometry(def.width, def.height);
    case "sphere":
      return new THREE.SphereGeometry(
        def.radius,
        def.widthSegments ?? 24,
        def.heightSegments ?? 16,
        def.phiStart ?? 0,
        def.phiLength ?? Math.PI * 2,
        def.thetaStart ?? 0,
        def.thetaLength ?? Math.PI,
      );
    case "capsule":
      return new THREE.CapsuleGeometry(
        def.radius,
        def.length,
        def.capSegments ?? 4,
        def.radialSegments ?? 8,
      );
    case "cylinder":
      return new THREE.CylinderGeometry(
        def.radiusTop,
        def.radiusBottom,
        def.height,
        def.radialSegments ?? 16,
      );
    case "cone":
      return new THREE.ConeGeometry(def.radius, def.height, def.radialSegments ?? 16);
    case "buffer": {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(def.attributes.position, 3),
      );
      if (def.attributes.normal) {
        geometry.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(def.attributes.normal, 3),
        );
      }
      if (def.attributes.uv) {
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(def.attributes.uv, 2));
      }
      if (def.index) geometry.setIndex(def.index);
      if (!def.attributes.normal) geometry.computeVertexNormals();
      return geometry;
    }
  }
}

function resolveSide(side: MaterialDef["side"]): THREE.Side {
  if (side === "double") return THREE.DoubleSide;
  if (side === "back") return THREE.BackSide;
  return THREE.FrontSide;
}

/**
 * Build a `THREE.MeshStandardMaterial` from a {@link MaterialDef}. The caller
 * owns the result and is responsible for `.dispose()`.
 */
export function createMaterial(def: MaterialDef): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color),
    roughness: def.roughness ?? 0.7,
    metalness: def.metalness ?? 0,
    transparent: def.transparent ?? false,
    opacity: def.opacity ?? 1,
    side: resolveSide(def.side),
  });
  if (def.emissive) material.emissive = new THREE.Color(def.emissive);
  return material;
}
