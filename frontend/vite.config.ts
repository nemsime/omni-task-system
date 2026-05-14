import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` defaults to /omni-task-system/ for GitHub Pages, but Docker/nginx
// serves the SPA at root — override with VITE_BASE_PATH=/ in that case.
const PROD_BASE = process.env.VITE_BASE_PATH ?? "/omni-task-system/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? PROD_BASE : "/",
  plugins: [react()],
}));
