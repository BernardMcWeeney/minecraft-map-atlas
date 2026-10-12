# Minecraft Kingdom Atlas

A browser-local annotation editor for a uNmINeD 0.20.11-dev **Web page** export. Hosting uses **Cloudflare Workers with Static Assets**, without a database or editing API. The repository contains the owner's uploaded Web page export and six existing annotations. Keep independent backups before refreshing terrain or editing annotations.

## Install and bring in your world

Use Node.js 22 or newer, npm and Python 3. From the repository root:

```sh
npm ci
```

Before upgrading, export and separately back up the current annotations and browser draft. Keep the same browser origin to retain `realm-map-annotations-v1`; moving hosts or local ports requires exporting/importing your backup.

Copy the **contents** of your uNmINeD Web page export into `public/`, including its `index.html`, scripts and tile folders. Never overwrite `public/annotations.json` with the empty example. Put your backed-up real annotations there; only a genuinely new atlas should start from `annotations.example.json`.

```sh
npm run prepare:assets
npm run dev
```

Preparation copies the editor and its local data module into `public/` and idempotently patches the generated HTML after the original map initialization. It supports the supplied baseline's `const unmined = new Unmined(...)` pattern. For a differently named or asynchronously initialized map, manually load `atlas-data.js` then `realm-map-editor.js` and call `new RealmMapEditor(yourUnminedInstance)` only after `olMap`, `dataProjection` and `viewProjection` are ready. The patcher refuses unfamiliar HTML; it does not reconstruct a map.

Use the local address Wrangler prints. Browse is the default. Click the **✎ pencil** in the top-right corner to enable local editing and show the drawing toolbar. Choose **Boundary**, click polygon corners and double-click to finish; use **Export for Publishing** to download `annotations.json`. Click **✓** to return to the published map; your local draft is retained for the next editing session. `?edit=1` also opens editing directly. This parameter is not authentication.

## Edit, back up and publish

- Click kingdoms, markers or routes for profiles. Edit metadata independently of geometry. Shape mode edits vertices; Escape returns to browse. Delete asks for confirmation. Undo/redo buttons and Ctrl/Cmd-Z, Shift-Z or Ctrl/Cmd-Y restore changes, imports and resets within this session. History holds 100 steps and does not survive reload.
- Search names, descriptions, owners and categories; filter rulers, use the territory directory and layer legend. Layers and labels do not delete features. Labels declutter below zoom 2; marker icons use local Unicode glyphs, with appearance dependent on installed fonts.
- Categories include railway stations, railways, roads, boat routes, post offices, town halls, castles, houses, shops, mines, farms, inns/hotels, harbours, Nether portals, military bases, libraries and custom markers. Assign layer, category and related kingdom in the profile; no category automatically creates terrain or a second dimension map.
- Click the map for Minecraft X/Z, copy `/tp <x> ~ <z>`, or copy a coordinate/zoom link. Feature links use permanent IDs. Profile coordinates are the approximate bounding-box centre.
- **Export for Publishing** downloads validated `annotations.json`, including geometry, metadata, settings and dates. It is also the portable backup. Import JSON restores a backup after confirmation. Invalid imports are rejected before changing existing shapes. A corrupt stored draft is retained and blocks export until explicitly restored/reset.
- Replace **`public/annotations.json` in GitHub and commit to `main`** to publish. A visitor's local draft never writes to GitHub or the hosted site. No GitHub token is stored in the browser. Only a repository user with write access can publish.

Version 1 and 2 imports migrate to version 3; stable deterministic legacy IDs are assigned once and retained thereafter. Existing kingdom rings, holes and vertex ordering are kept. JSON is limited to 8 MiB, 10,000 features and 200,000 vertices; unsupported versions, duplicate IDs, invalid/open rings and nonfinite coordinates fail explicitly. User strings render as text, never annotation HTML. Existing metadata fields from the baseline are retained; the extended schema is documented in `editor/atlas-data.js`.

## Cloudflare Workers Builds

