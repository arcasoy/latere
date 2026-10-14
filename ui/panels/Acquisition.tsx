import { useCallback, useEffect, useState } from "react";
import type { AcquisitionPanel, AttributionState, Referrer } from "../../server/acquisition";
import type { Connector } from "../../server/connectors";
import { Connectors } from "../Connectors";

function failuresByConnector(errors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    out["App Store Connect"] = error;
  }
  return out;
}

type Loaded =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; panel: AcquisitionPanel };

const int = (n: number) => n.toLocaleString("en-US");
const APPS: Record<string, string> = {
  "com.zhiliaoapp.musically": "TikTok",
  "com.burbn.instagram": "Instagram",
  "com.google.ios.youtube": "YouTube",
  "com.toyopagroup.picaboo": "Snapchat",
  "com.atebits.Tweetie2": "X",
  "com.facebook.Facebook": "Facebook",
  "com.reddit.Reddit": "Reddit",
  "com.hammerandchisel.discord": "Discord",
  "net.whatsapp.WhatsApp": "WhatsApp",
  "com.apple.MobileSMS": "Messages",
  "com.apple.mobilesafari": "Safari",
  "com.apple.mobilemail": "Mail",
};

function referrerName(referrer: Referrer): string {
  if (!referrer.info) return referrer.type;
  return APPS[referrer.info] ?? referrer.info;
}

function Referrers({ data }: { data: Extract<AcquisitionPanel, { configured: true }> }) {
  const { referrers, attributedFirstTime } = data.sources;
  if (!referrers.length) return null;

  const total = data.installs.firstTimeTotal;
  const withheld = total - attributedFirstTime;

  return (
    <>
      <h3 className="subhead">Where downloads came from</h3>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Kind</th>
            <th className="num">First-time downloads</th>
          </tr>
        </thead>
        <tbody>
          {referrers.map((referrer) => (
            <tr key={`${referrer.type}/${referrer.info ?? ""}`}>
              <td
                className={referrer.info ? "hinted" : undefined}
                title={referrer.info ?? undefined}
              >
                {referrerName(referrer)}
              </td>
              <td className="mono">{referrer.type}</td>
              <td className="num">{int(referrer.downloads)}</td>
            </tr>
          ))}
          {withheld > 0 && (
            <tr>
              <td
                className="hinted"
                title="Apple withholds any row under 5 first-time downloads from distinct Apple IDs, so these downloads are real but unattributable."
              >
                below Apple's reporting floor
              </td>
              <td className="mono">—</td>
              <td className="num">{int(withheld)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function noticeText(data: Extract<AcquisitionPanel, { configured: true }>): string | null {
  if (data.attribution.feedStopped) {
    return "Apple stopped the analytics feed for inactivity — re-run `node ops/asc/asc.js subscribe`.";
  }
  if (data.attribution.state === "ready" || data.attribution.state === "uncampaigned") return null;

  const messages: Record<AttributionState, string> = {
    ready: "",
    uncampaigned: "",
    pending:
      "Apple has accepted the report request but has not generated it yet. Download sources will appear when the report is available.",
    unrequested:
      "No analytics report has been requested from Apple — run `node ops/asc/asc.js snapshot` then `subscribe`.",
    unreadable: data.attribution.note ?? "Apple's report could not be parsed.",
    error: data.attribution.note ?? "Apple's analytics API failed.",
  };
  return messages[data.attribution.state];
}

function Total({ value, label }: { value: string; label: string }) {
  return (
    <div className="total">
      <span className="big">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

function Body({ panel, onRefresh }: { panel: AcquisitionPanel; onRefresh: () => void }) {
  if (!panel.configured) {
    return <p className="pending">Not configured — missing secrets: {panel.missing.join(", ")}</p>;
  }

  const notice = noticeText(panel);

  return (
    <>
      <div className="totals">
        <Total
          value={int(panel.installs.firstTimeTotal)}
          label={`first-time downloads · ${panel.windowDays}d`}
        />
      </div>

      {notice && (
        <p className={panel.attribution.feedStopped ? "notice warn" : "notice"}>{notice}</p>
      )}

      <Referrers data={panel} />

      {panel.installs.error && <p className="notice warn">{panel.installs.error}</p>}
      {panel.errors.map((error) => (
        <p key={error} className="notice warn">
          {error}
        </p>
      ))}

      <p className="stamp">
        {`read ${new Date(panel.generatedAt).toLocaleString()} · `}
        <button type="button" className="refresh" onClick={onRefresh}>
          refresh
        </button>
      </p>
    </>
  );
}

export function Acquisition({ note, connectors }: { note: string; connectors: Connector[] }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  const load = useCallback((force: boolean) => {
    setLoaded({ state: "loading" });
    fetch(`/api/acquisition${force ? "?refresh=1" : ""}`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<AcquisitionPanel>)
          : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((panel) => setLoaded({ state: "ready", panel }))
      .catch((error: Error) => setLoaded({ state: "failed", error: error.message }));
  }, []);

  useEffect(() => load(false), [load]);

  const errors = loaded.state === "ready" && loaded.panel.configured ? loaded.panel.errors : [];

  return (
    <section className="panel">
      <Connectors items={connectors} failures={failuresByConnector(errors)} />
      <p className="note">{note}</p>

      {loaded.state === "loading" && <p className="pending">loading…</p>}
      {loaded.state === "failed" && <p className="notice warn">failed: {loaded.error}</p>}
      {loaded.state === "ready" && <Body panel={loaded.panel} onRefresh={() => load(true)} />}
    </section>
  );
}
