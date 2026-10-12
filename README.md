# Minecraft Kingdom Atlas — Codex handoff

This is a **Codex-ready project scaffold**, not a fully completed map or an automatic task transfer. It packages the existing tested-by-user map editor v2 and precise requirements to continue development. **The actual map HTML/tiles and annotations are on the user's Windows PC and are not included here.**

## Steps before handing to Codex

1. **In the existing editor** at `http://localhost:8000/?edit=1`, use **Export JSON** to back up the user's real annotated territory data. Keep a second copy safely on the computer.
2. Extract this ZIP into a new project folder and optionally create a GitHub repo from it.
3. In uNmINeD export **Web page** (not the single-image export), then copy the **contents** of that generated website into `public/`. This must include `index.html`, its scripts and its tile folders. Preserve any real `annotations.json` and do not replace it with the blank sample `annotations.example.json` in this starter.
4. After copying the world map, copy `editor/realm-map-editor.js` to `public/realm-map-editor.js` if not already present. From inside `public/` run `py ..\tools\patch-unmined.py` once to inject the map editor (idempotent).
5. Place your backed-up annotations file from step 1 at `public/annotations.json`. If starting fresh, copy `public/annotations.example.json` to `public/annotations.json`. Keep the original backup separately.
6. From the project root, run `npm install`, then `npm run dev`. Cloudflare Wrangler serves the assets locally (the exact localhost port is printed in the terminal).
7. Once the project loads, open the project in Codex, read `AGENTS.md` and `CODEX_TASK.md`, and implement each priority. If Codex uses a cloud environment, it must have access to a GitHub repository containing the source files; **do not upload the private Minecraft world itself**.

## How to publish on Cloudflare Workers

- Push the project to GitHub; in Cloudflare dashboard go to **Workers & Pages → Create application → Import a repository** and select the repository for a **Worker**, not a Pages project. Set deploy command `npx wrangler deploy` and use the linked repository's production branch. Workers Builds redeploys on push.
- Or manually deploy from the project root with `npm run deploy` after `npx wrangler login`.
- Editing in a public browser only changes **local draft data**. Use **Export JSON**, then in GitHub replace `public/annotations.json` and commit. Workers Builds republishes the static file; ordinary viewers get the new data on reload.

## Cloudflare Workers free limits

- Cloudflare Workers Free currently supports up to **20,000 static assets** per Worker version and **25 MiB per individual asset**. Before uploading real tiles check both size and count. If the map is too large, work with Codex on a reduced uNmINeD tile export or separate tile serving strategy. Static asset requests are free and do not call the Worker when served directly.
- Current docs: https://developers.cloudflare.com/workers/static-assets/ and https://developers.cloudflare.com/workers/platform/limits/

## Deploy configuration

`wrangler.jsonc` uses `assets.directory: ./public`, no server code or database. `npm run dev` runs Wrangler, `npm run deploy` deploys it.

## Important files

- `AGENTS.md` — rules for the coding agent.
- `CODEX_TASK.md` — requirements, tasks, acceptance tests and security guidance.
- `editor/realm-map-editor.js` — previous editor v2 source, working in the user's browser.
- `tools/patch-unmined.py` — injects the editor on an exported uNmINeD map (run from `public/`).
- `public/annotations.example.json` — blank example only; **the user must add their real export as `public/annotations.json`**.
- `docs/V2_ORIGINAL_README.md` — history/reference for the existing editor.

## Codex starting prompt

> Read AGENTS.md and CODEX_TASK.md. Continue the existing uNmINeD Kingdom Atlas editor, preserving all current annotations and true Minecraft X/Z coordinates. Implement the P0/P1 requirements, test and document. Use Cloudflare Workers with Static Assets and GitHub-linked publishing only: public browser edits are drafts, Export JSON then commit `public/annotations.json` to publish. Do not use Cloudflare Pages or add a backend/database. Explain blockers if the actual map export is not available.
