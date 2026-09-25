import "./assets.mjs";
import { spawn } from "node:child_process";
// Wrangler serves the Worker and its Durable Object (local SQLite in .wrangler/).
const children = [
  spawn(
    "node",
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--port",
      "3000",
      "--var",
      "PUBLIC_URL:http://localhost:5175",
    ],
    { stdio: "inherit" },
  ),
  spawn("node", ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
for (const child of children)
  child.on("exit", (code) => {
    for (const other of children) if (other !== child) other.kill();
    process.exitCode = code || 0;
  });
