import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site from /safe-routes/. The dev server uses the root
export default defineConfig(({ command, isPreview }) => ({
    base: command === "serve" && !isPreview ? "/" : "/safe-routes/",
    plugins: [react()],
    worker: { format: "es" },
    // MapLibre alone is about 1 MB minified
    build: { chunkSizeWarningLimit: 1400 },
}));
