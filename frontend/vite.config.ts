import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    allowedHosts: [
      "localhost",
      ".ngrok-free.app",
      ".trycloudflare.com",
    ],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Add rollupOptions to control output file naming
    rollupOptions: {
      output: {
        // Add content hash to entry and chunk files for cache busting
        entryFileNames: `assets/[name].[hash].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[hash].[ext]`
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,   // strips all console.log/warn/error in production
        drop_debugger: true,
      },
    },
  },
}));