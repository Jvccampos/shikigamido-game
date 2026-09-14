import { createServer } from "../../server/main.js";
import type { AddressInfo } from "node:net";

const app = await createServer({ logger: false });
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT || 0) });
process.send?.({ port: (app.server.address() as AddressInfo).port });
process.on("SIGTERM", () => void app.close().then(() => process.exit(0)));
