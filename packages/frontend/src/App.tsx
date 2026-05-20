import { Hud } from "./hud/Hud.js";
import { useSocketBridge } from "./socket/bridge.js";
import { Scene } from "./three/Scene.js";

export default function App() {
  useSocketBridge();
  return (
    <div className="relative w-full h-full">
      <Scene />
      <Hud />
    </div>
  );
}
