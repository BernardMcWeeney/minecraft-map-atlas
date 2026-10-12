import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import data from "../editor/atlas-data.js";
export async function checkAssets(root = "public", requireMap = true) {
  let count = 0;
  const oversized = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".assetsignore") continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw Error(`Symlink asset unsupported: ${file}`);
      if (entry.isDirectory()) await walk(file);
      else {
        count++;
        if ((await stat(file)).size > 25 * 1024 * 1024) oversized.push(file);
      }
    }
  }
  await walk(root);
  if (count > 20000 || oversized.length)
    throw Error(
      `Workers Free asset limits exceeded: ${count} files; oversized: ${oversized.join(", ")}`,
    );
  if (requireMap) {
    const html = await readFile(path.join(root, "index.html"), "utf8");
    if (
      !html.includes("new Unmined(") ||
      !html.includes("realm-map-editor.js") ||
      !html.includes("atlas-data.js")
    )
      throw Error("Missing patched uNmINeD index.html");
    data.parse(await readFile(path.join(root, "annotations.json"), "utf8"));
  }
  return count;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    console.log(
      `Workers assets verified: ${await checkAssets()} files; each at most 25 MiB.`,
    );
  } catch (e) {
    console.error("Deployment preflight failed:", e.message);
    process.exitCode = 1;
  }
}
