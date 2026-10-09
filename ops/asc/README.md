# App Store Connect queries

Pulls the acquisition funnel — impressions, product page views, downloads by
source — without opening the App Store Connect web UI.

## Setup

1. In App Store Connect → **Users and Access → Integrations → App Store Connect
   API**, create a key with the **Admin** or **Sales and Reports** role. Download
   the `.p8` — Apple only offers it once.
2. Note the **Key ID** (next to the key) and the **Issuer ID** (above the key
   table).
3. The **vendor number** is in **Payments and Financial Reports**, top-left.
4. Drop the `.p8` in this directory and write `.env.asc`:

```
ASC_KEY_ID=XXXXXXXXXX
ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASC_PRIVATE_KEY_PATH=AuthKey_XXXXXXXXXX.p8
ASC_VENDOR_NUMBER=XXXXXXXX
ASC_APP_ID=6778487881
```

Both the `.p8` and `.env.asc` are gitignored.

## Commands

```sh
node ops/asc/asc.js sales 2026-08-08 3   # daily units, retroactive -- NOT installs, see below
node ops/asc/asc.js downloads 2026-08-08 # daily downloads by type -- this is what "installs" means
node ops/asc/asc.js snapshot             # backfill historical analytics, once
node ops/asc/asc.js subscribe            # daily analytics from here on
node ops/asc/asc.js reports              # request state + available reports
node ops/asc/asc.js fetch "App Store Discovery"
```

**Use `downloads` for install counts, never `sales`.** `sales`'s "Units" column
(Financial/Sales report) sums every `Product Type Identifier` together --
first-time downloads, auto-updates, redownloads, restores, manual updates, all
folded into one number. A day with a new build shipping looks like a huge
install spike when it's actually existing users auto-updating (verified
2026-08-20: `sales` reported 93 "units" the day 1.0.10 rolled out; the real
first-time-download count for that day was 7 -- the rest was the auto-update
wave). `downloads` reads the Analytics report's `Download Type` column instead,
which Apple already splits by type, and reports only the `First-time download`
row per day.

`downloads` also handles a second trap: Apple republishes each day's Analytics
numbers in more than one daily instance as devices keep reporting in --
2026-08-20's figures showed up in both the instance processed on 08-21 and the
one processed on 08-22, with identical per-row counts. Naively summing every
instance that mentions a date double- (or triple-) counts it. `downloads` keeps
only the most-recently-processed instance for each date. The most recent 1-2
days in its output are still provisional and can tick up on a later run.

`sales` works the moment the key exists and reaches back a year, but it only
carries `Product Type Identifier`, not download type -- fine for revenue
reconciliation, not for install counts. The funnel columns (including download
type) live in Analytics Reports, which Apple generates asynchronously: run
`snapshot` once for history and `subscribe` once for the daily feed, then
`reports` until the rows appear (hours, occasionally a day), then `fetch` or
`downloads`.

Both requests are already placed. The ONGOING one needs an occasional read to
stay alive — Apple flags an unread feed `stoppedDueToInactivity` and stops
generating it. `reports` prints that flag; `subscribe` starts a fresh feed if
it ever trips.

`sales`'s `Product Type Identifier` values for this app are bare `1`, `3`, `7`
(no `F`/`T` suffix -- those are pre-2013 codes and don't appear in current
reports), all at `Customer Price 0.00` since the app itself is free. `7` is the
Universal-build download, seen on both iPhone and iPad; `1` also appears
against iPhone devices; what specifically distinguishes `1` from `3` from `7`
did not resolve from the Sales SUMMARY report's columns (`CMB`, `Client`,
`Order Type`, `Promo Code`, `Vendor Identifier` are all blank in that report
subtype) and doesn't matter for install counting -- use `downloads` instead.
