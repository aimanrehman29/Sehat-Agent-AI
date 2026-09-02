/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
      colors: {
        brand: {
          // ── Core brand tokens ──
          forest: "#015D67", // Primary headings / dark accents
          kelly: "#00ACB1", // Primary actions / buttons / user bubbles
          mint: "#87E4DB", // System loading / active states
          pistachio: "#CAF0C1", // Light icon backgrounds / badges
          // ── Neutrals & tints (backgrounds, borders, cards) ──
          g88: "#1F6C75",
          g72: "#47878E",
          g56: "#70A2A7",
          g40: "#99BDC1",
          g32: "#ADC9CD",
          g24: "#C2D7DA",
          g16: "#D5E4E6",
          g10: "#E5EE2F",
          g8: "#EBF2F3",
          g6: "#F0F5F6",
          g4: "#F5F9F9",
          g2: "#FAFCFC",
        },
      },
    },
  },
  plugins: [],
};
