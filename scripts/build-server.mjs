import { build } from "esbuild";
await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["vite"],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
