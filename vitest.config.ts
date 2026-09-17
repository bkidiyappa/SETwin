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
      "@setwin/audit": path.join(root, "packages/audit/src/index.ts"),
      "@setwin/audit/record": path.join(root, "packages/audit/src/record.ts"),
      "@setwin/ai": path.join(root, "packages/ai/src/index.ts"),
      "@setwin/requirements": path.join(root, "packages/requirements/src/index.ts"),
      "@setwin/repo": path.join(root, "packages/repo/src/index.ts"),
      "@setwin/change": path.join(root, "packages/change/src/index.ts"),
      "@setwin/context": path.join(root, "packages/context/src/index.ts"),
      "@setwin/agents": path.join(root, "packages/agents/src/index.ts"),
      "@setwin/testing": path.join(root, "packages/testing/src/index.ts"),
      "@setwin/cicd": path.join(root, "packages/cicd/src/index.ts"),
      "@setwin/opensecant": path.join(root, "packages/opensecant/src/index.ts"),
      "@setwin/openvector": path.join(root, "packages/openvector/src/index.ts"),
      "@setwin/integrations": path.join(root, "packages/integrations/src/index.ts"),
      "@setwin/config": path.join(root, "packages/config/src/index.ts"),
      "@setwin/database": path.join(root, "packages/database/src/index.ts"),
      "@setwin/core": path.join(root, "packages/core/src/index.ts"),
      "@setwin/twin": path.join(root, "packages/twin/src/index.ts"),
      "@setwin/api": path.join(root, "apps/api/src/index.ts"),
      "@setwin/mcp": path.join(root, "apps/mcp/src/index.ts"),
    },
  },
});
