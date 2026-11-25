/** Colours mirror src/theme/theme.ts - keep them in sync. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F9F2E3', brown: '#312122', terracotta: '#CC8463', rust: '#9B5033', peach: '#E3BBA3',
        frame: '#312122',
      },
      fontFamily: { sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      screens: { xs: '390px' },
    },
  },
  plugins: [],
}
