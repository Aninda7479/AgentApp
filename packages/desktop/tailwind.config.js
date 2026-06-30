/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#141110',
          sidebar: '#1e1816',
          card: '#1b1412',
          popover: '#262220',
          border: '#2d2321',
          textMain: '#ececec',
          textMuted: '#8a8a8a',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
