/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Instrument palette: cool paper, lit white panel faces, navy ink, and
        // a diverging teal/rose pair reserved for the only axis that carries
        // meaning here — cheap vs rich against the fitted curve. Chrome is
        // grey on purpose, so colour never competes with the data.
        ground: "#E4E9EF",
        surface: "#FFFFFF",
        raised: "#F1F5F9",
        sunken: "#E9EEF4",
        ink: "#121C27",
        muted: "#55677B",
        faint: "#8496A8",
        line: "#C7D2DE",
        hair: "#E1E8EF",
        // Cheap = trades wide of its curve. Text-weight and graphic-weight.
        cheap: "#0B7A6E",
        cheapBright: "#12A093",
        cheapWash: "#E2F1EF",
        // Rich = trades tight to its curve.
        rich: "#B62F4C",
        richBright: "#D9486A",
        richWash: "#FAE8EB",
        // Interactive only — never used to encode data.
        focus: "#1F4FD8",
      },
      fontFamily: {
        // One superfamily. Plex Mono carries every figure, identifier and
        // parameter; Plex Sans carries the few sentences of prose that remain.
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Data sizes, named by role rather than by scale step.
        key: ["10.5px", { lineHeight: "1.2", letterSpacing: "0.09em" }],
        cell: ["12.5px", { lineHeight: "1.35" }],
        read: ["13.5px", { lineHeight: "1.5" }],
      },
      maxWidth: {
        // Wider than an article: density needs columns.
        blotter: "1340px",
        prose: "72ch",
      },
      borderRadius: {
        // Instrument faces, not cards.
        panel: "3px",
        chip: "2px",
      },
      boxShadow: {
        // The only lift on the page: the sticky command bar over scrolled rows.
        bar: "0 1px 0 rgba(18,28,39,0.10)",
      },
    },
  },
  plugins: [],
};
