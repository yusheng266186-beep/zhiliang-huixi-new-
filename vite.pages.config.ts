import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "pages-dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(process.cwd(), "pages-static/index.html"),
    },
  },
});
