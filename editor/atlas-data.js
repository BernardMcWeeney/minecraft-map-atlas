/* Shared, bounded annotation migration. Coordinates are Minecraft X/Z. */
(function (root) {
  const categories = {
    custom: "📍",
    "rail station": "🚉",
    "post office": "✉",
    "town hall": "🏛",
    castle: "♜",
    house: "⌂",
    shop: "◆",
    mine: "⚒",
    farm: "♧",
    "inn/hotel": "☾",
    harbour: "⚓",
    "Nether portal": "◈",
    "military base": "⚑",
    library: "▤",
    town: "●",
    road: "━",
    railway: "═",
    "boat route": "≈",
  };
  const layers = [
    "territories",
    "towns",
    "transport",
    "public services",
    "landmarks",
    "Nether",
  ];
  const fields = [
    "name",
    "owner",
    "description",
    "color",
    "category",
    "icon",
    "status",
    "kingdom",
    "settlementType",
    "foundedYear",
    "notes",
    "layer",
  ];
  function migrate(data) {
    if (!data || !Array.isArray(data.features) || data.features.length > 10000)
      throw Error("Expected at most 10,000 features");
    if (data.version != null && ![1, 2, 3].includes(data.version))
      throw Error("Unsupported annotation version");
    let vertices = 0;
    const ids = new Set();
    const features = data.features.map((entry, index) => {
      if (!entry || !["marker", "territory", "route"].includes(entry.kind))
        throw Error(`Invalid kind at feature ${index}`);
      const point = (p) => {
        if (
          ++vertices > 200000 ||
          !Array.isArray(p) ||
          p.length !== 2 ||
          !p.every(
            (n) =>
              typeof n === "number" &&
              Number.isFinite(n) &&
              Math.abs(n) <= 30000000,
          )
        )
          throw Error(`Invalid X/Z coordinates at feature ${index}`);
        return [...p];
      };
      const line = (p, min) => {
        if (!Array.isArray(p) || p.length < min)
          throw Error("Too few vertices");
        return p.map(point);
      };
      let coordinates;
      if (entry.kind === "marker") coordinates = point(entry.coordinates);
      else if (entry.kind === "route") coordinates = line(entry.coordinates, 2);
      else {
        if (!Array.isArray(entry.coordinates) || !entry.coordinates.length)
          throw Error("Missing polygon rings");
        coordinates = entry.coordinates.map((r) => {
          const ring = line(r, 4);
          if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
            throw Error("Polygon ring must be closed");
          return ring;
        });
      }
      let hash = 2166136261;
      for (const c of JSON.stringify([entry.kind, coordinates, index]))
        hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
      const id =
        entry.id == null ? `legacy-${hash.toString(16)}-${index}` : entry.id;
      if (
        typeof id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
        ids.has(id)
      )
        throw Error("Invalid or duplicate feature ID");
      ids.add(id);
      const f = {
        id,
        kind: entry.kind,
        coordinates,
        showLabel: entry.showLabel !== false,
      };
      for (const key of fields) {
        if (entry[key] != null && typeof entry[key] !== "string")
          throw Error(`Invalid ${key}`);
        const value = entry[key] || "";
        if (
          value.length > (["description", "notes"].includes(key) ? 4000 : 160)
        )
          throw Error(`${key} too long`);
        f[key] = value;
      }
      f.color = /^#[a-f\d]{6}$/i.test(f.color) ? f.color : "#f59e0b";
      f.category ||= entry.kind === "route" ? "road" : "custom";
      f.layer ||=
        entry.kind === "territory"
          ? "territories"
          : entry.kind === "route"
            ? "transport"
            : "landmarks";
      if (!layers.includes(f.layer)) throw Error("Unknown layer");
      return f;
    });
    const settings = { labels: data.settings?.labels !== false, layers: {} };
    for (const layer of layers)
      settings.layers[layer] = data.settings?.layers?.[layer] !== false;
    const dates = {};
    for (const key of ["worldExportDate", "annotationUpdatedAt"]) {
      const value = data[key] || "";
      if (typeof value !== "string" || value.length > 40)
        throw Error("Invalid date");
      dates[key] = value;
    }
    const result = { version: 3, ...dates, settings, features };
    assertSize(JSON.stringify(result));
    return result;
  }
  function assertSize(text) {
    if (
      typeof text !== "string" ||
      text.length > 8 * 1024 * 1024 ||
      new TextEncoder().encode(text).byteLength > 8 * 1024 * 1024
    )
      throw Error("JSON exceeds 8 MiB");
  }
  function parse(text) {
    assertSize(text);
    return migrate(JSON.parse(text));
  }
  const api = { migrate, parse, categories, layers, fields };
  root.AtlasData = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
