/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Trading-desk dark palette.
        panel: "#111827",
        panelLight: "#1f2937",
        cheap: "#22c55e",
        rich: "#ef4444",
        accent: "#38bdf8",
      },
    },
  },
  plugins: [],
};
