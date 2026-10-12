const { chromium } = require("playwright");
const originalCount = JSON.parse(
  require("fs").readFileSync("public/annotations.json", "utf8"),
).features.length;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.ATLAS_CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Enable editing", exact: true })
      .waitFor();
    const annotationsVisible = () =>
      page.evaluate(() =>
        unmined.olMap.getLayers().getArray().at(-1).getVisible(),
      );
    if (await annotationsVisible())
      throw Error("Annotations visible in default browse mode");
    await page
      .getByRole("button", { name: "Show annotations", exact: true })
      .click();
    if (!(await annotationsVisible())) throw Error("Show annotations failed");
    await page
      .getByRole("button", { name: "Show all labels", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Hide all labels", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Hide annotations", exact: true })
      .click();
    if (await annotationsVisible()) throw Error("Hide annotations failed");
    await page.mouse.move(700, 400);
    const readout = await page.locator("#atlas-coordinates").textContent();
    if (!/^X -?\d+ · Z -?\d+$/.test(readout))
      throw Error("Missing X/Z readout");
    const limits = await page.evaluate(() => {
      const map = unmined.olMap,
        view = map.getView(),
        center = view.getCenter(),
        zoom = view.getZoom();
      view.setZoom(-100);
      view.setCenter([1e9, -1e9]);
      const bounds = map
        .getLayers()
        .getArray()[0]
        .getSource()
        .getTileGrid()
        .getExtent();
      const viewport = view.calculateExtent(map.getSize());
      const result = {
        zoom: view.getZoom(),
        minimum: view.getMinZoom(),
        expectedMinimum: Math.max(
          0,
          Math.ceil(
            view.getZoomForResolution(
              Math.min(
                (bounds[2] - bounds[0]) / map.getSize()[0],
                (bounds[3] - bounds[1]) / map.getSize()[1],
              ),
            ),
          ) - 1,
        ),
        inside: [0, 1].every((axis) => {
          const viewportSpan = viewport[axis + 2] - viewport[axis],
            worldSpan = bounds[axis + 2] - bounds[axis];
          // An overview may exceed the world in one axis; lock that axis to its centre.
          return viewportSpan > worldSpan
            ? Math.abs(
                view.getCenter()[axis] - (bounds[axis] + bounds[axis + 2]) / 2,
              ) < 1e-8
            : viewport[axis] >= bounds[axis] - 1e-8 &&
                viewport[axis + 2] <= bounds[axis + 2] + 1e-8;
        }),
      };
      view.setCenter(center);
      view.setZoom(zoom);
      return result;
    });
    if (
      limits.zoom < limits.minimum - 1e-8 ||
      Math.abs(limits.minimum - limits.expectedMinimum) > 1e-8 ||
      !limits.inside
    )
      throw Error("Zoom/pan escaped exported bounds");
    const icon = await page.request.get(
      "http://127.0.0.1:8787/grass-block.svg",
    );
    if (!icon.ok() || !(await icon.text()).includes("<svg"))
      throw Error("Missing grass-block favicon");

    if (await page.locator("#realm-map-toolbar").count())
      throw Error("Toolbar visible in browse");
    await page
      .getByRole("button", { name: "Enable editing", exact: true })
      .click();
    await page.locator("#realm-map-toolbar").waitFor();
    await page.waitForFunction(
      () => document.querySelector("#atlas-edit-toggle").disabled === false,
    );
    await page.getByRole("button", { name: "Boundary", exact: true }).click();
    page.once("dialog", (d) => d.accept("Browser smoke boundary"));
    await page.mouse.click(450, 350);
    await page.mouse.click(550, 350);
    await page.mouse.dblclick(500, 450);
    await page.waitForFunction(() =>
      JSON.parse(
        localStorage.getItem("realm-map-annotations-v1") || '{"features":[]}',
      ).features.some((f) => f.name === "Browser smoke boundary"),
    );
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export for Publishing", exact: true })
      .click();
    const download = await downloadEvent;
    const saved = await download.path();
    const exported = JSON.parse(require("fs").readFileSync(saved, "utf8"));
    if (exported.features.length !== originalCount + 1)
      throw Error("Expected all original annotations plus the new boundary");
    await page
      .getByRole("button", {
        name: "Finish editing and browse published map",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () => document.querySelector("#atlas-edit-toggle").disabled === false,
    );
    if (await page.locator("#realm-map-toolbar").count())
      throw Error("Toolbar remains after finish");
    if (await annotationsVisible())
      throw Error("Browse overlay visibility was not restored");
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Enable editing", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("#atlas-edit-toggle").disabled === false,
    );
    const draft = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("realm-map-annotations-v1")),
    );
    if (draft.features.length !== originalCount + 1)
      throw Error("Draft lost after refresh");
    await page.setViewportSize({ width: 390, height: 844 });
    const coordinateBounds = await page
      .locator("#atlas-coordinates")
      .boundingBox();
    if (
      coordinateBounds.x < 0 ||
      coordinateBounds.x + coordinateBounds.width > 390 ||
      coordinateBounds.y + coordinateBounds.height > 108
    )
      throw Error("Mobile coordinates hidden");
    const bounds = await page.locator("#realm-map-toolbar").boundingBox();
    if (bounds.x < 0 || bounds.x + bounds.width > 390)
      throw Error("Mobile toolbar overflow");
    if (errors.length) throw Error(errors.join("; "));
    console.log(
      "Real Chromium/uNmINeD smoke passed: browse, pencil, boundary drawing, full annotation export, finish, draft reload mobile controls, overlay/label toggles, visible coordinates, zoom/pan bounds and grass-block favicon.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
