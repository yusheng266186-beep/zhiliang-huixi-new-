import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

const projectRoot = process.cwd();

export default defineConfig({
  // root 指向 pages-static 后，产物直接是 pages-dist/index.html + ./assets/，
  // 部署脚本不再需要 cp pages-dist/pages-static/... 和 sed ../assets 路径重写。
  root: resolve(projectRoot, "pages-static"),
  base: "./",
  plugins: [react()],
  publicDir: resolve(projectRoot, "public"),
  build: {
    outDir: resolve(projectRoot, "pages-dist"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(projectRoot, "pages-static/index.html"),
    },
  },
});