1. Commit the source, lockfile, actual `public/` Web page export and `public/annotations.json` to the GitHub repository. Do not commit the `.mcworld`, credentials or browser-only drafts.
2. In Cloudflare's **Workers & Pages** area, create/import a **Worker** from the GitHub repository. Select production branch `main`, root directory `/`, build command `npm ci && npm run prepare:assets && npm run check:assets`, and deploy command **`npm run deploy`**. If the dashboard offers additional branches, use the same build/deploy checks. Do not choose a Pages project.
3. `wrangler.jsonc` serves `./public` as Workers Static Assets, with no Worker API, KV, D1 or R2. Workers Builds redeploys committed updates. The resulting hostname is `minecraft-kingdom-atlas.<your-account-subdomain>.workers.dev`; attach a custom domain through the Worker's domain settings if desired.
4. Manual deployment is also available: authenticate using `npx wrangler login`, then `npm run deploy`. Authentication belongs to the repository owner/Cloudflare integration, not the public browser editor.

`npm run deploy` first prepares assets and runs preflight. It refuses a missing generated map, missing/invalid real annotations, more than **20,000 files**, or any asset larger than **25 MiB** (Workers Free limits). Reduce export area/zoom levels if needed; no alternate storage is added automatically. Check current limits at https://developers.cloudflare.com/workers/static-assets/ and https://developers.cloudflare.com/workers/platform/limits/ before production deployment.

## Refresh terrain without losing annotations

Back up `annotations.json` and the browser draft first. Replace only generated uNmINeD terrain assets/scripts/HTML, keeping annotations, editor assets and coordinate registration. Run `npm run prepare:assets` again on the new HTML. Set the terrain export date in the editor's directory, export annotations and commit both updates. The terrain date and annotation modification timestamp are separate. Verify known X/Z landmarks against the new export before publishing; a changed uNmINeD projection or origin must be investigated rather than moving kingdom vertices to compensate.

## Validation and limitations

```sh
npm test
npm run check:assets
```

Tests cover migration, JSON roundtrip, invalid imports, exact geometry retention, real OpenLayers custom projection transforms, simulated DOM profile editing, drawing-event creation, shape changes, delete confirmation, undo/redo, exports, corrupt draft protection, patching and asset-size enforcement. The DOM tests use actual OpenLayers geometry/source/interaction classes with a mocked map and custom X/Z projection. They do **not** claim rendered map, real mouse/touch interaction or your exact uNmINeD visual integration was tested. Check create/edit/delete, browser refresh, imports/exports, mobile panels and coordinate registration on the actual world before release. Marker clustering is optional and is not implemented.

The original v2 editor is retained at `docs/realm-map-editor-v2.js`. `docs/V2_ORIGINAL_README.md` is historical only; its old hosting advice is superseded by this Workers workflow.

### Rendered-map smoke test

The uploaded map passed a Chromium smoke test for browse mode, pencil toggle, boundary drawing, export retaining all original annotations, finish editing, draft recovery after refresh, and mobile toolbar width. This uses an isolated browser session and does not modify published annotations. To rerun with Wrangler serving port 8787 and system Chromium:

```sh
npm install --prefix /tmp/atlas-browser playwright
NODE_PATH=/tmp/atlas-browser/node_modules node tools/browser-smoke.cjs
```

Set `ATLAS_CHROMIUM_PATH` if Chromium is installed elsewhere. These browser test tools are optional and are not bundled into the public map.

### Minecraft interface

The map uses locally bundled Minecraft-style panels and a grass-block SVG favicon. A fixed header shows live Minecraft X/Z coordinates on desktop and phones; clicking the readout copies `/tp`. The directory stays compact until opened. Editor tools appear only after clicking the pencil, with Export for Publishing at the top. Zoom and pan are constrained to the exported terrain bounds; resizing recalculates the minimum zoom while keeping the original uNmINeD projection and tile resolutions. The overview button recentres the world at the permitted zoom. A different viewport aspect ratio can crop the outer world edge instead of displaying blank margins. The browser smoke test also checks those constraints, coordinates and the favicon.
