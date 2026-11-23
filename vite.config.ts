import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist/public", emptyOutDir: true },
});
