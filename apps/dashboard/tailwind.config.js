/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#080808',
          soft: '#0E0E0E',
          panel: '#121212',
          card: '#141414',
        },
        ink: {
          DEFAULT: '#F5F5F5',
          muted: '#B6B6B6',
        },
        accent: '#E6FF3F',
        line: 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
