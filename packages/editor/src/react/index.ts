// React / R3F layer — the editor UI and the canvas-agnostic ModelRenderer.
export { Editor } from "./Editor.js";
export { EditorProvider, useEditor } from "./EditorProvider.js";
export { ModelRenderer, type ModelRendererProps } from "./ModelRenderer.js";
export { Outliner, PropertiesPanel, Toolbar } from "./panels.js";
export { SelectionBounds } from "./SelectionBounds.js";
export { TransformGizmo } from "./TransformGizmo.js";
export {
  registerTexture,
  resolveTexture,
  setDefaultTextureLibrary,
  type TextureLibrary,
} from "./textureLibrary.js";
export { Viewport } from "./Viewport.js";
export { XRayOccluder } from "./XRayOccluder.js";
