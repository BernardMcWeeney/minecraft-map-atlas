const { test } = require("node:test");
const assert = require("node:assert/strict");
const data = require("../editor/atlas-data.js");
const fixture = {
  version: 1,
  features: [
    { kind: "marker", name: "Castle", coordinates: [-120, 345] },
    {
      kind: "route",
      name: "Rail",
      coordinates: [
        [-120, 345],
        [800, -90],
      ],
    },
    {
      kind: "territory",
      name: "Ravenshire",
      coordinates: [
        [
          [-10, -10],
          [20, -10],
          [20, 20],
          [-10, -10],
        ],
      ],
    },
  ],
};
test("v1/v2 migration keeps exact geometry and permanent IDs across roundtrips", () => {
  for (const version of [1, 2]) {
    const result = data.migrate({ ...fixture, version });
    assert.deepEqual(
      result.features.map((f) => f.coordinates),
      fixture.features.map((f) => f.coordinates),
    );
    assert.deepEqual(data.parse(JSON.stringify(result)), result);
    assert.deepEqual(data.migrate({ ...fixture, version }), result);
    assert.equal(new Set(result.features.map((f) => f.id)).size, 3);
  }
});
test("settings, metadata, dates and malicious text roundtrip as inert strings", () => {
  const input = data.migrate(fixture);
  input.features[0].description = "<img src=x onerror=alert(1)>";
  input.features[0].status = "building";
  input.settings.layers.Nether = false;
  input.worldExportDate = "2026-10-11";
  assert.deepEqual(data.parse(JSON.stringify(input)), input);
});
test("invalid imports fail atomically rather than silently dropping boundaries", () => {
  for (const value of [
    {
      features: [
        {
          ...fixture.features[2],
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [9, 9],
            ],
          ],
        },
      ],
    },
    { features: [{ ...fixture.features[0], coordinates: [NaN, 0] }] },
    { features: [{ ...fixture.features[0], coordinates: [Infinity, 0] }] },
    { features: [{ ...fixture.features[0], description: "x".repeat(4001) }] },
    {
      features: [
        { ...fixture.features[0], id: "same" },
        { ...fixture.features[1], id: "same" },
      ],
    },
    { version: 99, features: [] },
    { features: Array(10001).fill(fixture.features[0]) },
  ])
    assert.throws(() => data.migrate(value));
  assert.throws(() => data.parse("x".repeat(8 * 1024 * 1024 + 1)));
});
