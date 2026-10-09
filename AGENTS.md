# Latere project instructions

Use a branch and PR for substantial changes. Run `mise run check` before pushing.
Commit completed work. Never commit credentials or generated customer data.

The deployment target for `latere.space` is one Node process on a droplet, behind a Cloudflare tunnel and Access.
That process serves the SPA, every `/api` route, and the render pipeline.
See [docs/OPERATIONS.md](docs/OPERATIONS.md) for operations and [docs/DECISIONS.md](docs/DECISIONS.md) for architectural reasons.

## Layout

| Directory | Purpose |
|---|---|
| `ui/` | React SPA. `App.tsx` defines section navigation. `panels/` and `content/` contain sections. |
| `server/` | HTTP server, Access gate, and one reader per panel |
| `engine/` | Four npm workspaces: `core` (decide), `render` (Sharp), `publish` (Buffer), `collect` (reward) |
| `content/` | Versioned hooks and taxonomy in YAML. Edit through commits. |
| `worker/` | The remaining Cloudflare job, for cron only |
| `ops/` | systemd units, tunnel configuration, bootstrap, deployment |

## Comments

Do not write explanatory source comments. Append explanations to the `docs/DECISIONS.md`.
Configuration files keep their comments: `wrangler.jsonc`, `.env.example`, `ops/*.sh`, and `content/*.yaml`.
Keep explanations of the keys in `.env.example`.

## Operational rules

- Never block an HTTP request on rendering. Cloudflare cuts origin responses at 100 seconds, regardless of tunnel configuration.
  Production includes remote model calls. Start work and return immediately, as `/api/generate` does.
  Let callers follow `/api/state` and the streamed log.
- Define each wire shape once, in the module that builds it. Panels import types from `server/` without restating them.
  `import type` disappears at build time.
  If you import a value across that boundary, make sure that server code does not enter the browser bundle.
- Display withheld counts, unavailable counts, and zero as distinct states.
  Never compute a rate that the source declines to publish.
  Never display a structural lookup failure as a small number.
- Read credentials only on the server. Never send keys to the browser.
  If a credential is missing, display its name as a gap on the panel without failing the request.
- Store durable content in the dedicated Latere Supabase project. Local render files are scratch.
  Keep migrations in `supabase/` here, separate from the Nonyxa app backend.
  Keep `LATERE_SUPABASE_SECRET_KEY` on the server. Never expose it in the UI.

## Adding a panel

1. Add an entry to `SECTIONS` in `ui/App.tsx` and a component beside `panels/Acquisition.tsx`.
2. Add connectors to `server/connectors.ts` so the section identifies its connections.
3. Add a route to `server/index.ts` that reads its source with a credential from the environment.
   Export the route's wire shape.
4. Choose a cache TTL based on how often the source changes.

Keep Nonyxa content facts in `content/`; voice references live in `docs/nonyxa/`.
Preserve the current UI unless a requested feature needs a change.
