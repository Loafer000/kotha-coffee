/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coffee: {
          dark: '#3E2723',
          DEFAULT: '#4E342E',
          light: '#8D6E63',
          cream: '#FFF8E7',
          parchment: '#FAF3E0',
          green: '#33691E',
          terracotta: '#8D493A'
        }
      }
    },
  },
  plugins: [],
};
