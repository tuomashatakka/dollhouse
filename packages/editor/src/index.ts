// @dollhouse/editor — doll & dollhouse model editor.
//
//   core/   framework-agnostic: document model, commands, history, selection,
//           three.js conversion and serialization.
//   react/  React Three Fiber layer: the <ModelRenderer> the frontend consumes,
//           plus the full <Editor> UI.
export * from "./core/index.js";
export * from "./react/index.js";
