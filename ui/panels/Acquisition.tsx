import { useCallback, useEffect, useState } from "react";
import type {
  AcquisitionPanel,
  AcquisitionPost,
  AttributionState,
  Referrer,
} from "../../server/acquisition";
import type { Connector } from "../../server/connectors";
import { Connectors } from "../Connectors";

function failuresByConnector(errors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    out[error.startsWith("PostHog") ? "PostHog" : "App Store Connect"] = error;
  }
  return out;
}

type Loaded =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; panel: AcquisitionPanel };

const int = (n: number) => n.toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const UNKNOWN: Record<Exclude<AttributionState, "ready">, string> = {
  uncampaigned:
    "Apple's report carries no campaign values at all, so there is nothing for this link's ct token to join to. What Apple does attribute is in the referrer table below.",
  pending: "Apple has accepted the report request but has not generated it yet",
  unrequested: "No analytics report has been requested from Apple",
  unreadable: "Apple's report could not be parsed",
  error: "Apple's analytics API failed",
};

function installCell(post: AcquisitionPost, state: AttributionState) {
  if (state !== "ready") return { text: "—", title: UNKNOWN[state] };
  if (post.installs === null || post.installs === undefined) {
    return {
      text: "under 5",
      title:
        "Withheld by Apple's privacy floor — fewer than 5 downloads from distinct Apple IDs. Not zero.",
    };
  }
  return { text: int(post.installs), title: "" };
}

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
  if (data.attribution.state === "ready") return null;

  const messages: Record<AttributionState, string> = {
    ready: "",
    uncampaigned:
      "Apple's report is readable and carries no campaign values at all — every Campaign cell is empty, so no ct token can be joined to a download. Per-post installs are unknown, not zero and not withheld. What Apple does attribute is below.",
    pending:
      "Apple has accepted the report request but has not generated it yet (24–48h). The click counts below are live; the install column fills in when it lands.",
    unrequested:
      "No analytics report has been requested from Apple — run `node ops/asc/asc.js snapshot` then `subscribe`.",
    unreadable: data.attribution.note ?? "Apple's report could not be parsed.",
    error: data.attribution.note ?? "Apple's analytics API failed.",
  };
  return messages[data.attribution.state];
}

function PostsTable({ data }: { data: Extract<AcquisitionPanel, { configured: true }> }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Post</th>
          <th>Source</th>
          <th className="num">Clicks (iOS)</th>
          <th className="num">People</th>
          <th className="num">Installs</th>
          <th className="num">Conv.</th>
        </tr>
      </thead>
      <tbody>
        {data.posts.map((post) => {
          const dropped = post.clicksAll - post.clicks;
          const cell = installCell(post, data.attribution.state);
          return (
            <tr key={post.ct}>
              <td className="mono">{post.post ?? post.ct}</td>
              <td>{post.src ?? "—"}</td>
              <td
                className={dropped > 0 ? "num hinted" : "num"}
                title={
                  dropped > 0
                    ? `${int(post.clicksAll)} total; ${int(dropped)} non-iOS dropped as crawler traffic`
                    : undefined
                }
              >
                {int(post.clicks)}
              </td>
              <td className="num">{int(post.people)}</td>
              <td className={cell.title ? "num hinted" : "num"} title={cell.title || undefined}>
                {cell.text}
              </td>
              <td className="num">{post.conversion === null ? "—" : pct(post.conversion)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
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
  const clicks = panel.posts.reduce((sum, post) => sum + post.clicks, 0);

  return (
    <>
      <div className="totals">
        <Total
          value={int(panel.installs.firstTimeTotal)}
          label={`first-time downloads · ${panel.windowDays}d`}
        />
        <Total value={int(clicks)} label={`tracked clicks (iOS) · ${panel.windowDays}d`} />
      </div>

      {notice && (
        <p className={panel.attribution.feedStopped ? "notice warn" : "notice"}>{notice}</p>
      )}

      {/* With a source down, an empty table is not evidence of an empty window. */}
      {panel.posts.length > 0 && <PostsTable data={panel} />}
      {panel.posts.length === 0 && panel.errors.length === 0 && (
        <p className="pending">No campaign-tagged clicks in the window.</p>
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
