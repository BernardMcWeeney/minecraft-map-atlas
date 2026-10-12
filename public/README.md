# Free Bedrock Realm map editor (uNmINeD add-on)

This adds **click-to-place markers**, **drawn territories**, **roads/paths**, **vertex editing**, **deletion**, and **JSON import/export** to a rendered uNmINeD map.

It is a browser add-on to uNmINeD's existing OpenLayers web viewer, **not a Minecraft renderer**. You must create a real map export with uNmINeD first.

## Setup

1. **Back up your Realm first.** As Realm owner, Minecraft Bedrock: **Play → Realms → Realm Hub → World → Slots → three dots → Download World**. A local world copy appears in Minecraft; locate its save folder on your computer (or use an exported `.mcworld` and extract it). Avoid editing the active Realm.
2. Download uNmINeD (GUI) from https://unmined.net/downloads/ , open that Bedrock world copy and export **Web Map** to an empty folder (for example `C:\realm-web-map`). Render the Overworld first.
3. Copy `realm-map-editor.js`, `annotations.json`, and `patch-unmined.py` from this starter folder into the root of the uNmINeD **web export folder**, alongside its generated `index.html` and map metadata scripts.
4. In that export folder run `python patch-unmined.py` (or `py patch-unmined.py` on Windows). It adds the editor to the **end** of uNmINeD's `index.html`.
5. Serve the folder with `python -m http.server 8000` (or `py -m http.server 8000`). In your browser visit `http://localhost:8000/?edit=1` to author annotations.
6. Select **Marker**, **Boundary**, or **Road / Path**. Click the map; **double-click to finish** boundaries and paths. **Move / Edit** lets you drag vertices. Click **Export JSON** when finished.
7. Replace the existing `annotations.json` in the web export folder with your downloaded JSON. Visit `http://localhost:8000/` in a fresh window to see the public, read-only map.
8. Publish the **entire export folder** to your host (for example Cloudflare Pages within its file limits, or your own web server). Visitors see the published annotations; they don't need editing enabled.

## IMPORTANT: Persistence and security

- `?edit=1` is **not authentication**. It only enables editing **in that visitor's own browser**. It cannot update hosted map files, and nobody can publish without access to your hosting/deployment process. Avoid presenting this as a server-side role system.
- Edits are automatically saved to the **editing browser's localStorage**. They are NOT synchronized across devices, and clearing browser data can remove an unpublished draft. Always **Export JSON**, back it up, and replace the published `annotations.json`.
- For private maps, protect the entire site with proper authentication (e.g. Cloudflare Access on a suitable domain), not a query parameter or hidden URL.
- Coordinates are Minecraft **X, Z**, converted using uNmINeD's projection, not Earth latitude/longitude.
- Only **generated/explored chunks** saved in the Realm download appear. Empty, unexplored terrain is not rendered from the seed.
- Terrain images and annotations are separate: an updated terrain render doesn't inherently erase exported annotations. Keep copies of `annotations.json` and `realm-map-editor.js` outside the generated output. **Run the patch again after an export** if uNmINeD replaced `index.html`, and copy back `annotations.json` if needed.
- World snapshots are **manual** for a Realm. This is not a live player map. Do not give third-party sites your Minecraft/Microsoft login credentials.

## If patching says 'already patched' but map has no editor

Open the browser console (F12) and check for JS errors. Different uNmINeD versions may change the page's initialization pattern. The add-on requires a global `unmined` variable referencing the object made with `new Unmined(...)`, exposing `.olMap`, `.dataProjection`, and `.viewProjection`. In a customized map, append `new RealmMapEditor(yourUnminedInstance)` after its initialization instead of the default call.

If `index.html` is missing but `unmined.index.html` exists, an older uNmINeD exporter was used. Rename/copy that file to `index.html` or update uNmINeD.

## Hosting

- Cloudflare Pages free: 20,000 files per site, 25 MiB per file. Dashboard drag-and-drop deployments accept **only 1,000 files per upload**. For bigger exports, use Wrangler for deployments up to the 20,000-file total, or self-host via Caddy/nginx.
- Public map display works as a **static site**: no database, no map API keys.
- For *shared live editing* among multiple players, a backend with user authentication, a database and conflict handling is required. This starter deliberately avoids pretending browser-local edits are collaborative.

## Links

- Official uNmINeD: https://unmined.net/
- Official Realm download guide: https://help.minecraft.net/hc/en-us/articles/30035151042445
- OpenLayers: https://openlayers.org/
- Cloudflare Pages file limits: https://developers.cloudflare.com/pages/platform/limits/
