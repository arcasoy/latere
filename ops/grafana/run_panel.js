const fs = require("node:fs"),
  https = require("node:https"),
  path = require("node:path");
const env = fs.readFileSync(path.join(__dirname, ".env.grafana"), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const [URL_, TOKEN, DS] = [get("GRAFANA_URL"), get("GRAFANA_TOKEN"), get("SUPABASE_DS_UID")];
const prefix = process.argv[2] || "User leaderboard";
const maxRows = Number(process.argv[3] || 12);
const dash = require("./dashboards/early-users.json");
const panel = dash.panels.find((p) => p.title.startsWith(prefix));
if (!panel) {
  console.error("no panel matching:", prefix);
  process.exit(1);
}
const body = JSON.stringify({
  queries: [
    {
      refId: "A",
      datasource: { type: "grafana-postgresql-datasource", uid: DS },
      rawSql: panel.targets[0].rawSql,
      format: "table",
      rawQuery: true,
    },
  ],
  from: "now-365d",
  to: "now",
});
const u = new URL(`${URL_}/api/ds/query`);
const req = https.request(
  {
    hostname: u.hostname,
    path: u.pathname,
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (r) => {
    let s = "";
    r.on("data", (c) => (s += c));
    r.on("end", () => {
      let j;
      try {
        j = JSON.parse(s);
      } catch (_e) {
        console.log("RAW:", s.slice(0, 400));
        return;
      }
      const f = j.results?.A?.frames?.[0];
      if (!f) {
        console.log("NO FRAME:", JSON.stringify(j).slice(0, 400));
        return;
      }
      const names = f.schema.fields.map((x) => x.name);
      const isTime = f.schema.fields.map((x) => x.type === "time");
      const n = f.data.values[0]?.length || 0;
      console.log(names.join(" | "));
      for (let i = 0; i < Math.min(n, maxRows); i++) {
        console.log(
          names
            .map((_, j2) => {
              const v = f.data.values[j2][i];
              return isTime[j2] && typeof v === "number"
                ? new Date(v).toISOString().slice(0, 10)
                : String(v);
            })
            .join(" | "),
        );
      }
      console.log(`--- ${n} rows ---`);
    });
  },
);
req.on("error", (e) => console.log("ERR", e.message));
req.write(body);
req.end();
