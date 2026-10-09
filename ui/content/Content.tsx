import { useEffect, useMemo, useState } from "react";
import type { Connector } from "../../server/connectors";
import { Connectors } from "../Connectors";
import {
  approvePost,
  type ControlState,
  deletePost,
  deleteRender,
  deleteShot,
  generateOne,
  getRenders,
  getShots,
  getState,
  linkPost,
  type RenderItem,
  regenPost,
  rejectPost,
  setShotTags,
  toggleAutonomous,
} from "./control";
import { type LatereData, loadData } from "./data";
import { humanizeDuration } from "./format";
import { avgCadenceMs, decoratePosts, timeSinceLastPostMs } from "./ledger";
import type { Shot } from "./types";
import { Library } from "./views/Library";
import { Posts } from "./views/Posts";
import { Renders } from "./views/Renders";
import { ShotQueue } from "./views/ShotQueue";
import { Terminal } from "./views/Terminal";

type View = "posts" | "queue" | "library" | "renders";

function initialView(): View {
  const sub = location.hash.replace("#", "").split("/")[1] ?? "";
  return sub === "queue" || sub === "library" || sub === "renders" ? sub : "posts";
}

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Content({ connectors }: { connectors: Connector[] }) {
  const [data, setData] = useState<LatereData | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [renders, setRenders] = useState<RenderItem[]>([]);
  const [control, setControl] = useState<ControlState | null>(null);
  const [controlReady, setControlReady] = useState(false);
  const [view, setView] = useState<View>(initialView);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const s = await getState();
      if (!alive) return;
      setControl(s);
      setControlReady(true);
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    location.hash = `content/${view}`;
  }, [view]);

  const _lastRun = control?.lastRunAt ?? null;
  useEffect(() => {
    loadData().then(setData);
    getShots().then(setShots);
    getRenders().then(setRenders);
  }, []);

  const onRetag = async (id: string, tags: string[]) => {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, tags } : s)));
    await setShotTags(id, tags);
    getShots().then(setShots);
  };

  const onDelete = async (id: string) => {
    setShots((prev) => prev.filter((s) => s.id !== id));
    await deleteShot(id);
    getShots().then(setShots);
  };

  const onDeleteRender = async (key: string) => {
    setRenders((prev) => prev.filter((r) => r.key !== key));
    await deleteRender(key);
    getRenders().then(setRenders);
    loadData().then(setData);
  };

  const onDeletePost = async (id: string) => {
    await deletePost(id);
    loadData().then(setData);
    getRenders().then(setRenders);
  };

  const onLinkPost = async (id: string) => {
    const r = await linkPost(id);
    if (r.ok) loadData().then(setData);
    return r;
  };

  const refreshAfterReview = () => {
    loadData().then(setData);
    getRenders().then(setRenders);
  };
  const onApprove = async (id: string) => {
    const r = await approvePost(id);
    refreshAfterReview();
    return r;
  };
  const onReject = async (id: string, reason?: string) => {
    const r = await rejectPost(id, reason);
    refreshAfterReview();
    return r;
  };
  const onRegen = async (id: string, reason?: string) => {
    const r = await regenPost(id, reason);
    refreshAfterReview();
    return r;
  };

  const busy = control?.phase === "running";
  const [refused, setRefused] = useState<string | null>(null);
  const onGenerate = async () => {
    setRefused(null);
    const r = await generateOne();
    if (!r.ok) setRefused(r.error ?? "failed to start");
  };

  const posts = useMemo(() => (data ? decoratePosts(data.ledger) : []), [data]);

  if (!data) {
    return <div className="empty pad">Loading…</div>;
  }

  const openReqs = data.requests.filter((r) => r.status === "open").length;
  const sinceLast = timeSinceLastPostMs(posts, now);
  const cadence = avgCadenceMs(posts);
  const lastPublished = posts.find((p) => p.publish?.published_at);

  const onToggle = async () => {
    if (!control) return;
    const next = !control.autonomous;
    setControl({ ...control, autonomous: next, phase: next ? "running" : "off" });
    const s = await toggleAutonomous(next);
    if (s) setControl(s);
  };

  const genMsg =
    refused ?? (busy ? "deciding + rendering — watch the terminal" : control?.lastSummary || null);

  return (
    <>
      <div className="content-head">
        <Connectors items={connectors} />
        <div className="top-right">
          {controlReady && control && (
            <AutonomousSwitch control={control} now={now} onToggle={onToggle} />
          )}
          {controlReady && !control && <span className="ctl-offline">control offline</span>}
        </div>
      </div>

      {data.error && <p className="notice warn">content server unreadable — {data.error}</p>}

      {controlReady && control && (
        <Terminal lines={control.log ?? []} active={control.phase === "running"} />
      )}

      <nav className="tabs">
        <button
          type="button"
          className={view === "posts" ? "on" : ""}
          onClick={() => setView("posts")}
        >
          Posts <span className="tab-n">{posts.length}</span>
        </button>
        <button
          type="button"
          className={view === "queue" ? "on" : ""}
          onClick={() => setView("queue")}
        >
          Shot Queue <span className="tab-n">{openReqs}</span>
        </button>
        <button
          type="button"
          className={view === "library" ? "on" : ""}
          onClick={() => setView("library")}
        >
          Library <span className="tab-n">{shots.length}</span>
        </button>
        <button
          type="button"
          className={view === "renders" ? "on" : ""}
          onClick={() => setView("renders")}
        >
          Renders <span className="tab-n">{renders.length}</span>
        </button>
      </nav>

      {control?.needsInput && (
        <button
          type="button"
          className="needs-banner"
          onClick={() => setView((control.pendingReview ?? 0) > 0 ? "posts" : "queue")}
        >
          <span className="needs-dot" /> {control.prompt}
          <span className="needs-cta">
            {(control.pendingReview ?? 0) > 0 ? "review posts →" : "open Shot Queue →"}
          </span>
        </button>
      )}

      {view === "posts" && (
        <>
          <section className="cadence">
            <Stat
              label="Time since last post"
              value={sinceLast == null ? "—" : humanizeDuration(sinceLast)}
              hint={
                lastPublished
                  ? `last on ${lastPublished.publish?.channel ?? "—"}`
                  : "drafts only so far"
              }
            />
            <Stat
              label="Avg cadence"
              value={cadence == null ? "—" : humanizeDuration(cadence)}
              hint="between posts"
            />
            <Stat label="Open shot requests" value={String(openReqs)} hint="what to film next" />
            <div className="gen-card">
              <button
                type="button"
                className="btn-generate"
                disabled={busy}
                onClick={() => void onGenerate()}
              >
                {busy ? "✦ generating…" : "✦ Generate new"}
              </button>
              {genMsg && <div className="gen-msg">{genMsg}</div>}
            </div>
          </section>
          <Posts
            posts={posts}
            onDelete={onDeletePost}
            onLink={onLinkPost}
            onApprove={onApprove}
            onReject={onReject}
            onRegen={onRegen}
          />
        </>
      )}

      {view === "queue" && <ShotQueue requests={data.requests} formats={data.formats} />}
      {view === "library" && (
        <Library
          shots={shots}
          tags={data.tags}
          formats={data.formats}
          appScreens={data.appScreens}
          onRetag={onRetag}
          onDelete={onDelete}
          onUploaded={() => getShots().then(setShots)}
        />
      )}
      {view === "renders" && <Renders renders={renders} onDelete={onDeleteRender} />}
    </>
  );
}

function AutonomousSwitch({
  control,
  now,
  onToggle,
}: {
  control: ControlState;
  now: number;
  onToggle: () => void;
}) {
  const on = control.autonomous;
  const remaining = control.nextRunAt ? Math.max(0, control.nextRunAt - now) : 0;

  let status: string;
  if (!on) status = "paused";
  else if (control.phase === "running") status = "churning…";
  else if (control.needsInput) status = "needs you";
  else if (control.nextRunAt) status = `next post in ${mmss(remaining)}`;
  else status = "starting…";

  return (
    <div className={`auto${on ? " on" : ""}${on && control.needsInput ? " needs" : ""}`}>
      <div className="auto-meta">
        <span className="auto-label">Autonomous</span>
        <span className="auto-status">{status}</span>
      </div>
      <button
        type="button"
        className={`switch${on ? " on" : ""}`}
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        title={on ? "turn off" : "turn on — it'll churn"}
      >
        <span className="knob" />
      </button>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
