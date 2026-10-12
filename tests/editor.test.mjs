import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import Feature from "ol/Feature.js";
import VectorSource from "ol/source/Vector.js";
import VectorLayer from "ol/layer/Vector.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import LineString from "ol/geom/LineString.js";
import * as proj from "ol/proj.js";
import * as extent from "ol/extent.js";
import * as style from "ol/style.js";
import Projection from "ol/proj/Projection.js";
import Draw from "ol/interaction/Draw.js";
import Modify from "ol/interaction/Modify.js";
proj.addProjection(new Projection({ code: "MINECRAFT", units: "pixels" }));
proj.addProjection(new Projection({ code: "UNMINED", units: "pixels" }));
proj.addCoordinateTransforms(
  "MINECRAFT",
  "UNMINED",
  ([x, z]) => [x * 2, -z * 2],
  ([x, y]) => [x / 2, -y / 2],
);
const source = await readFile("editor/realm-map-editor.js", "utf8"),
  core = await readFile("editor/atlas-data.js", "utf8");
const published = {
  version: 2,
  features: [
    {
      kind: "territory",
      name: "Ravenshire",
      coordinates: [
        [
          [-120, 345],
          [200, 345],
          [200, -80],
          [-120, 345],
        ],
      ],
    },
    { kind: "marker", name: "Castle", coordinates: [-120, 345] },
    {
      kind: "route",
      name: "Rail",
      coordinates: [
        [-120, 345],
        [200, -80],
      ],
    },
  ],
};
async function setup(edit = true, draft) {
  const dom = new JSDOM("<html><head></head><body></body></html>", {
    url: `https://atlas.example/${edit ? "?edit=1" : ""}`,
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.TextEncoder = TextEncoder;
  w.ol = {
    Feature,
    source: { Vector: VectorSource },
    layer: { Vector: VectorLayer },
    geom: { Point, Polygon, LineString },
    proj,
    extent,
    style,
    interaction: { Draw, Modify },
  };
  w.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify(published),
  });
  w.confirm = () => true;
  w.prompt = () => "New item";
  if (draft)
    w.localStorage.setItem("realm-map-annotations-v1", JSON.stringify(draft));
  let center = [0, 0],
    zoom = 4;
  const view = {
    on() {},
    getZoom: () => zoom,
    setZoom: (v) => (zoom = v),
    getCenter: () => center,
    setCenter: (v) => (center = v),
    fit() {},
  };
  const map = {
    addLayer() {},
    on() {},
    getView: () => view,
    addInteraction() {},
    removeInteraction() {},
    forEachFeatureAtPixel(pixel, fn) {
      return fn(map.hit, editor.layer);
    },
  };
  w.eval(core);
  w.eval(source);
  const editor = new w.RealmMapEditor({
    olMap: map,
    dataProjection: "MINECRAFT",
    viewProjection: "UNMINED",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { w, editor, map, dom };
}
test("real OpenLayers projection preserves marker, route and polygon geometry; profile edits keep geometry", async () => {
  const { editor, w, dom } = await setup();
  const before = editor.getAnnotations();
  assert.equal(before.length, 3);
  for (let i = 0; i < 3; i++)
    assert.deepEqual(
      JSON.parse(JSON.stringify(before[i].coordinates)),
      published.features[i].coordinates.map
        ? JSON.parse(JSON.stringify(editor.document.features[i].coordinates))
        : published.features[i].coordinates,
    );
  const marker = editor.source.getFeatures()[1];
  const xy = editor.coordToWorld(marker.getGeometry().getCoordinates());
  assert.ok(Math.abs(xy[0] + 120) < 1e-8);
  assert.ok(Math.abs(xy[1] - 345) < 1e-8);
  editor.openProfile(marker);
  const name = editor.profile.querySelector("input[type=text]");
  name.value = "Changed";
  name.dispatchEvent(new w.Event("input"));
  assert.equal(marker.get("name"), "Changed");
  assert.deepEqual(
    editor.getAnnotations()[1].coordinates,
    before[1].coordinates,
  );
  const saved = JSON.parse(w.localStorage.getItem(editor.storeKey));
  assert.equal(saved.features[1].name, "Changed");
  editor.setDocument(saved);
  assert.equal(editor.source.getFeatures()[1].get("name"), "Changed");
  dom.window.close();
});
test("create marker/polygon/route, shape edits, delete confirmation, undo/redo and atomic import", async () => {
  const { editor, w, map, dom } = await setup();
  for (const kind of ["marker", "territory", "route"]) {
    editor.setTool(kind);
    const geometry =
      kind === "marker"
        ? new Point([0, 0])
        : kind === "route"
          ? new LineString([
              [0, 0],
              [10, 10],
            ])
          : new Polygon([
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 0],
              ],
            ]);
    const f = new Feature(geometry);
    editor.interaction.dispatchEvent({ type: "drawend", feature: f });
    editor.source.addFeature(f);
    assert.ok(f.get("id"));
  }
  assert.equal(editor.getAnnotations().length, 6);
  editor.setTool("edit");
  const f = editor.source.getFeatures()[5];
  f.getGeometry().translate(5, 10);
  const moved = editor.getAnnotations()[5].coordinates;
  editor.restoreHistory(false);
  assert.notDeepEqual(editor.getAnnotations()[5].coordinates, moved);
  editor.restoreHistory(true);
  assert.equal(
    JSON.stringify(editor.getAnnotations()[5].coordinates),
    JSON.stringify(moved),
  );
  editor.setTool("delete");
  map.hit = editor.source.getFeatures()[0];
  w.confirm = () => false;
  editor.onMapClick({ pixel: [0, 0] });
  assert.equal(editor.source.getFeatures().length, 6);
  w.confirm = () => true;
  editor.onMapClick({ pixel: [0, 0] });
  assert.equal(editor.source.getFeatures().length, 5);
  editor.restoreHistory(false);
  assert.equal(editor.source.getFeatures().length, 6);
  const before = editor.snapshot();
  assert.throws(() =>
    editor.setDocument({ features: [{ kind: "territory", coordinates: [] }] }),
  );
  assert.deepEqual(editor.snapshot(), before);
  dom.window.close();
});
test("export file contents include metadata/settings and browse mode ignores local draft", async () => {
  const { editor, w, dom } = await setup();
  editor.source.getFeatures()[1].set("description", "<script>bad()</script>");
  editor.document.settings.layers.transport = false;
  let blob, filename;
  w.URL.createObjectURL = (b) => {
    blob = b;
    return "blob:test";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    filename = this.download;
  };
  editor.exportFile();
  assert.equal(filename, "annotations.json");
  const reader = new w.FileReader();
  const text = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });
  const exported = w.AtlasData.parse(text);
  assert.equal(exported.features.length, 3);
  assert.equal(exported.settings.layers.transport, false);
  assert.match(editor.message.textContent, /commit to main/);
  dom.window.close();
  const browse = await setup(false, { features: [] });
  assert.equal(browse.editor.source.getFeatures().length, 3);
  browse.editor.openProfile(browse.editor.source.getFeatures()[0]);
  assert.equal(browse.editor.profile.querySelectorAll("input").length, 0);
  assert.equal(
    browse.w.localStorage.getItem(browse.editor.storeKey),
    '{"features":[]}',
  );
  browse.dom.window.close();
});
test("corrupt draft is preserved and prevents export of an empty replacement", async () => {
  const { editor, w, dom } = await setup(true, {
    features: [{ kind: "territory", coordinates: [] }],
  });
  assert.equal(editor.loading, true);
  editor.exportFile();
  assert.match(editor.message.textContent, /Resolve annotation/);
  assert.ok(w.localStorage.getItem(editor.storeKey).includes("territory"));
  dom.window.close();
});

