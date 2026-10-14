# Latere operations

## Local development

Run `mise install`, `npm ci`, and copy `.env.example` to `.env`. Configure the
services you use, then run `mise run dev`. The UI is on port 4322 and the API
on port 4323. `mise run check` runs lint, both typechecks, tests, and dead-code
checks. `mise run build` produces the console UI.

## Data and credentials

Latere uses Supabase project `pysmppmptbufenjzoeus` in US East. Set
`LATERE_SUPABASE_URL` and `LATERE_SUPABASE_SECRET_KEY` on the server. Keep the
Data API enabled, automatic table exposure disabled, and automatic RLS enabled.
The migrations explicitly grant only the service role access to content tables.
The public `media` bucket serves original images and rendered slides.

From this repository root:

```sh
supabase link --project-ref pysmppmptbufenjzoeus
supabase db push
npm run cli -- storage-check
```

The check writes temporary records and a tiny image, verifies reads and public
media access, then removes them. Never link this repository to the Nonyxa app
database. There is no legacy data import or local ledger fallback.

Versioned YAML contains seed hooks, Nonyxa facts, and taxonomy. Supabase keeps
generated hooks, review lessons, shots, posts, and capture requests. Only render
scratch is local. OpenRouter generates images and copy; Sharp renders PNG slides.
The placement report measures text fit and background complexity. Subject detection
and platform crop validation are not implemented. Generated posts require review.

## VPS and domain

Provision a Debian/Ubuntu host as root:

```sh
bash ops/bootstrap.sh git@github.com:arcasoy/latere.git
```

The script uses `/srv/latere`, service user `latere`, and
`/etc/latere/latere.env`. It installs fonts-liberation and ffmpeg. Fill in the
environment file, verify storage with that environment loaded, and start
`latere.service`. `latere-deploy.timer` polls the Latere repository's main branch;
`latere-collect.timer` collects publishing results. Code and credentials are separate.

Configure a Cloudflare tunnel for `latere.space` using `ops/cloudflared.yml.example`.
Create a Cloudflare Access application and put its audience in `ACCESS_AUD`.
The server also validates Access assertions. Do not enable `GTM_DEV_BYPASS` on the
VPS. Supabase secrets never enter the browser bundle.

An existing Nonyxa GTM installation must have its old deploy/collect timers stopped
before switching repositories. Install the Latere units and configure the new
checkout and environment; do not let both installations publish on the same schedule.
This repository extraction does not change live DNS, Access, or services.

## Publishing and integrations

Use the existing console to review generated slides and send them to Buffer.
`LATERE_PUBLISH_MODE=draft` creates drafts. Scheduling or immediate publishing
requires an explicit mode change. Run `npm run cli -- collect` for performance.

ASC credentials remain server-only. The optional
ASC operator tools live under `ops/`. Their credentials are ignored.
Nonyxa owns the Grafana dashboard, operator tools, and BI views in
[ops/grafana](https://github.com/arcasoy/nonyxa/tree/main/ops/grafana).
The Payback page is a placeholder for acquisition-cohort reporting. It makes no
RevenueCat, AppsFlyer, Grafana, or PostHog requests. Attribution, ad spend, and
subscription revenue must share a defined matching scheme before reporting starts.
Existing local RevenueCat credentials can remain for later integration.
Latere does not generate or deploy Grafana dashboards.

The cron-only `nonyxa-asc-feed` Cloudflare Worker lives under `worker/`. Its name
identifies the Nonyxa integration, not the console. It reads Apple's analytics feed
daily to keep it active. Configure its secrets separately, then run
`npm run deploy:worker`. Avoid creating a duplicate scheduled worker.
