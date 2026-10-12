import { copyFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await copyFile("editor/atlas-data.js", "public/atlas-data.js");
await copyFile("editor/realm-map-editor.js", "public/realm-map-editor.js");
await copyFile("editor/atlas-ui.css", "public/atlas-ui.css");
await copyFile("editor/assets/grass-block.svg", "public/grass-block.svg");
try {
  await readFile("public/index.html");
} catch {
  console.log(
    "Editor assets prepared. Missing private uNmINeD public/index.html and tiles; copy the real Web page export before map startup/deployment.",
  );
  process.exit(0);
}
const result = spawnSync("python3", ["tools/patch-unmined.py", "public"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
