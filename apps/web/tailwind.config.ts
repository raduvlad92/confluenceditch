import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#e0e9ff",
          500: "#4361ee",
          600: "#3451d1",
          700: "#2940b8",
        },
      },
    },
  },
  plugins: [],
}

export default config
