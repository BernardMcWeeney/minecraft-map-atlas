import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkAssets } from "../tools/check-assets.mjs";
test("patch initializes after map, upgrades v2 and is idempotent; rejects missing map", async () => {
  const folder = await mkdtemp(join(tmpdir(), "atlas-patch-"));
  try {
    const file = join(folder, "index.html");
    await writeFile(
      file,
      "<body><script>const unmined = new Unmined();</script></body>",
    );
    const run = () => spawnSync("python3", ["tools/patch-unmined.py", folder]);
    assert.equal(run().status, 0);
    const first = await readFile(file, "utf8");
    assert.ok(
      first.indexOf("new RealmMapEditor") > first.indexOf("new Unmined"),
    );
    assert.ok(
      first.indexOf("atlas-data.js") < first.indexOf("realm-map-editor.js"),
    );
    assert.equal(run().status, 0);
    assert.equal(await readFile(file, "utf8"), first);
    await writeFile(
      file,
      first.replace('<script src="./atlas-data.js"></script>\n', ""),
    );
    assert.equal(run().status, 0);
    assert.equal(await readFile(file, "utf8"), first);
    await writeFile(file, "<body>no map</body>");
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(file, "utf8"), "<body>no map</body>");
  } finally {
    await rm(folder, { recursive: true });
  }
});
test("deployment preflight rejects oversized assets and missing real map", async () => {
  const folder = await mkdtemp(join(tmpdir(), "atlas-assets-"));
  try {
    await writeFile(join(folder, "tile.png"), "tile");
    assert.equal(await checkAssets(folder, false), 1);
    await assert.rejects(checkAssets(folder, true));
    await truncate(join(folder, "tile.png"), 25 * 1024 * 1024 + 1);
    await assert.rejects(checkAssets(folder, false), /limits exceeded/);
  } finally {
    await rm(folder, { recursive: true });
  }
});
