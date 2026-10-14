# Architecture decisions

## Standalone GTM workspace

Accepted. Latere owns its console, content engine, metrics integrations, scheduled
ASC feed, and deployment. Nonyxa is its first supported app. The Nonyxa app
repository owns its product database and BI views; Latere reads them through Grafana.
No runtime import crosses between repositories. Brand facts and voice references
live here so content generation does not depend on another checkout.

## Native photo rendering

Accepted. Sharp renders photo posts without a browser. Text fit and background
complexity determine placement. Subject analysis and platform crop validation remain
unimplemented and are reported as such. Cover-plus-list posts honor the promised
item count; other posts can use variable lengths. Publishing requires review.

## Supabase owns durable content

Accepted. A dedicated Latere Supabase project stores posts, shots, requests,
generated hooks, and review lessons. Tables retain the typed record as JSONB keyed
by ID. Updates affect one record. RLS is enabled and only the server role has table
access. A public media bucket serves images to previews and Buffer.
There is no legacy import, dual write, local ledger, or bucket catalog file.
The Node service holds credentials and keeps only disposable render scratch locally.

## Separate source and deployment

Accepted. The new repository has independent checks and VPS service units.
Source extraction does not activate a deployment or change domain configuration.
The domain is latere.space, protected by Cloudflare Access and a matching server
assertion check. The ASC feed worker retains its integration-specific name to avoid
creating a duplicate schedule. Generated Grafana dashboards stay out of Git because
they embed operator-configured account exclusions.


## Nonyxa owns its Grafana dashboard

Accepted. Supersedes the Grafana tool extraction in “Separate source and deployment”.
The early-user dashboard, generator, sync tools, and BI views belong to Nonyxa
because their queries depend on its app schema. The Payback page keeps a paused activity section with an explanation.
Latere makes no Grafana queries. RevenueCat reports remain available. The source move
does not change the hosted dashboard or database connection.
