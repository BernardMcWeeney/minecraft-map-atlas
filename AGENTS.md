# Codex working guidance — Minecraft Kingdom Atlas

Read `CODEX_TASK.md` and `README.md` before changing code.

- Purpose: extend the *working* custom editor for a Minecraft Bedrock Realm exported by uNmINeD 0.20.11-dev. OpenLayers projection and X/Z coordinates must be preserved.
- Host on **Cloudflare Workers with Static Assets**, not Cloudflare Pages. The application needs no API, database, R2, KV or authentication for the first release.
- Publishing is **manual commit-based**: editing in a public browser creates a local draft; exporting `annotations.json` enables the repo owner to upload and commit the changed file in GitHub. Cloudflare Workers Builds deploys the commit. Do not allow unauthenticated writes to a public server or embed GitHub tokens.
- `?edit=1` is a UI toggle, not security. Anyone can modify their own browser-local draft, but these edits are not live unless committed by an authorized GitHub user.
- Preserve existing v1/v2 JSON `features` and the browser localStorage key `realm-map-annotations-v1`. New annotation fields require safe defaults and migration tests. Preserve existing kingdom polygons and visual map styles by default.
- Protect JSON data by rendering names and descriptions with `textContent` or equivalent escaped rendering. Never treat user annotations as trusted HTML or executable JS.
- Use accessible, responsive, intuitive UI, with browse mode as default and editor controls unobtrusive.
- The attached project intentionally has **no map tiles or generated index.html**: the user must copy those from their private uNmINeD Web page export into `public/`. Do not fake world data or infer files that are not available.
- Work in small, independently testable steps and report commands, tests, deploy instructions and limitations clearly. Avoid unrelated dependency/framework changes unless justified.
