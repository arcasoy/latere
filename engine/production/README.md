# Photo production

This module starts the migration to browser-free photo production. Latere keeps
the asset catalog, tags, creative ranking, review console, and performance ledger.
The production worker will own image analysis, layout, rendering, and visual checks.

## Current scope

The first increment validates a production manifest. It does not render, fetch
assets, schedule jobs, or publish posts. The existing engine now uses the
[native photo renderer](../render/README.md).

Run from the repository root:

```sh
npm run production -- validate path/to/manifest.json
npm run test:production
```

The command returns JSON and exits with code 1 on failure. The report identifies
each failure by field path and code. `visual_validation: not_run` prevents a
valid manifest from appearing to be a visually approved post.

The contract lives in [manifest.ts](manifest.ts). It reuses the existing slide
and creative-factor types. Each batch has a request key and explicit posts.
Each post has a template version, creative tags, stable slide IDs, and asset
references. Asset references identify an existing catalog shot or an HTTPS URL.
The manifest check does not establish asset availability or permission to fetch
a URL. The future asset resolver must enforce network restrictions before retrieval.

The first slide contains the tracked hook. Content slides follow it. A final CTA
is optional. A numbered post declares its promised item count and ordered item
numbers. Five items produce six slides, or seven with a separate CTA.
Story posts omit the promise and item numbers. The command does not infer promises
from natural-language copy. A later semantic check must compare copy with metadata.

Input text positions are rejected. The production worker must select positions
from image analysis and measured text bounds. Input overlays are unsupported until
the placement checks can account for their protected regions.

## Migration sequence

1. Add immutable asset snapshots and content hashes for reproducible output.
2. Add subject masks, protected hand regions, and image-complexity measurements.
3. Measure text and rank candidate layouts against the selected safe-area profile.
4. Connect a browser-free renderer and inspect final pixels for clipping and readability.
5. Evaluate 30–50 representative images, including deliberately bad inputs.
6. Add persistent jobs, bounded repairs, spending limits, and duplicate-request protection.
7. Connect the hosted API, CLI, review console, and single-slide revisions.
8. Move the native renderer out of the API process and into the persistent worker.
9. Deploy and exercise recurring batch submission with publishing disabled.

The acceptance set must include hands near text, busy backgrounds, long copy,
missing assets, and variable slide counts. Visual reports must retain candidate
scores, rejection reasons, and debug overlays. Uncertain subject detection must
remain visible in the report. A vision-model opinion cannot replace measured checks.

## Runtime boundary

The Node server serves the console and authenticated API. Sharp provides native
image rendering without a browser. A future worker will isolate production jobs.
Subject analysis can use Python if its selected model requires it. The worker
does not need an agent framework. External agents submit jobs and inspect results.

Production quality, creative feedback, and published performance remain separate
signals. A layout failure must not reduce a hook's performance rank. The production
store starts empty in a dedicated Supabase project. No production path publishes
until it passes the output checks and an explicit publishing action occurs.
