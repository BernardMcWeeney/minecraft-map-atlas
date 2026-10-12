# Codex implementation request — Kingdom Atlas (Minecraft Bedrock)

## Context / existing working behavior

A Minecraft Bedrock Realm owner downloaded the live world as `.mcworld`, exported it using uNmINeD **Web page** (OpenLayers-based), and successfully opened a local editor at `http://localhost:8000/?edit=1`. The editor overlays polygons for Ravenshire, Highvale, Fortrock, NewPort, Old Navy and Deep Cove, and displays actual player builds. An earlier version v2 is included at `editor/realm-map-editor.js`. The owner's real terrain tiles, HTML, and existing annotations are **not included** in this handoff. Preserve them when they are copied in.

The app will be a publicly viewable **Kingdom Atlas** deployed through **Cloudflare Workers + Static Assets**, with a GitHub repo linked by **Cloudflare Workers Builds**. Avoid Cloudflare Pages, databases and server-side editing APIs.

## Nonnegotiable publishing workflow

1. Visitors browse the map and click features to read profiles.
2. Anybody visiting `?edit=1` can locally create/change annotations, but cannot publish to the site without GitHub repository write privileges.
3. Changes autosave to browser storage as a **draft**. Explicit **Export for Publishing** downloads a validated `annotations.json` with all geometry, metadata and category/layer settings; show clear instructions: replace `public/annotations.json` in GitHub and commit to main. Don't store GitHub tokens client-side.
4. Cloudflare Workers Builds (GitHub integration) deploys changes on commit. Provide precise setup guidance and `npm run dev` / `npm run deploy` scripts.
5. Preserve v1/v2 local draft and annotation imports and avoid losing existing kingdom shapes on upgrades. Include import/export and backup/restore.

## Features to implement, in order

### Priority 0: preserve and migrate
- Compatibility with uNmINeD/OpenLayers and correctly transforming coordinates X/Z; no terrain rerender or loss of existing buildings.
- Import existing `annotations.json` files and the v1 draft storage format. Stable permanent IDs for annotations; migration on load. Idempotent import/export and validation.
- If current `index.html` is an old uNmINeD export, patch safely using existing `tools/patch-unmined.py`, but ensure editor initializes *after* the original map.

### Priority 1: usable, durable editor
- Click a territory, marker or road for a read-only profile; in edit mode, edit name, owner/ruler, description, colour, icon, status, category, related kingdom and per-item label visibility **without deleting or redrawing geometry**.
- Keep separate shape-edit mode for polygon/line vertices; undo/redo, delete confirmation, restore after mistakes.
- Global toggle labels; layer toggles (territories, towns, transport, public services, landmarks, and optionally Nether layer).
- Search by name, description, owner, category; select result to zoom and open its profile.
- Geo/map coordinate display and copy Minecraft `/tp <x> ~ <z>` safely using Minecraft overworld coordinates.
- Add categories and distinguishable icons for rail station, train line, post office, town hall, castle, house, shop, mine, farm, inn/hotel, harbour, Nether portal, military base, library, and custom point. Avoid external tile or icon services that require network access during map browsing; bundle assets locally if necessary.
- Road/railway/boat route types with names, colours and clicked profiles; shareable links to a selected feature (using its stable ID) and to X/Z coords/zoom.

### Priority 2: polish
- Responsive mobile layout; accessible keyboard controls and contrast; declutter labels at low zoom; optional grouping of markers at small zoom.
- Territory index or directory, legend, ruler or ownership filtering; profile fields for settlement type, founded year, building status, notes, and in-world coordinates.
- Show the last world map export date separately from the annotation update date.
- Make it easy to republish a newer set of uNmINeD tiles without destroying annotations or changing Minecraft coordinate registration.

## Technical constraints and security

- Use Workers **Static Assets** from `public/`, `wrangler.jsonc` is already supplied. A Worker script is optional and not required for the MVP. Do not add D1/KV/R2 unless limits make them necessary and request approval first.
- On Workers Free, check static assets against **20,000-file** and **25 MiB per asset** limits. A large uNmINeD map may require reducing tile count or a different tile hosting solution; do not silently exceed limits.
- Do not mix Markdown/HTML from user descriptions directly into DOM `innerHTML` without safe escaping/sanitization. Be mindful of denial-of-service from huge/invalid JSON on import. Validate user-controlled fields.
- Public editing is not authentication; no secrets in client code. Only commit access publishes.
- Avoid rebuilding the map from a static PNG. Preserve uNmINeD's zoomable map/tiles and pre-existing OpenLayers layer.
- Keep the existing local editor in `editor/realm-map-editor.js` as baseline until tests verify its replacement; refactor only as necessary.

## Deliverables / acceptance criteria

- Worker-targeted project that starts with `npm install && npm run dev` once the user's uNmINeD export is installed under `public/`.
- `README.md` explaining how to bring in `index.html` and uNmINeD tiles, patch the map, import the current `annotations.json` backup, connect GitHub to Workers Builds, and deploy to `*.workers.dev` or a custom domain.
- Verified create/edit/delete of marker, polygon and route; saved names and profiles survive refresh and import/export; no lost v1/v2 annotations.
- Tests for format migration, JSON roundtrip, invalid data, coordinate transformation (with realistic fixtures/mocks), and export file contents. Run and report actual tests rather than claiming browser integration was tested without running it.
- Public view mode works without edit param; exports only alter drafts until GitHub commit; mobile layout and visibility toggles function.
- Explain missing source data/blockers precisely rather than inventing a world export. A human may need to provide the actual `public/` map files for visual integration testing.
