/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0C0B09',
        surface: '#141210',
        card:    '#1C1A16',
        'card-hover': '#232019',
        border:  '#2C2926',
        accent:  '#D4742E',
        'accent-2': '#C4A55A',
        txt:     '#EDE9E0',
        muted:   '#7A7672',
        success: '#5BA85C',
        error:   '#C94040',
      },
      fontFamily: {
        display: ['"Cormorant"', 'serif'],
        body:    ['"Outfit"', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
    },
  },
  plugins: [],
}