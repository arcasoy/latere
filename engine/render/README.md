# Native photo rendering

The renderer creates ordered PNG slides through Sharp, libvips, and Pango.
No browser, React renderer, video compositor, or Studio process is required.
The console remains a React application served by Node.

`renderSlideshow` accepts the existing creative factors and resolves catalog assets.
Remote images must be in the configured Latere Supabase public `media` bucket. Redirects are disabled. Downloads
have a timeout and a 25 MiB limit. Decoded images have a 40-megapixel limit.
Accepted backgrounds are single-frame JPEG, PNG, WebP, or AVIF images.

Pango wraps and measures literal text. The renderer reduces the font size to a
readable minimum, then rejects overflow. It scores three candidate regions by
background edge complexity and records each score. A dark text panel supplies
contrast. Subject detection and platform crop checks remain unimplemented and are
reported as `not_run`. Generated posts require human review before publishing.

The output retains the existing 1080-wide 9:16 and 4:5 formats. Each attempt has
its own directory. A failed attempt deletes its partial files. Successful attempts
include ordered slides and `report.json` with source hashes and layout measurements.
The ledger stores the report under `render_spec`. The report is stored with the post in Supabase.

The VPS bootstrap installs Liberation Sans and ffmpeg. Pango owns shaping and
wrapping; there is no custom typography engine. ffprobe supports metadata reads
for video assets already in the library. New video rendering is unsupported.

Run from the repository root:

```sh
npm run test:render
npm run cli -- render <variant-id>
```

The remaining work includes subject masks, crop validation, persistent jobs,
asset snapshots, and the hosted production API. The current image cache lasts
for one render attempt. Hashes identify inputs but do not preserve source bytes.
