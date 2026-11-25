import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** Preload the self-hosted Outfit weights that the first screen uses (400, 600, 700). */
function preloadFonts(): Plugin {
  return {
    name: 'preload-outfit',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const tags = Object.keys(ctx.bundle)
          .filter((f) => /outfit-latin-(400|600|700)-normal.*\.woff2$/.test(f))
          .map((f) => `<link rel="preload" as="font" type="font/woff2" href="/${f}" crossorigin>`)
          .join('\n    ')
        return html.replace('</head>', `  ${tags}\n  </head>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadFonts()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react'
          if (id.includes('@supabase')) return 'supabase'
          return undefined
        },
      },
    },
  },
})
