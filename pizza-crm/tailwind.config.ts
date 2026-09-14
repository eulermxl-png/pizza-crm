import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        rondaCream: "var(--text-cream)",
        rondaAccent: "var(--accent)",
        rondaAccentHover: "var(--accent-hover)",
        // Superficies y bordes cálidos (dark theme)
        surface: "var(--surface-1)",
        surface2: "var(--surface-2)",
        surface3: "var(--surface-3)",
        line: "var(--line)",
        lineStrong: "var(--line-strong)",
        // Texto secundario / terciario
        muted: "var(--muted)",
        muted2: "var(--muted-2)",
        // Marca (terracota). amber/teal/violet se dejan como paleta de Tailwind.
        brand: "var(--brand)",
        brandHover: "var(--brand-hover)",
      },
    },
  },
  plugins: [],
};
export default config;