test("search, owner filter, layer and label settings, safe profiles and actual draft reload", async () => {
  const { editor, w, dom } = await setup();
  const marker = editor.source.getFeatures()[1];
  marker.set("owner", "Queen Alice");
  marker.set("category", "castle");
  marker.set("description", "<img src=x onerror=alert(1)>");
  editor.search.value = "castle";
  editor.search.dispatchEvent(new w.Event("input"));
  assert.equal(editor.results.children.length, 1);
  editor.ownerFilter.value = "queen";
  editor.ownerFilter.dispatchEvent(new w.Event("input"));
  assert.equal(editor.results.children.length, 1);
  editor.ownerFilter.value = "bob";
  editor.ownerFilter.dispatchEvent(new w.Event("input"));
  assert.equal(editor.results.children.length, 0);
  const toggle = editor.directory.querySelector('[data-layer="landmarks"]');
  toggle.checked = false;
  toggle.dispatchEvent(new w.Event("change"));
  assert.equal(editor.styleFor(marker), null);
  toggle.checked = true;
  toggle.dispatchEvent(new w.Event("change"));
  editor.setLabels(false);
  assert.equal(editor.styleFor(marker).getText().getText().trim(), "♜");
  editor.openProfile(marker);
  const shape = JSON.stringify(editor.getAnnotations()[1].coordinates);
  assert.equal(editor.profile.querySelector("img"), null);
  let copied;
  Object.defineProperty(w.navigator, "clipboard", {
    value: {
      writeText: async (text) => {
        copied = text;
      },
    },
  });
  [...editor.profile.querySelectorAll("button")]
    .find((b) => b.textContent === "Copy feature link")
    .click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(new URL(copied).searchParams.has("edit"), false);
  assert.ok(copied.includes(marker.get("id")));
  [...editor.profile.querySelectorAll("button")]
    .find((b) => b.textContent === "Copy /tp")
    .click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(copied, "/tp -120 ~ 345");
  const saved = JSON.parse(w.localStorage.getItem(editor.storeKey));
  dom.window.close();
  const reloaded = await setup(true, saved);
  assert.equal(
    reloaded.editor.source.getFeatures()[1].get("owner"),
    "Queen Alice",
  );
  assert.equal(
    JSON.stringify(reloaded.editor.getAnnotations()[1].coordinates),
    shape,
  );
  assert.equal(reloaded.editor.showAllLabels, false);
  reloaded.dom.window.close();
});

