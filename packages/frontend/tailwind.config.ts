import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        dollhouse: {
          pink: "#f7c6d9",
          rose: "#e89bb5",
          plum: "#9b5176",
          walnut: "#5a3a26",
          cream: "#fff5ec",
        },
      },
      fontFamily: {
        display: ["'Pixelify Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
