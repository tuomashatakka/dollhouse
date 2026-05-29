import { Outlines } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ModelDocument, SceneNode } from "@dollhouse/shared";
import { createGeometry, createMaterial } from "../core/conversion.js";
import { resolveTexture } from "./textureLibrary.js";

type Triple = [number, number, number];

/** Convert a (possibly readonly) Vec3 into a fresh mutable tuple for R3F props. */
function triple(v: readonly [number, number, number]): Triple {
  return [v[0], v[1], v[2]];
}

/** Render context threaded through the node tree. */
interface RenderContext {
  /** Colour overrides keyed by a node's `metadata.tint`. */
  tints?: Record<string, string>;
  /** When true, meshes raycast and report clicks via `onSelectNode`. */
  selectable: boolean;
  /** Currently-selected node ids — drives selection outlines. */
  selectedIds?: ReadonlySet<string>;
  /** Selection callback; `additive` is true for shift / ctrl / cmd-click. */
  onSelectNode?: (id: string, additive: boolean) => void;
  /** Node names that should not render (and whose subtree is skipped). */
  hiddenNames?: ReadonlySet<string>;
}

interface TransformProps {
  name: string;
  position: Triple;
  rotation: Triple;
  scale: Triple;
  visible: boolean;
}

/**
 * Render a single {@link SceneNode}. Deliberately NOT memoised: the editor
 * mutates nodes in place, so this must re-run whenever its parent re-renders.
 */
function NodeRenderer({ node, ctx }: { node: SceneNode; ctx: RenderContext }) {
  if (ctx.hiddenNames?.has(node.name)) return null;
  const geometry = useMemo(
    () => (node.geometry ? createGeometry(node.geometry) : null),
    [node.geometry],
  );
  const material = useMemo(() => {
    if (!node.material) return null;
    const tintKey = typeof node.metadata?.tint === "string" ? node.metadata.tint : undefined;
    const override = tintKey ? ctx.tints?.[tintKey] : undefined;
    const def = override ? { ...node.material, color: override } : node.material;
    const mat = createMaterial(def);
    // Texture from the renderer's library, scaled per material.
    const texture = resolveTexture(def.texture);
    if (texture) {
      const cloned = texture.clone();
      cloned.needsUpdate = true;
      const scale = def.textureScale ?? [1, 1];
      cloned.repeat.set(scale[0], scale[1]);
      cloned.wrapS = THREE.RepeatWrapping;
      cloned.wrapT = THREE.RepeatWrapping;
      mat.map = cloned;
      mat.needsUpdate = true;
    }
    // Bump (depth) map, paired with the same texture-scale so the relief
    // tracks the colour map. Greyscale height field — light = raised.
    const bump = resolveTexture(def.bumpMap);
    if (bump) {
      const clonedBump = bump.clone();
      clonedBump.needsUpdate = true;
      const scale = def.textureScale ?? [1, 1];
      clonedBump.repeat.set(scale[0], scale[1]);
      clonedBump.wrapS = THREE.RepeatWrapping;
      clonedBump.wrapT = THREE.RepeatWrapping;
      mat.bumpMap = clonedBump;
      mat.bumpScale = def.bumpScale ?? 0.03;
      mat.needsUpdate = true;
    }
    if (def.flatShading) {
      mat.flatShading = true;
      mat.needsUpdate = true;
    }
    return mat;
  }, [node.material, node.metadata, ctx.tints]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
      if (material?.map) material.map.dispose();
      if (material?.bumpMap) material.bumpMap.dispose();
      material?.dispose();
    };
  }, [geometry, material]);

  const selected = ctx.selectedIds?.has(node.id) ?? false;
  const handleClick =
    ctx.selectable && !node.locked
      ? (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          ctx.onSelectNode?.(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
        }
      : undefined;

  const t = node.transform;
  const transformProps: TransformProps = {
    name: node.name,
    position: triple(t.position),
    rotation: triple(t.rotation),
    scale: triple(t.scale),
    visible: node.visible ?? true,
  };

  const children = node.children.map((child) => (
    <NodeRenderer key={child.id} node={child} ctx={ctx} />
  ));

  if (node.instances && geometry && material) {
    return (
      <InstancedNode
        node={node}
        geometry={geometry}
        material={material}
        transformProps={transformProps}
        onClick={handleClick}
      />
    );
  }

  if (geometry && material) {
    return (
      <mesh
        {...transformProps}
        userData={{ nodeId: node.id }}
        geometry={geometry}
        material={material}
        castShadow={node.castShadow ?? false}
        receiveShadow={node.receiveShadow ?? false}
        onClick={handleClick}
      >
        {selected && <Outlines thickness={0.035} color="#3fd8ff" />}
        {children}
      </mesh>
    );
  }

  return (
    <group {...transformProps} userData={{ nodeId: node.id }} onClick={handleClick}>
      {children}
    </group>
  );
}

