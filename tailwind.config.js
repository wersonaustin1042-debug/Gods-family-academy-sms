/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F0EAD8",
        ink: "#211F1C",
        pine: "#1E3A2E",
        brass: "#B8860B",
        clay: "#A8452F",
        slateblue: "#3D5A73",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
