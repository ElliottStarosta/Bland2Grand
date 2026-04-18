/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:           '#080706',
        surface:      '#0F0E0C',
        card:         '#161411',
        'card-hover': '#1E1B17',
        border:       '#252220',
        'border-hi':  '#3A3530',
        accent:       '#C8692A',
        'accent-2':   '#B89848',
        txt:          '#EDE9E0',
        'txt-dim':    '#C4BFB4',
        muted:        '#6A6662',
        success:      '#4E9E50',
        error:        '#B83838',
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