import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@setwin/auth": path.join(root, "packages/auth/src/index.ts"),
      "@setwin/config": path.join(root, "packages/config/src/index.ts"),
      "@setwin/database": path.join(root, "packages/database/src/index.ts"),
      "@setwin/core": path.join(root, "packages/core/src/index.ts"),
      "@setwin/twin": path.join(root, "packages/twin/src/index.ts"),
      "@setwin/api": path.join(root, "apps/api/src/index.ts"),
    },
  },
});
