import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` defaults to /chemkarumel/ for GitHub Pages, but Docker/nginx serves
// the SPA at root — override with VITE_BASE_PATH=/ in that case.
const PROD_BASE = process.env.VITE_BASE_PATH ?? "/chemkarumel/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? PROD_BASE : "/",
  plugins: [react()],
}));
