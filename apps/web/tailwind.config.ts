import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#00e87a',
        surface: '#0e1115',
        bg: '#080a0c',
      },
      fontFamily: {
        mono: ['DM Mono', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
