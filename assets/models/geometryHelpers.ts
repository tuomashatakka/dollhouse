import * as THREE from "three";
import type { GeometryDef } from "@dollhouse/shared";

/**
 * Bake any `THREE.BufferGeometry` into a `buffer` {@link GeometryDef} —
 * extracts position / normal / uv attributes and the index. Used to commit
 * shape-with-hole extrusions and other one-off geometries into the document
 * without depending on three.js at render time.
 */
export function bakeBufferGeometry(geometry: THREE.BufferGeometry): GeometryDef {
  geometry.computeVertexNormals();
  const positionAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normalAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
  const indexAttr = geometry.getIndex();
  return {
    type: "buffer",
    attributes: {
      position: Array.from(positionAttr.array as Float32Array),
      normal: normalAttr ? Array.from(normalAttr.array as Float32Array) : undefined,
      uv: uvAttr ? Array.from(uvAttr.array as Float32Array) : undefined,
    },
    index: indexAttr ? Array.from(indexAttr.array as ArrayLike<number>) : undefined,
  };
}

interface WallOpenings {
  /** Local-X centre of the door cutout, in the wall's plane (relative to the wall's middle). */
  x: number;
  /** Door width. */
  width: number;
  /** Door height (from the bottom of the wall to the top of the opening). */
  height: number;
  /** Arch top — when > 0, the doorway has a rounded top of this radius. */
  archRadius?: number;
}

/**
 * Build a flat rectangular wall with one or more doorway cutouts, extruded
 * along its thickness. The wall lies in the XY plane (Z = thickness axis),
 * origin at the wall's centre on the floor (y=0).
 */
export function buildWallWithDoors(
  width: number,
  height: number,
  thickness: number,
  doors: WallOpenings[],
): GeometryDef {
  const shape = new THREE.Shape();
  const halfW = width / 2;
  shape.moveTo(-halfW, 0);
  shape.lineTo(halfW, 0);
  shape.lineTo(halfW, height);
  shape.lineTo(-halfW, height);
  shape.lineTo(-halfW, 0);

  for (const door of doors) {
    const hole = new THREE.Path();
    const dw = door.width;
    const dh = door.height;
    const r = Math.max(0, Math.min(door.archRadius ?? 0, dw / 2));
    const straightTop = dh - r;
    hole.moveTo(door.x - dw / 2, 0);
    hole.lineTo(door.x + dw / 2, 0);
    hole.lineTo(door.x + dw / 2, straightTop);
    if (r > 0) {
      // Half-circle cap from right side, through top, to left side.
      hole.absarc(door.x, straightTop, r, 0, Math.PI, false);
    } else {
      hole.lineTo(door.x + dw / 2, dh);
      hole.lineTo(door.x - dw / 2, dh);
    }
    hole.lineTo(door.x - dw / 2, 0);
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 16,
  });
  // Centre along the thickness axis.
  geometry.translate(0, 0, -thickness / 2);
  return bakeBufferGeometry(geometry);
}

interface FloorHole {
  /** Centre X of the rectangular hole, in floor-local coords. */
  x: number;
  /** Centre Z of the hole. */
  z: number;
  /** Hole width along X. */
  width: number;
  /** Hole depth along Z. */
  depth: number;
}

/**
 * Build a horizontal floor slab (lies in XZ plane) with one or more rectangular
 * cutouts — used where a staircase comes up through the floor above.
 */
export function buildFloorWithHoles(
  width: number,
  depth: number,
  thickness: number,
  holes: FloorHole[],
): GeometryDef {
  // Author the shape in 2D (XY), then rotate the resulting extrusion so the
  // shape sits in the XZ plane and the extrusion goes along +Y.
  const shape = new THREE.Shape();
  const halfW = width / 2;
  const halfD = depth / 2;
  shape.moveTo(-halfW, -halfD);
  shape.lineTo(halfW, -halfD);
  shape.lineTo(halfW, halfD);
  shape.lineTo(-halfW, halfD);
  shape.lineTo(-halfW, -halfD);

  for (const hole of holes) {
    const path = new THREE.Path();
    const hw = hole.width / 2;
    const hd = hole.depth / 2;
    path.moveTo(hole.x - hw, hole.z - hd);
    path.lineTo(hole.x + hw, hole.z - hd);
    path.lineTo(hole.x + hw, hole.z + hd);
    path.lineTo(hole.x - hw, hole.z + hd);
    path.lineTo(hole.x - hw, hole.z - hd);
    shape.holes.push(path);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  // Lift extrusion to lie above y=0, then rotate so the shape lies in XZ.
  geometry.rotateX(-Math.PI / 2);
  // After rotateX, the original +Z extrusion axis becomes -Y; shift up so the
  // slab's bottom sits at y=0.
  geometry.translate(0, thickness, 0);
  return bakeBufferGeometry(geometry);
}

/**
 * Build a low-poly conifer (cone foliage + cylinder trunk) as a single buffer
 * geometry — flat-shaded for a stylised look.
 */
export function buildLowPolyTree(
  trunkColor: string,
  foliageColor: string,
): { trunk: GeometryDef; foliage: GeometryDef } {
  void trunkColor;
  void foliageColor;
  const trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6);
  trunk.translate(0, 0.3, 0);
  const cone1 = new THREE.ConeGeometry(0.55, 0.9, 7);
  cone1.translate(0, 0.95, 0);
  const cone2 = new THREE.ConeGeometry(0.42, 0.7, 7);
  cone2.translate(0, 1.4, 0);
  const cone3 = new THREE.ConeGeometry(0.28, 0.5, 7);
  cone3.translate(0, 1.8, 0);
  // Merge the foliage cones via raw position concat.
  const positions: number[] = [];
  const normals: number[] = [];
  for (const g of [cone1, cone2, cone3]) {
    g.computeVertexNormals();
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const norm = g.getAttribute("normal") as THREE.BufferAttribute;
    const ix = g.getIndex();
    if (ix) {
      const idx = ix.array as ArrayLike<number>;
      for (let i = 0; i < idx.length; i++) {
        const v = idx[i] as number;
        positions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        normals.push(norm.getX(v), norm.getY(v), norm.getZ(v));
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      }
    }
  }
  const foliage: GeometryDef = {
    type: "buffer",
    attributes: { position: positions, normal: normals },
  };
  return { trunk: bakeBufferGeometry(trunk), foliage };
}
