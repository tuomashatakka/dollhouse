// Pink Victorian palette — drives the procedural dollhouse aesthetic.
// Matches the reference asset (assets/dollhouse.webp).

export const PALETTE = {
  exteriorPink: "#f1aac4",
  wallPinkLight: "#f7c6d9",
  wallPinkInterior: "#fde0ec",
  trim: "#e89bb5",
  roofRose: "#e07ba0",
  roofShingle: "#c95f88",
  floorWalnut: "#5a3a26",
  walnut: "#5a3a26",
  floorTileLight: "#fbe4ec",
  floorTileDark: "#d98ab1",
  white: "#fafafa",
  cream: "#fff5ec",
  glass: "#bcd9e8",
  wallpaperTeal: "#3f7780",
  accentMint: "#9ed6c9",
  accentLavender: "#c3aee0",
  bedSpread: "#f6c3d0",
  ground: "#dec6d9",
  // Doll colors keyed by agent type:
  dollClaude: "#d29bff", // Claude purple
  dollGemini: "#7fb8ff", // Google blue
  dollOpencode: "#76e3a1", // emerald
  dollOllama: "#ffce6b", // saffron
  dollApfel: "#a8b6c3", // silver
  dollEcho: "#fff3a3", // butter
  skin: "#fadcc8",
  hair: "#3a2a23",
} as const;

export type DollColorKey =
  | "dollClaude"
  | "dollGemini"
  | "dollOpencode"
  | "dollOllama"
  | "dollApfel"
  | "dollEcho";

export const AGENT_COLOR: Record<string, DollColorKey> = {
  "claude-code": "dollClaude",
  "gemini-cli": "dollGemini",
  opencode: "dollOpencode",
  ollama: "dollOllama",
  apfel: "dollApfel",
  echo: "dollEcho",
};
