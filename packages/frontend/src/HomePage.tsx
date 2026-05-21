import { Link } from "react-router-dom";
import { Hud } from "./hud/Hud.js";
import { useSocketBridge } from "./socket/bridge.js";
import { Scene } from "./three/Scene.js";

/** The live dollhouse — the 3D scene plus the agent HUD. */
export function HomePage() {
  useSocketBridge();
  return (
    <div className="relative w-full h-full">
      <Scene />
      <Hud />
      <Link
        to="/editor"
        className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto px-3 py-1.5 rounded-full bg-pink-400/30 border border-pink-200/40 text-pink-100 text-xs font-display hover:bg-pink-400/50"
      >
        Open Model Editor
      </Link>
    </div>
  );
}
