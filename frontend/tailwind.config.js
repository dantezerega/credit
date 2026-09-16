/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Daylight instrument palette: cool paper, navy ink, a diverging
        // teal/rose pair for the only axis that matters here (cheap vs rich).
        ground: "#EAEEF3",
        surface: "#FFFFFF",
        raised: "#F4F7FA",
        ink: "#1B2735",
        muted: "#61738A",
        faint: "#8A99AC",
        line: "#D6DEE7",
        hair: "#E6EBF1",
        // Cheap = trades wide of its curve. Text-weight and graphic-weight.
        cheap: "#0B7A6E",
        cheapBright: "#14A093",
        cheapWash: "#E3F2EF",
        // Rich = trades tight to its curve.
        rich: "#C13A57",
        richBright: "#D9486A",
        richWash: "#FBE9EC",
        // Interactive only — never used to encode data.
        focus: "#2E62D8",
      },
      fontFamily: {
        sans: ['"Libre Franklin"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ['"Spectral"', "ui-serif", "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        column: "1120px",
        prose: "68ch",
      },
      boxShadow: {
        panel:
          "0 1px 2px rgba(27,39,53,0.04), 0 10px 28px -16px rgba(27,39,53,0.14)",
        lift: "0 2px 6px rgba(27,39,53,0.07), 0 18px 36px -20px rgba(27,39,53,0.22)",
        bar: "0 1px 0 rgba(27,39,53,0.06)",
      },
    },
  },
  plugins: [],
};
