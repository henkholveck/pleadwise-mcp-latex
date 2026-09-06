import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { withUser } from "./context.js";
import { createMcpServer } from "./mcp.js";
const server = createMcpServer();
const transport = new StdioServerTransport();
await withUser({ id: config.DEV_USER_ID, email: config.DEV_USER_EMAIL, development: true }, () => server.connect(transport));
//# sourceMappingURL=stdio.js.map