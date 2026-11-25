/** Colours mirror src/theme/theme.ts - keep them in sync. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FAF3E6', 'cream-dark': '#F2E7D3', brown: '#382525', terracotta: '#D58F6B', rust: '#A85A36', peach: '#E3BB9F',
        frame: '#382525',
      },
      fontFamily: { sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      screens: { xs: '390px' },
    },
  },
  plugins: [],
}
