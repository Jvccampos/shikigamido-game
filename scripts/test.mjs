import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, mkdirSync } from "node:fs";
const files = readdirSync("tests").filter((f) => f.endsWith(".test.ts"));
mkdirSync(".sited/tests", { recursive: true });
for (const file of files)
  await build({
    entryPoints: [`tests/${file}`],
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    outfile: `.sited/tests/${file.replace(".ts", ".mjs")}`,
  });
const r = spawnSync(
  process.execPath,
  ["--test", ...files.map((f) => `.sited/tests/${f.replace(".ts", ".mjs")}`)],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
