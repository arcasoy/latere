const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, ".env.grafana"), "utf8");
const DS = (env.match(/SUPABASE_DS_UID=(.+)/) || [])[1]?.trim();
if (!DS) {
  console.error("SUPABASE_DS_UID missing in .env.grafana");
  process.exit(1);
}

const excludeList = ((env.match(/EXCLUDE_EMAILS=(.+)/) || [])[1] || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
if (!excludeList.length) {
  console.error("EXCLUDE_EMAILS missing in .env.grafana");
  process.exit(1);
}
const excludeSql = excludeList.map((e) => `'${e.replace(/'/g, "''")}'`).join(",");

const ds = { type: "grafana-postgresql-datasource", uid: DS };

const EXT = `ext as (
  select u.id, coalesce(u.email, 'anon ' || left(u.id::text, 8)) as email,
    u.email is null as anon, u.created_at, u.last_sign_in_at
  from bi.users u
  where coalesce(u.email, '') not in (${excludeSql})
    and not u.internal
)`;

const IMPROVEMENT = `active as (
  select distinct on (fl.entry_id, fl.hand, fl.finger)
    fl.entry_id, fl.label
  from bi.finger_labels fl
  order by fl.entry_id, fl.hand, fl.finger, fl.labeled_at desc
),
day_load as (
  select de.user_id, de.entry_date,
    count(*) filter (where a.label = 'damaged') as damaged
  from active a
  join bi.daily_entries de on de.id = a.entry_id
  join ext on ext.id = de.user_id
  group by de.user_id, de.entry_date
  having count(*) = 10
),
seq as (
  select *, row_number() over (partition by user_id order by entry_date) as day_idx
  from day_load
),
judged as (
  select user_id, damaged,
    row_number() over (partition by user_id order by entry_date) as r,
    count(*) over (partition by user_id) as nj
  from seq where day_idx >= 3
),
anchor as (
  select user_id, max(damaged) filter (where day_idx = 2) as day2_damaged
  from seq group by user_id
),
per_user as (
  select j.user_id, max(j.nj) as judged_days,
    10 - avg(j.damaged) filter (where j.r <= j.nj / 2.0) as first_half,
    10 - avg(j.damaged) filter (where j.r >  j.nj / 2.0) as second_half
  from judged j
  join anchor an on an.user_id = j.user_id
  where j.nj >= 3 and an.day2_damaged > 0
  group by j.user_id
),
gain as (select user_id, (second_half - first_half)::numeric as g from per_user)`;

const WILCOXON = `ranked as (
  select g, sign(g) as s,
    rank() over (order by abs(g)) + (count(*) over (partition by abs(g)) - 1) / 2.0 as rnk
  from gain where g <> 0
),
w as (
  select coalesce(sum(rnk) filter (where s < 0), 0) as w_worse, count(*)::int as n
  from ranked
),
crit as (
  select w.*, case w.n
      when 6 then 2 when 7 then 3 when 8 then 5 when 9 then 8 when 10 then 10
      when 11 then 13 when 12 then 17 when 13 then 21 when 14 then 25 when 15 then 30
      when 16 then 35 when 17 then 41 when 18 then 47 when 19 then 53 when 20 then 60
      else case when w.n > 20
        then w.n * (w.n + 1) / 4.0 - 1.645 * sqrt(w.n * (w.n + 1) * (2 * w.n + 1) / 24.0)
        else null end
    end as crit_val
  from w
)`;

let panelId = 0;
function target(sql, format) {
  return { refId: "A", datasource: ds, rawSql: sql, format, editorMode: "code", rawQuery: true };
}
function statAt(title, sql, { x, y = 0, w = 6, h = 4, unit, fields = "" }) {
  return {
    id: ++panelId,
    title,
    type: "stat",
    datasource: ds,
    gridPos: { h, w, x, y },
    options: {
      reduceOptions: { calcs: ["lastNotNull"], fields, values: false },
      textMode: "value_and_name",
      colorMode: "value",
      graphMode: "none",
      justifyMode: "auto",
    },
    fieldConfig: {
      defaults: { unit: unit || "short", color: { mode: "fixed", fixedColor: "text" } },
      overrides: [],
    },
    targets: [target(sql, "table")],
  };
}
function stat(title, sql, x, unit) {
  return statAt(title, sql, { x, unit });
}
function verdict(title, sql, x, y, w, h) {
  return {
    id: ++panelId,
    title,
    type: "stat",
    datasource: ds,
    gridPos: { h, w, x, y },
    options: {
      reduceOptions: { calcs: ["lastNotNull"], fields: "/.*/", values: false },
      textMode: "value",
      colorMode: "background",
      graphMode: "none",
      justifyMode: "center",
    },
    fieldConfig: {
      defaults: {
        color: { mode: "thresholds" },
        thresholds: { mode: "absolute", steps: [{ color: "text", value: null }] },
        mappings: [
          {
            type: "value",
            options: {
              "IMPROVEMENT SHOWN": { color: "#7fb069", index: 0 },
              "NO IMPROVEMENT SHOWN": { color: "#d2674f", index: 1 },
              "NOT ENOUGH DATA": { color: "#7a6d61", index: 2 },
            },
          },
        ],
      },
      overrides: [],
    },
    targets: [target(sql, "table")],
  };
}
function timeseries(title, sql, x, y, w, opts = {}) {
  return {
    id: ++panelId,
    title,
    type: "timeseries",
    datasource: ds,
    gridPos: { h: 8, w, x, y },
    fieldConfig: {
      defaults: {
        custom: {
          drawStyle: opts.bars ? "bars" : "line",
          fillOpacity: opts.bars ? 70 : 12,
          lineWidth: 2,
          pointSize: 6,
          showPoints: opts.bars ? "never" : "auto",
          stacking: opts.stack ? { mode: "normal" } : { mode: "none" },
        },
        unit: "short",
      },
      overrides: opts.overrides || [],
    },
    options: { legend: { displayMode: "list", placement: "bottom" }, tooltip: { mode: "multi" } },
    targets: [target(sql, "time_series")],
  };
}
function barchart(title, sql, x, y, w) {
  return {
    id: ++panelId,
    title,
    type: "barchart",
    datasource: ds,
    gridPos: { h: 8, w, x, y },
    fieldConfig: {
      defaults: {
        custom: { lineWidth: 1, fillOpacity: 80 },
        unit: "short",
        color: { mode: "fixed", fixedColor: "#7fb069" },
      },
      overrides: [],
    },
    options: {
      xField: "day",
      legend: { showLegend: false },
      orientation: "auto",
      showValue: "auto",
    },
    targets: [target(sql, "table")],
  };
}
function table(title, sql, x, y, w, h, overrides = []) {
  return {
    id: ++panelId,
    title,
    type: "table",
    datasource: ds,
    gridPos: { h, w, x, y },
    fieldConfig: { defaults: { custom: { align: "auto", filterable: true } }, overrides },
    options: { showHeader: true, cellHeight: "sm" },
    targets: [target(sql, "table")],
  };
}

const EMAIL_DRILLDOWN = [
  {
    matcher: { id: "byName", options: "email" },
    properties: [
      {
        id: "links",
        value: [
          {
            title: "Show this user's daily verdicts below",
            url: "/d/nonyxa-early-users?var-user=${__value.raw}&from=${__from}&to=${__to}",
          },
        ],
      },
    ],
  },
];

const green = "#7fb069",
  red = "#d2674f",
  amber = "#e8a06a";

const panels = [
  stat("Installs (app opened)", `with ${EXT} select count(*)::int as "installs" from ext`, 0),
  stat(
    "Activated (≥1 check-in)",
    `with ${EXT} select count(distinct de.user_id)::int as "activated" from bi.daily_entries de join ext on ext.id = de.user_id`,
    6,
  ),
  stat(
    "Never captured",
    `with ${EXT} select (count(distinct ext.id) - count(distinct de.user_id))::int as "never captured" from ext left join bi.daily_entries de on de.user_id = ext.id`,
    12,
  ),
  stat(
    "Total check-in days",
    `with ${EXT} select count(*)::int as "check-in days" from bi.daily_entries de join ext on ext.id = de.user_id`,
    18,
  ),

  timeseries(
    "Installs per ${bucket}",
    `with ${EXT} select date_trunc('\${bucket}', created_at) as time, count(*)::int as "installs" from ext group by 1 order by 1`,
    0,
    4,
    12,
    {
      bars: true,
      overrides: [
        {
          matcher: { id: "byName", options: "installs" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: green } }],
        },
      ],
    },
  ),
  timeseries(
    "Cumulative installs",
    `with ${EXT} select created_at as time, (count(*) over (order by created_at))::int as "installs" from ext order by created_at`,
    12,
    4,
    12,
  ),

  timeseries(
    "Checked in vs not, per ${bucket}",
    `with ${EXT},
periods as (
  select generate_series(
    date_trunc('\${bucket}', (select min(created_at) from ext)),
    date_trunc('\${bucket}', now()),
    interval '1 \${bucket}'
  ) as p
),
eligible as (
  select p, count(*)::int as n
  from periods join ext on ext.created_at < (p + interval '1 \${bucket}')
  group by p
),
checked as (
  select date_trunc('\${bucket}', de.entry_date::timestamp) as p,
         count(distinct de.user_id)::int as n
  from bi.daily_entries de join ext on ext.id = de.user_id
  group by 1
)
select e.p as time,
  coalesce(c.n, 0)                          as "checked in",
  greatest(e.n - coalesce(c.n, 0), 0)       as "not checked in"
from eligible e left join checked c on c.p = e.p
order by e.p`,
    0,
    12,
    24,
    {
      bars: true,
      stack: true,
      overrides: [
        {
          matcher: { id: "byName", options: "checked in" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: green } }],
        },
        {
          matcher: { id: "byName", options: "not checked in" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: red } }],
        },
      ],
    },
  ),

  timeseries(
    "Daily check-ins",
    `with ${EXT} select (de.entry_date::timestamp) as time, count(*)::int as "check-ins" from bi.daily_entries de join ext on ext.id = de.user_id group by 1 order by 1`,
    0,
    20,
    12,
    {
      bars: true,
      overrides: [
        {
          matcher: { id: "byName", options: "check-ins" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: amber } }],
        },
      ],
    },
  ),
  timeseries(
    "Clean vs damaged fingers per day (active label)",
    `with ${EXT},
active as (
  select distinct on (fl.entry_id, fl.hand, fl.finger)
    de.entry_date, fl.label
  from bi.finger_labels fl
  join bi.daily_entries de on de.id = fl.entry_id
  join ext on ext.id = de.user_id
  order by fl.entry_id, fl.hand, fl.finger, fl.labeled_at desc
)
select (entry_date::timestamp) as time,
  sum((label='clean')::int)::int   as "clean",
  sum((label='damaged')::int)::int as "damaged"
from active group by 1 order by 1`,
    12,
    20,
    12,
    {
      bars: true,
      stack: true,
      overrides: [
        {
          matcher: { id: "byName", options: "clean" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: green } }],
        },
        {
          matcher: { id: "byName", options: "damaged" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: red } }],
        },
      ],
    },
  ),

  barchart(
    "Retention: users reaching ≥ N check-in days",
    `with ${EXT},
per_user as (select ext.id, count(distinct de.entry_date) as days from ext join bi.daily_entries de on de.user_id = ext.id group by ext.id)
select g.n as "day", (select count(*) from per_user where days >= g.n)::int as "users"
from generate_series(1,14) g(n) order by g.n`,
    0,
    28,
    24,
  ),

  verdict(
    "Are users improving?",
    `with ${EXT}, ${IMPROVEMENT}, ${WILCOXON}
select case
    when c.n < 6 then 'NOT ENOUGH DATA'
    when c.w_worse <= c.crit_val then 'IMPROVEMENT SHOWN'
    else 'NO IMPROVEMENT SHOWN'
  end as "verdict"
from crit c`,
    0,
    36,
    12,
    5,
  ),
  statAt(
    "Median clean fingertips gained",
    `with ${EXT}, ${IMPROVEMENT}
select round((percentile_cont(0.5) within group (order by g))::numeric, 2)::float8
       as "fingertips" from gain`,
    { x: 12, y: 36, w: 6, h: 5, fields: "/.*/" },
  ),
  statAt(
    "Users improved",
    `with ${EXT}, ${IMPROVEMENT}
select (count(*) filter (where g > 0))::text || ' of ' || (count(*) filter (where g <> 0))::text
       as "users" from gain`,
    { x: 18, y: 36, w: 6, h: 5, fields: "/.*/" },
  ),
  table(
    "User leaderboard (most check-ins first)",
    `with ${EXT},
active as (
  -- one row per (entry, hand, finger) = the most recent verdict for that finger-day
  select distinct on (fl.entry_id, fl.hand, fl.finger)
    de.user_id, fl.label
  from bi.finger_labels fl
  join bi.daily_entries de on de.id = fl.entry_id
  join ext on ext.id = de.user_id
  order by fl.entry_id, fl.hand, fl.finger, fl.labeled_at desc
),
verd as (
  select user_id,
    sum((label='clean')::int)::int   as clean,
    sum((label='damaged')::int)::int as damaged
  from active group by user_id
),
days as (
  -- aggregate separately so the verdict join can't fan out the day count
  select de.user_id,
    count(distinct de.entry_date)::int as d,
    min(de.entry_date) as first_day,
    max(de.entry_date) as last_day
  from bi.daily_entries de join ext on ext.id = de.user_id
  group by de.user_id
),
islands as (
  -- gaps-and-islands: consecutive dates share (date - row_number)
  select de.user_id, de.entry_date,
    de.entry_date - (row_number() over (partition by de.user_id order by de.entry_date))::int as grp
  from bi.daily_entries de join ext on ext.id = de.user_id
),
runs as (
  select user_id, grp, count(*)::int as len, max(entry_date) as run_end
  from islands group by user_id, grp
),
streak as (
  -- the run containing the user's most recent check-in = their current streak
  select distinct on (user_id) user_id, len
  from runs order by user_id, run_end desc
)
select ext.email,
  coalesce(days.d, 0)         as "check-in days",
  coalesce(streak.len, 0)     as "streak",
  coalesce(verd.clean, 0)     as "clean",
  coalesce(verd.damaged, 0)   as "damaged",
  round(100.0 * coalesce(verd.clean,0)
        / nullif(coalesce(verd.clean,0) + coalesce(verd.damaged,0), 0))::int as "clean %",
  days.first_day              as "first day",
  days.last_day               as "last day",
  -- the user's local date, not the DB's UTC date: ingest_capture stamps entry_date
  -- in the phone's zone and saves that zone to profiles.timezone, so against
  -- current_date a Bucharest check-in at 00:03 read -1 and a US evening one read 1
  ((now() at time zone coalesce(p.timezone, 'UTC'))::date - days.last_day)::int as "days since"
from ext
left join bi.profiles p on p.id = ext.id
left join days on days.user_id = ext.id
left join verd on verd.user_id = ext.id
left join streak on streak.user_id = ext.id
where not ext.anon or days.d is not null
order by coalesce(days.d,0) desc, days.first_day`,
    0,
    41,
    24,
    9,
    EMAIL_DRILLDOWN,
  ),

  timeseries(
    "Daily verdicts — $user",
    `with ${EXT},
active as (
  select distinct on (fl.entry_id, fl.hand, fl.finger)
    de.entry_date, fl.label
  from bi.finger_labels fl
  join bi.daily_entries de on de.id = fl.entry_id
  join ext on ext.id = de.user_id
  where ext.email = '$user'
  order by fl.entry_id, fl.hand, fl.finger, fl.labeled_at desc
)
select (entry_date::timestamp) as time,
  sum((label='clean')::int)::int   as "clean",
  sum((label='damaged')::int)::int as "damaged"
from active group by 1 order by 1`,
    0,
    50,
    24,
    {
      bars: true,
      stack: true,
      overrides: [
        {
          matcher: { id: "byName", options: "clean" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: green } }],
        },
        {
          matcher: { id: "byName", options: "damaged" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: red } }],
        },
      ],
    },
  ),

  // 'failed' and 'stuck' are written only by the superseded two-call path and
  // the reaper behind it, so both trend to zero as builds shipped before
  // 2026-08-14 drain — that is the endpoints going away, not failures stopping.
  timeseries(
    "Capture outcomes per day (all users)",
    `with ${EXT}
select date_trunc('day', c.captured_at) as time,
  sum((c.image_status='ok')::int)::int                         as "ok",
  sum((c.image_status='failed')::int)::int                     as "failed",
  sum((c.image_status='hands_not_detected')::int)::int         as "no hands",
  sum((c.image_status='low_hand_confidence')::int)::int        as "low confidence",
  sum((c.image_status in ('pending','processing'))::int)::int  as "stuck"
from bi.captures c
join bi.daily_entries de on de.id = c.entry_id
join ext on ext.id = de.user_id
group by 1 order by 1`,
    0,
    58,
    12,
    {
      bars: true,
      stack: true,
      overrides: [
        {
          matcher: { id: "byName", options: "ok" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: green } }],
        },
        {
          matcher: { id: "byName", options: "failed" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: red } }],
        },
        {
          matcher: { id: "byName", options: "no hands" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: amber } }],
        },
        {
          matcher: { id: "byName", options: "low confidence" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: "#c98b4b" } }],
        },
        {
          matcher: { id: "byName", options: "stuck" },
          properties: [{ id: "color", value: { mode: "fixed", fixedColor: "#7a6d61" } }],
        },
      ],
    },
  ),
  // NOT a success rate. A capture that fails to upload writes no row at all
  // (ingest_capture is one transaction and nothing precedes it), so rows can
  // only ever report what the DEVICE decided: it found a hand, or it did not.
  // Dividing by count(*) would read 100% forever and mean nothing. Transport
  // failure lives in PostHog's capture_failed, which this datasource cannot see.
  timeseries(
    "Hands found per day, % of captures the device could use (all users)",
    `with ${EXT}
select date_trunc('day', c.captured_at) as time,
  round(100.0 * sum((c.image_status='ok')::int)
        / nullif(sum((c.image_status in ('ok','hands_not_detected'))::int),0))::int
    as "hands found %"
from bi.captures c
join bi.daily_entries de on de.id = c.entry_id
join ext on ext.id = de.user_id
group by 1 order by 1`,
    12,
    58,
    12,
    {
      overrides: [
        {
          matcher: { id: "byName", options: "hands found %" },
          properties: [
            { id: "color", value: { mode: "fixed", fixedColor: green } },
            { id: "unit", value: "percent" },
            { id: "min", value: 0 },
            { id: "max", value: 100 },
          ],
        },
      ],
    },
  ),
];

