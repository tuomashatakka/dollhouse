import { buildDollDocument, buildDollhouseDocument, ModelRenderer } from "@dollhouse/editor";
import type { ModelDocument } from "@dollhouse/shared";
import { Grid, OrbitControls, Sky } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const MODELS: { label: string; kind: ModelDocument["kind"]; build: () => ModelDocument }[] = [
  { label: "Dollhouse", kind: "dollhouse", build: buildDollhouseDocument },
  { label: "Doll", kind: "doll", build: buildDollDocument },
];

/** Read-only preview of the canonical assets/models — no editor UI. */
export function PreviewPage() {
  const [activeKind, setActiveKind] = useState<ModelDocument["kind"]>("dollhouse");

  const docs = useMemo(
    () => Object.fromEntries(MODELS.map((m) => [m.kind, m.build()])) as Record<ModelDocument["kind"], ModelDocument>,
    [],
  );

  const doc = docs[activeKind];

  return (
    <div className="relative h-full w-full bg-[#0f0b16]">
      <Canvas shadows camera={{ position: [13, 9, 17], fov: 38 }} gl={{ antialias: true }}>
        <Sky sunPosition={[40, 20, 30]} turbidity={6} rayleigh={2} mieCoefficient={0.005} mieDirectionalG={0.8} />
        <ambientLight intensity={0.55} color="#fff0e6" />
        <directionalLight
          castShadow
          position={[8, 14, 9]}
          intensity={1.35}
          color="#fff5e6"
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-10, 6, 4]} intensity={0.3} color="#ffd5e2" />
        <Grid
          args={[60, 60]}
          cellSize={1}
          cellThickness={0.6}
          cellColor="#3a2f48"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#6b5685"
          infiniteGrid
          fadeDistance={60}
          fadeStrength={1.5}
        />
        <ModelRenderer document={doc} />
        <OrbitControls makeDefault target={[0, 3, 0]} minDistance={3} maxDistance={40} />
      </Canvas>

      {/* Tab strip */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-black/60 p-1 backdrop-blur-sm">
        {MODELS.map((m) => (
          <button
            key={m.kind}
            type="button"
            onClick={() => setActiveKind(m.kind)}
            className={
              "px-3 py-1 rounded-full text-xs font-display transition-colors " +
              (activeKind === m.kind
                ? "bg-pink-400/30 border border-pink-200/40 text-pink-100"
                : "text-white/60 hover:text-white/90")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Bottom nav */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
        <Link
          to="/"
          className="rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white/80 hover:bg-black/80"
        >
          ← Back to dollhouse
        </Link>
        <Link
          to="/editor"
          className="rounded-full border border-pink-200/30 bg-pink-400/20 px-3 py-1.5 text-xs text-pink-100 hover:bg-pink-400/35"
        >
          Open in Editor
        </Link>
      </div>
    </div>
  );
}