test("file import validates before replacement, retains backups and can be undone", async () => {
  const { editor, w, dom } = await setup();
  const input = editor.toolbar.querySelector("input[type=file]");
  let alert = "";
  w.alert = (text) => (alert = text);
  const initial = JSON.stringify(editor.snapshot().features);
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [
      {
        size: 50,
        text: async () =>
          JSON.stringify({
            features: [{ kind: "territory", coordinates: [] }],
          }),
      },
    ],
  });
  input.dispatchEvent(new w.Event("change"));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(alert, /Could not import/);
  assert.equal(JSON.stringify(editor.snapshot().features), initial);
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [
      {
        size: 50,
        text: async () =>
          JSON.stringify({
            version: 1,
            features: [
              { kind: "marker", name: "Imported", coordinates: [500, -750] },
            ],
          }),
      },
    ],
  });
  input.dispatchEvent(new w.Event("change"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(editor.getAnnotations().length, 1);
  assert.equal(editor.getAnnotations()[0].name, "Imported");
  editor.restoreHistory(false);
  assert.equal(JSON.stringify(editor.snapshot().features), initial);
  dom.window.close();
});

test("pencil opens drawing controls from browse and finish retains draft without publishing", async () => {
  const { editor, w, dom } = await setup(false);
  assert.equal(editor.editMode, false);
  assert.equal(w.document.querySelector("#realm-map-toolbar"), null);
  assert.equal(editor.editButton.getAttribute("aria-pressed"), "false");
  editor.editButton.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(editor.editMode, true);
  assert.equal(new URL(w.location.href).searchParams.get("edit"), "1");
  assert.ok(editor.toolbar.querySelector("[data-tool=territory]"));
  editor.toolbar.querySelector("[data-tool=territory]").click();
  assert.equal(editor.activeTool, "territory");
  editor.setTool("view");
  editor.source.getFeatures()[0].set("name", "Local draft kingdom");
  editor.editButton.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(editor.editMode, false);
  assert.equal(w.document.querySelector("#realm-map-toolbar"), null);
  assert.equal(editor.source.getFeatures()[0].get("name"), "Ravenshire");
  assert.equal(
    JSON.parse(w.localStorage.getItem(editor.storeKey)).features[0].name,
    "Local draft kingdom",
  );
  editor.editButton.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(
    editor.source.getFeatures()[0].get("name"),
    "Local draft kingdom",
  );
  assert.equal(w.document.querySelectorAll("#realm-map-toolbar").length, 1);
  dom.window.close();
});

test("browse defaults hide overlays and labels without losing annotations or export contents", async () => {
  const { editor, w, dom } = await setup(false);
  assert.equal(editor.showAllLabels, false);
  assert.equal(editor.layer.getVisible(), false);
  assert.equal(editor.getAnnotations().length, 3);
  assert.equal(editor.annotationButton.textContent, "Show annotations");
  editor.annotationButton.click();
  assert.equal(editor.layer.getVisible(), true);
  editor.browseLabelButton.click();
  assert.equal(editor.showAllLabels, true);
  const before = JSON.stringify(editor.getAnnotations());
  editor.annotationButton.click();
  assert.equal(editor.layer.getVisible(), false);
  assert.equal(JSON.stringify(editor.getAnnotations()), before);
  assert.equal(editor.snapshot().features.length, 3);
  editor.editButton.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(editor.layer.getVisible(), true);
  editor.editButton.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(editor.layer.getVisible(), false);
  dom.window.close();
});
