/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#00e87a',
        surface: '#0e1115',
        bg: '#080a0c',
      },
    },
  },
  plugins: [],
};
