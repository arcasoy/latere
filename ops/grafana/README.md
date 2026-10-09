# Grafana — Nonyxa early-user metrics

Dashboards-as-code for the Supabase (Postgres) product data. Generate dashboard JSON locally from `gen_dashboard.js`, then push it to Grafana.
Generated JSON is ignored because it embeds configured account exclusions.

## One-time setup

### 1. Create the read-only DB role
Open Supabase → **SQL Editor** → paste [the Nonyxa BI view definitions](https://github.com/arcasoy/nonyxa/blob/main/ops/grafana/01_grafana_readonly_role.sql),
**replace the password placeholder**, and Run. This creates:
- role `grafana_ro` (SELECT-only),
- a `bi` schema of definer views that bypass RLS (owner = postgres),
- `bi.users` exposing only safe `auth.users` columns (no secrets).

### 2. Add the datasource in Grafana
Grafana → **Connections → Data sources → Add → PostgreSQL**. Use the Supabase
**Session pooler** connection (IPv4; direct DB is IPv6-only):
Supabase → **Project Settings → Database → Connection pooling → Session mode**.

| Field    | Value |
|----------|-------|
| Host:Port| `aws-1-us-west-2.pooler.supabase.com:5432` (Session mode) |
| Database | `postgres` |
| User     | `grafana_ro.puxacmnyszfckhpllcfy`  ← role name **dot** project ref (pooler format) |
| Password | the password you set in step 1 |
| TLS/SSL  | **require** |

Save & test → should be green. Note the datasource **UID** (Settings URL) — dashboards reference it.

### 3. Hand Claude a service account (to push dashboards)
Grafana → **Administration → Users and access → Service accounts → Add** (role: **Editor**)
→ **Add token**. Give Claude the **token + your stack URL** (`https://<you>.grafana.net`).
Token is stored locally, git-ignored (`.env.grafana`), never committed.

## Sync

`./sync.sh push <dashboards/file.json>` — upload/update a dashboard in Grafana.
`./sync.sh pull <uid> <dashboards/file.json>` — pull the live dashboard back to disk to commit.

Panel SQL is generated, not hand-edited: change `gen_dashboard.js`, run
`node gen_dashboard.js`, then push. If the change references a new `bi.*`
column, re-run that view's section of
[the Nonyxa BI view definitions](https://github.com/arcasoy/nonyxa/blob/main/ops/grafana/01_grafana_readonly_role.sql) in the Supabase
SQL editor **before** pushing, or every panel fails on a missing column.

## Excluding internal accounts

Two mechanisms, because one of them cannot see anonymous users:

- **Named accounts:** `EXCLUDE_EMAILS` in `.env.grafana`, baked into each
  panel query at generation time. Add an address, regenerate, push.
- **Simulator and dev-build installs:** the app stamps `internal: true` into
  `raw_user_meta_data` when it creates an anonymous account from a Simulator or
  a Metro-attached build. `bi.users` exposes it and the panels filter on it. An
  anonymous account has no email, so the list above cannot reach these.

Real anonymous users stay in every count: `internal` is independent of
`is_anonymous`.

## What's tracked vs secret
- **Tracked:** the dashboard generator and this README. Generated dashboard JSON stays local because it embeds account exclusions.
- **Never committed:** the DB password, the Grafana token (`.env.grafana`).
