import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Precaching every built chunk made a first visit download the whole
        // app up front (~3.4 MB: admin, exams, charts, PDF export) while the
        // landing page was still painting. Precache just the shell and let
        // chunks enter the cache as they are actually requested — pages stay
        // available offline once visited.
        globPatterns: ["**/*.{css,html}"],
        // Serve robots.txt, sitemap.xml, llms.txt and security.txt as themselves
        // instead of falling back to the SPA shell.
        navigateFallbackDenylist: [/^\/\.well-known\//, /\.(?:txt|xml)$/],
        runtimeCaching: [
          {
            // Build output is content-hashed, so a hit can never be stale.
            urlPattern: /\/assets\/[^/]+$/,
            handler: "CacheFirst",
            options: {
              cacheName: "app-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\.(?:webp|png|jpe?g|svg|gif|avif|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'Spirit Life School of Ministry',
        short_name: 'SLSOM',
        theme_color: '#5B21B6',
        display: 'standalone',
        icons: [
          {
            src: '/images/school-logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/images/school-logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          // recharts and tiptap are only reached through lazily-loaded pages
          // (admin Analytics, the exam RichTextEditor). Naming them here made
          // Rollup treat them as static deps of the entry, so index.html
          // modulepreloaded ~220 KB gzipped of chart + editor code on every
          // visit. Left unlisted, they land in the lazy chunks that use them.
          "vendor-query": ["@tanstack/react-query"],
          // Only the primitives mounted at startup (TooltipProvider, Toaster)
          // belong in an eagerly-loaded chunk. Listing dialog/select/tabs here
          // too dragged them onto the landing page's critical path.
          "vendor-radix": [
            "@radix-ui/react-tooltip",
            "@radix-ui/react-toast",
          ],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
}));
