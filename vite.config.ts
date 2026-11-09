import { defineConfig } from "vite";

// BASE_PATH is set by the GitHub Pages workflow (/agent-demo/). Any host that
// serves the site from its root, including a custom domain, needs no setting.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
});