/** Render an instanced-mesh node — one geometry stamped at many transforms. */
function InstancedNode({
  node,
  geometry,
  material,
  transformProps,
  onClick,
}: {
  node: SceneNode;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  transformProps: TransformProps;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const instances = node.instances ?? [];

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    instances.forEach((inst, i) => {
      position.set(inst.position[0], inst.position[1], inst.position[2]);
      euler.set(inst.rotation[0], inst.rotation[1], inst.rotation[2], "XYZ");
      quaternion.setFromEuler(euler);
      scale.set(inst.scale[0], inst.scale[1], inst.scale[2]);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instances.length]}
      {...transformProps}
      userData={{ nodeId: node.id }}
      castShadow={node.castShadow ?? false}
      receiveShadow={node.receiveShadow ?? false}
      onClick={onClick}
    />
  );
}

/** Public props for {@link ModelRenderer}. */
export interface ModelRendererProps {
  /** The document to render. */
  document: ModelDocument;
  /**
   * Editor-only cache-buster. This component is `memo`ised; pass
   * `EditorState.revision` so in-place document mutations still re-render.
   * Omit for static documents (e.g. the frontend's dolls).
   */
  revision?: number;
  /** Colour overrides keyed by a node's `metadata.tint`. */
  tints?: Record<string, string>;
  /** Enable click-to-select raycasting on every mesh. */
  selectable?: boolean;
  /** Selected node ids — selected meshes get a highlight outline. */
  selectedIds?: ReadonlySet<string>;
  /** Selection callback; `additive` is true for shift / ctrl / cmd-click. */
  onSelectNode?: (id: string, additive: boolean) => void;
  /** Called once with the rendered root group — use it to grab rig nodes. */
  onReady?: (root: THREE.Group) => void;
  /**
   * Names of nodes that should NOT render. Whole subtrees are skipped. Used by
   * the home page to hide the Front Wall + Roof for a cross-section view of
   * the running dollhouse, while the editor keeps everything visible.
   */
  hiddenNames?: ReadonlySet<string> | readonly string[];
}

function ModelRendererImpl({
  document,
  tints,
  selectable = false,
  selectedIds,
  onSelectNode,
  onReady,
  hiddenNames,
}: ModelRendererProps) {
  const ref = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    if (ref.current && onReady) onReady(ref.current);
  }, [onReady]);

  const hiddenSet = useMemo(() => {
    if (!hiddenNames) return undefined;
    return hiddenNames instanceof Set ? hiddenNames : new Set(hiddenNames);
  }, [hiddenNames]);

  const ctx = useMemo<RenderContext>(
    () => ({ tints, selectable, selectedIds, onSelectNode, hiddenNames: hiddenSet }),
    [tints, selectable, selectedIds, onSelectNode, hiddenSet],
  );

  const root = document.root;
  const t = root.transform;
  return (
    <group
      ref={ref}
      name={root.name}
      userData={{ nodeId: root.id }}
      position={triple(t.position)}
      rotation={triple(t.rotation)}
      scale={triple(t.scale)}
    >
      {root.children.map((child) => (
        <NodeRenderer key={child.id} node={child} ctx={ctx} />
      ))}
    </group>
  );
}

/**
 * Renders a {@link ModelDocument} as a React Three Fiber subtree. Canvas-agnostic
 * — drop it inside any `<Canvas>`. Consumed by the editor viewport and by the
 * frontend to render the dollhouse and dolls.
 */
export const ModelRenderer = memo(ModelRendererImpl);
