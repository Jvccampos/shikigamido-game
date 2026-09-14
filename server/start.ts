import { createServer } from "./main.js";
const app = await createServer();
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 3000) });
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => void app.close().then(() => process.exit(0)));
