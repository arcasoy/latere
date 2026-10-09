const crypto = require("node:crypto"),
  fs = require("node:fs"),
  https = require("node:https"),
  path = require("node:path"),
  zlib = require("node:zlib");

const envPath = path.join(__dirname, ".env.asc");
if (!fs.existsSync(envPath)) {
  console.error(`missing ${envPath} -- see ops/asc/README.md for the four values it needs`);
  process.exit(1);
}
const env = fs.readFileSync(envPath, "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const [KEY_ID, ISSUER_ID, VENDOR, APP_ID] = [
  get("ASC_KEY_ID"),
  get("ASC_ISSUER_ID"),
  get("ASC_VENDOR_NUMBER"),
  get("ASC_APP_ID"),
];
const keyPath = get("ASC_PRIVATE_KEY_PATH");
const PRIVATE_KEY = fs.readFileSync(
  path.isAbsolute(keyPath) ? keyPath : path.join(__dirname, keyPath),
  "utf8",
);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const body = b64({ iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" });
  const sig = crypto
    .sign("sha256", Buffer.from(`${head}.${body}`), {
      key: PRIVATE_KEY,
      dsaEncoding: "ieee-p1363",
    })
    .toString("base64url");
  return `${head}.${body}.${sig}`;
}

function call(urlStr, { method = "GET", accept = "application/json", body } = {}) {
  const u = new URL(urlStr);
  // Report segments live on S3 behind a pre-signed URL. S3 rejects any request
  // carrying two auth mechanisms, so the bearer goes only to Apple's own API.
  const headers = { Accept: accept };
  if (u.hostname.endsWith("apple.com")) headers.Authorization = `Bearer ${token()}`;
  if (body) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(body);
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          let buf = Buffer.concat(chunks);
          if (
            r.headers["content-encoding"] === "agzip" ||
            buf.slice(0, 2).equals(Buffer.from([0x1f, 0x8b]))
          )
            buf = zlib.gunzipSync(buf);
          resolve({ status: r.statusCode, headers: r.headers, text: buf.toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const API = "https://api.appstoreconnect.apple.com/v1";

async function json(url, opts) {
  const r = await call(url, opts);
  if (r.status >= 400) {
    console.error(`HTTP ${r.status}: ${r.text.slice(0, 500)}`);
    process.exit(1);
  }
  return JSON.parse(r.text);
}

const rows = (tsv) => {
  const lines = tsv.trim().split("\n");
  const cols = lines[0].split("\t");
  return lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cols[i], v])));
};

