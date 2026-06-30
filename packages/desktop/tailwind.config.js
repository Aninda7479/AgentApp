/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: 'var(--brand-bg)',
          sidebar: 'var(--brand-sidebar)',
          card: 'var(--brand-card)',
          popover: 'var(--brand-popover)',
          border: 'var(--brand-border)',
          textMain: 'var(--brand-text-main)',
          textMuted: 'var(--brand-text-muted)',
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
