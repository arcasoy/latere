# Latere

A personal go-to-market workspace for apps and websites. Create and review photo
content, publish through Buffer, and inspect App Store acquisition. Cohort payback
reporting is planned.
Nonyxa is the first supported app.

React and Vite provide the console. A Node server handles integrations and native
Sharp rendering. Supabase stores content records and media. OpenRouter generates
images and copy. Cloudflare Access protects the console at latere.space.

- [Setup and operations](docs/OPERATIONS.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Development instructions](AGENTS.md)

```sh
mise install
npm ci
cp .env.example .env
mise run dev
```

Run `mise run check` before pushing. Credentials stay in local environment files
or the VPS environment, never in Git. The Supabase project is configured separately
from the Nonyxa app backend.
