import { startMcpServer } from "./server.ts";

const isDirect = process.argv[1]?.includes("apps/mcp") || process.argv[1]?.includes("apps\\mcp");
if (isDirect) {
  await startMcpServer();
}

export { handleMcpRequest, startMcpServer } from "./server.ts";