async function sales(startDate, days) {
  console.log("date       | units | product type");
  for (let i = 0; i < days; i++) {
    const d = new Date(`${startDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const q = new URLSearchParams({
      "filter[frequency]": "DAILY",
      "filter[reportType]": "SALES",
      "filter[reportSubType]": "SUMMARY",
      "filter[vendorNumber]": VENDOR,
      "filter[reportDate]": date,
    });
    const r = await call(`${API}/salesReports?${q}`, { accept: "application/a-gzip" });
    if (r.status === 404) {
      console.log(`${date} |     - | no report yet`);
      continue;
    }
    if (r.status >= 400) {
      console.log(`${date} |   err | ${r.text.slice(0, 120)}`);
      continue;
    }
    const mine = rows(r.text).filter((x) => !APP_ID || x["Apple Identifier"] === APP_ID);
    const byType = {};
    for (const x of mine)
      byType[x["Product Type Identifier"]] =
        (byType[x["Product Type Identifier"]] || 0) + Number(x.Units || 0);
    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    console.log(
      `${date} | ${String(total).padStart(5)} | ${
        Object.entries(byType)
          .map(([k, v]) => `${k}:${v}`)
          .join(" ") || "-"
      }`,
    );
  }
}

async function request(accessType) {
  const body = JSON.stringify({
    data: {
      type: "analyticsReportRequests",
      attributes: { accessType },
      relationships: { app: { data: { type: "apps", id: APP_ID } } },
    },
  });
  const j = await json(`${API}/analyticsReportRequests`, { method: "POST", body });
  console.log(`requested ${accessType}:`, j.data.id, "-- run `reports` in a few hours");
}

async function reports() {
  const reqs = await json(`${API}/apps/${APP_ID}/analyticsReportRequests`);
  for (const r of reqs.data) {
    console.log(
      `request ${r.id}  ${r.attributes.accessType}  stopped=${r.attributes.stoppedDueToInactivity}`,
    );
    const rs = await json(`${API}/analyticsReportRequests/${r.id}/reports?limit=200`);
    for (const rep of rs.data)
      console.log(`   ${rep.attributes.category.padEnd(28)} ${rep.attributes.name}`);
  }
}

async function fetchReport(prefix) {
  const reqs = await json(`${API}/apps/${APP_ID}/analyticsReportRequests`);
  for (const r of reqs.data) {
    const rs = await json(`${API}/analyticsReportRequests/${r.id}/reports?limit=200`);
    const rep = rs.data.find((x) =>
      x.attributes.name.toLowerCase().startsWith(prefix.toLowerCase()),
    );
    if (!rep) continue;
    const insts = await json(
      `${API}/analyticsReports/${rep.id}/instances?filter[granularity]=DAILY&limit=200`,
    );
    if (!insts.data.length) {
      console.error(
        `"${rep.attributes.name}" has no instances yet -- Apple is still generating it (a snapshot can take 24-48h)`,
      );
      process.exit(2);
    }
    for (const inst of insts.data) {
      const segs = await json(`${API}/analyticsReportInstances/${inst.id}/segments`);
      for (const seg of segs.data) {
        const r2 = await call(seg.attributes.url);
        console.log(`--- ${rep.attributes.name} @ ${inst.attributes.processingDate} ---`);
        console.log(r2.text.trim().split("\n").slice(0, 60).join("\n"));
      }
    }
    return;
  }
  console.error(`no report matching "${prefix}" -- run \`reports\` to list them`);
  process.exit(1);
}

async function downloads(sinceDate) {
  const reqs = await json(`${API}/apps/${APP_ID}/analyticsReportRequests`);
  const byDate = {};
  for (const r of reqs.data) {
    const rs = await json(`${API}/analyticsReportRequests/${r.id}/reports?limit=200`);
    const rep = rs.data.find((x) => x.attributes.name === "App Downloads Standard");
    if (!rep) continue;
    let url = `${API}/analyticsReports/${rep.id}/instances?filter[granularity]=DAILY&limit=200`;
    while (url) {
      const insts = await json(url);
      for (const inst of insts.data) {
        const instanceDate = inst.attributes.processingDate;
        if (sinceDate && instanceDate < sinceDate) continue;
        const segs = await json(`${API}/analyticsReportInstances/${inst.id}/segments`);
        for (const seg of segs.data) {
          const r2 = await call(seg.attributes.url);
          for (const row of rows(r2.text)) {
            const date = row.Date;
            byDate[date] ??= {};
            byDate[date][instanceDate] ??= {};
            byDate[date][instanceDate][row["Download Type"]] =
              (byDate[date][instanceDate][row["Download Type"]] || 0) + Number(row.Counts || 0);
          }
        }
      }
      url = insts.links?.next;
    }
  }

  const types = ["First-time download", "Auto-update", "Redownload", "Restore", "Manual update"];
  console.log(`date       | ${types.map((t) => t.padEnd(20)).join("| ")}`);
  for (const date of Object.keys(byDate).sort()) {
    const instances = byDate[date];
    const latest = Object.keys(instances).sort().at(-1);
    const counts = instances[latest];
    console.log(`${date} | ${types.map((t) => String(counts[t] || 0).padEnd(20)).join("| ")}`);
  }
}

const [cmd, a1, a2] = process.argv.slice(2);
const run = {
  sales: () => sales(a1, Number(a2 || 1)),
  snapshot: () => request("ONE_TIME_SNAPSHOT"),
  subscribe: () => request("ONGOING"),
  reports,
  fetch: () => fetchReport(a1),
  downloads: () => downloads(a1),
}[cmd];
if (!run) {
  console.error(
    "usage: asc.js sales <YYYY-MM-DD> [days] | snapshot | subscribe | reports | fetch <name> | downloads [since YYYY-MM-DD]",
  );
  process.exit(1);
}
run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
