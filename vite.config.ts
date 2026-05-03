import { defineConfig } from "vite";

/**
 * GitHub Pages project URL: https://<user>.github.io/<repo>/
 * Set GITHUB_PAGES_BASE when building if the repo name is not the default (e.g. /math-void/).
 * Example: `GITHUB_PAGES_BASE=/my-repo/ npm run build`
 */
const githubPagesBase = process.env.GITHUB_PAGES_BASE ?? "/Endless/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? githubPagesBase : "/",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
}));
