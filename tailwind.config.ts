import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F2",
        "warm-white": "#FEFDFB",
        sage: "#8B9D83",
        "sage-light": "#A8B8A0",
        "sage-dark": "#6B7D63",
        blush: "#D4A89A",
        "blush-light": "#E8C5BA",
        "blush-dark": "#C0917F",
        charcoal: "#2C2C2C",
        "warm-gray": "#6B6560",
        "light-gray": "#E8E4DE",
        taupe: "#B8AFA6",
        gold: "#C5A87E",
      },
      fontFamily: {
        serif: ["Cormorant Garamond", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": [
          "clamp(3.5rem, 8vw, 7rem)",
          { lineHeight: "0.95", letterSpacing: "-0.03em" },
        ],
        display: [
          "clamp(2.5rem, 5vw, 4.5rem)",
          { lineHeight: "1.05", letterSpacing: "-0.02em" },
        ],
        heading: [
          "clamp(1.75rem, 3vw, 2.75rem)",
          { lineHeight: "1.15", letterSpacing: "-0.01em" },
        ],
        subheading: ["clamp(1.25rem, 2vw, 1.5rem)", { lineHeight: "1.4" }],
      },
    },
  },
  plugins: [],
};
export default config;