const dashboard = {
  uid: "nonyxa-early-users",
  title: "Nonyxa · Early Users",
  tags: ["nonyxa", "product"],
  timezone: "browser",
  schemaVersion: 39,
  editable: true,
  refresh: "30m",
  time: { from: "now-30d", to: "now" },
  templating: {
    list: [
      {
        name: "bucket",
        label: "Group by",
        type: "custom",
        query: "day,week,month",
        includeAll: false,
        multi: false,
        current: { selected: true, text: "day", value: "day" },
        options: [
          { selected: true, text: "day", value: "day" },
          { selected: false, text: "week", value: "week" },
          { selected: false, text: "month", value: "month" },
        ],
      },
      {
        name: "user",
        label: "User",
        type: "query",
        datasource: ds,
        query: {
          refId: "user-variable",
          format: "table",
          rawSql: `with ${EXT},
days as (
  select de.user_id, count(distinct de.entry_date) as d
  from bi.daily_entries de join ext on ext.id = de.user_id
  group by de.user_id
)
select ext.email
from ext left join days on days.user_id = ext.id
where not ext.anon or days.d is not null
order by coalesce(days.d,0) desc, ext.created_at`,
        },
        refresh: 1,
        includeAll: false,
        multi: false,
        sort: 0,
        current: {},
        options: [],
      },
    ],
  },
  annotations: { list: [] },
  panels,
};

const outDir = path.join(__dirname, "dashboards");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "early-users.json"), JSON.stringify(dashboard, null, 2) + "\n");
console.log("wrote dashboards/early-users.json —", panels.length, "panels, uid", dashboard.uid);
