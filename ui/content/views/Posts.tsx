import { type ReactNode, useEffect, useRef, useState } from "react";
import type { LinkResult, ReviewResult } from "../control";
import { formatNumber, humanizeDuration } from "../format";
import { type DecoratedPost, publishInstances } from "../ledger";

type ReviewAction = (id: string, reason?: string) => Promise<ReviewResult>;

const PLATFORM_META: Record<string, { label: string; glyph: string; color: string }> = {
  tiktok: { label: "TikTok", glyph: "♪", color: "#25f4ee" },
  instagram: { label: "Instagram", glyph: "◎", color: "#e1306c" },
  youtube: { label: "YouTube", glyph: "▶", color: "#ff4d4d" },
};

function platform(channel?: string) {
  return PLATFORM_META[channel ?? ""] ?? { label: channel ?? "—", glyph: "•", color: "#8a8f98" };
}

export function Posts({
  posts,
  onDelete,
  onLink,
  onApprove,
  onReject,
  onRegen,
}: {
  posts: DecoratedPost[];
  onDelete: (id: string) => void;
  onLink: (id: string) => Promise<LinkResult>;
  onApprove: ReviewAction;
  onReject: ReviewAction;
  onRegen: ReviewAction;
}) {
  const ordered = [
    ...posts.filter((p) => p.status === "review"),
    ...posts.filter((p) => p.status !== "review"),
  ];
  const [selectedId, setSelectedId] = useState<string | null>(ordered[0]?.id ?? null);
  const selected = ordered.find((p) => p.id === selectedId) ?? null;

  if (posts.length === 0) {
    return (
      <div className="empty pad">
        No variants yet — run <code>mise run loop</code>.
      </div>
    );
  }
  const postsList = ordered;

  return (
    <div className="grid">
      <div className="table-wrap">
        <table className="posts">
          <thead>
            <tr>
              <th>Status</th>
              <th>Platform</th>
              <th>Format</th>
              <th>Opener</th>
              <th>Hook</th>
              <th className="num">Views</th>
            </tr>
          </thead>
          <tbody>
            {postsList.map((p) => {
              const insts = publishInstances(p);
              return (
                <tr
                  key={p.id}
                  className={[
                    selectedId === p.id ? "sel" : "",
                    p.status === "scheduled" ? "scheduled" : "",
                  ]
                    .join(" ")
                    .trim()}
                  onClick={() => setSelectedId(p.id)}
                >
                  <td>
                    <span className={`status status-${p.status}`}>{p.status}</span>
                  </td>
                  <td>
                    {insts.length === 0 ? (
                      <span className="platform" style={{ color: "#8a8f98" }}>
                        —
                      </span>
                    ) : (
                      <span className="platforms">
                        {insts.map((inst, i) => {
                          const m = platform(inst.channel);
                          return (
                            <span
                              key={i}
                              className="glyph"
                              style={{ color: m.color }}
                              title={m.label}
                            >
                              {m.glyph}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </td>
                  <td>{((p.factors.composition?.format ?? p.factors.format) as string) ?? "—"}</td>
                  <td>{(p.factors.opener as string) ?? "—"}</td>
                  <td className="hook">{(p.factors.hook_text as string) ?? "—"}</td>
                  <td className="num">{formatNumber(p.reward?.views)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <aside className="detail">
        {selected ? (
          <PostDetail
            post={selected}
            onDelete={onDelete}
            onLink={onLink}
            onApprove={onApprove}
            onReject={onReject}
            onRegen={onRegen}
          />
        ) : (
          <div className="empty">Select a post</div>
        )}
      </aside>
    </div>
  );
}

function Lightbox({
  urls,
  start,
  onClose,
}: {
  urls: string[];
  start: number;
  onClose: (at: number) => void;
}) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(i);
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      else if (e.key === "ArrowRight") setI((x) => Math.min(urls.length - 1, x + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, onClose, urls.length]);
  return (
    <div className="lightbox">
      <button type="button" className="scrim" aria-label="Close" onClick={() => onClose(i)} />
      <img src={urls[i]} alt={`Slide ${i + 1} of ${urls.length}`} />
      {i > 0 && (
        <button
          type="button"
          className="lb-arrow left"
          aria-label="Previous slide"
          onClick={() => setI(i - 1)}
        >
          ‹
        </button>
      )}
      {i < urls.length - 1 && (
        <button
          type="button"
          className="lb-arrow right"
          aria-label="Next slide"
          onClick={() => setI(i + 1)}
        >
          ›
        </button>
      )}
      <div className="lb-count">
        {i + 1} / {urls.length}
      </div>
      <button type="button" className="lb-close" aria-label="Close" onClick={() => onClose(i)}>
        ✕
      </button>
    </div>
  );
}

function SlideViewer({ urls }: { urls: string[] }) {
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollToSlide = (i: number, smooth = true) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };
  const go = (d: number) => {
    const next = Math.min(urls.length - 1, Math.max(0, idx + d));
    setIdx(next);
    scrollToSlide(next);
  };
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(i);
  };

  return (
    <>
      <div className="carousel">
        <div className="carousel-track" ref={trackRef} onScroll={onScroll}>
          {urls.map((u, i) => (
            <button
              type="button"
              key={i}
              className="carousel-slide"
              onClick={() => setFull(true)}
              title="click to view fullscreen"
            >
              <img src={u} loading="lazy" alt={`Slide ${i + 1}`} />
            </button>
          ))}
        </div>
        {idx > 0 && (
          <button type="button" className="car-arrow left" onClick={() => go(-1)}>
            ‹
          </button>
        )}
        {idx < urls.length - 1 && (
          <button type="button" className="car-arrow right" onClick={() => go(1)}>
            ›
          </button>
        )}
        <div className="car-count">
          {idx + 1}/{urls.length}
        </div>
      </div>
      {full && (
        <Lightbox
          urls={urls}
          start={idx}
          onClose={(at) => {
            setFull(false);
            setIdx(at);
            scrollToSlide(at, false);
          }}
        />
      )}
    </>
  );
}

function Preview({ post }: { post: DecoratedPost }) {
  const urls = post.render?.urls;
  if (urls && urls.length > 0) return <SlideViewer urls={urls} />;
  if (post.render?.url) {
    return (
      <video
        className="preview-video"
        src={`${post.render.url}#t=0.1`}
        controls
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return null;
}

function ReviewActions({
  post,
  onApprove,
  onReject,
  onRegen,
}: {
  post: DecoratedPost;
  onApprove: ReviewAction;
  onReject: ReviewAction;
  onRegen: ReviewAction;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (label: string, fn: ReviewAction, reason?: string) => {
    setBusy(true);
    setMsg(`${label}…`);
    const r = await fn(post.id, reason);
    setBusy(false);
    setMsg(r.ok ? (r.regen ? `✓ rejected · ${r.regen}` : "✓ done") : `✕ ${r.error ?? "failed"}`);
  };
  const askWhy = (label: string, fn: ReviewAction) => {
    const reason = window.prompt(
      'Why doesn\'t it make sense? (teaches the generator — e.g. "there are no scores for nails")',
      "",
    );
    if (reason === null) return;
    void run(label, fn, reason);
  };
  return (
    <div className="review-block">
      <div className="review-title">
        Waiting for your verdict — nothing is sent until you approve.
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn-approve"
          disabled={busy}
          onClick={() => run("publishing", onApprove)}
        >
          ✓ Approve & publish
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={busy}
          onClick={() => askWhy("rejecting", onReject)}
        >
          ✕ Doesn't make sense
        </button>
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          onClick={() => askWhy("rejecting + regenerating", onRegen)}
        >
          ↻ Regen
        </button>
      </div>
      {msg && <p className="link-msg">{msg}</p>}
    </div>
  );
}

function PostDetail({
  post,
  onDelete,
  onLink,
  onApprove,
  onReject,
  onRegen,
}: {
  post: DecoratedPost;
  onDelete: (id: string) => void;
  onLink: (id: string) => Promise<LinkResult>;
  onApprove: ReviewAction;
  onReject: ReviewAction;
  onRegen: ReviewAction;
}) {
  const f = post.factors;
  const comp = f.composition;
  const instances = publishInstances(post);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  return (
    <div className="detail-inner">
      <div className="detail-head">
        <span className="platforms-head">
          {instances.length === 0 ? (
            <span className="platform" style={{ color: "#8a8f98" }}>
              not published
            </span>
          ) : (
            instances.map((inst, i) => {
              const m = platform(inst.channel);
              return (
                <span key={i} className="platform" style={{ color: m.color }}>
                  <span className="glyph">{m.glyph}</span> {m.label}
                </span>
              );
            })
          )}
        </span>
        <span className={`status status-${post.status}`}>{post.status}</span>
      </div>
      <p className="detail-hook">{(f.hook_text as string) ?? "—"}</p>

      <Preview post={post} />
      {post.status === "review" && (
        <ReviewActions post={post} onApprove={onApprove} onReject={onReject} onRegen={onRegen} />
      )}
      {post.status === "rejected" && post.rejected_reason && (
        <p className="reject-reason">✕ rejected: {post.rejected_reason}</p>
      )}

      <Section title="Composition · the latent point">
        <KV k="Format" v={(comp?.format ?? f.format) as string} />
        <KV k="Opener" v={f.opener as string} />
        <KV k="Transition" v={(comp?.transition ?? f.transition) as string} />
        <KV k="Caption pos" v={(comp?.caption_position ?? f.caption_position) as string} />
        <KV k="Pace" v={f.pace as string} />
        <KV k="Length" v={f.length_s != null ? `${f.length_s}s` : undefined} />
        <KV k="Hook type" v={f.hook_type as string} />
        <KV k="Tags used" v={(f.used_tags as string[] | undefined)?.join(", ")} />
      </Section>

      {comp && comp.segments.length > 0 && (
        <Section title="Segments (ordered)">
          {comp.segments.map((s, i) => (
            <KV key={i} k={`${i + 1}. ${s.role}`} v={s.shot_id ?? "(generated)"} />
          ))}
        </Section>
      )}

      <Section title="Published · instances">
        {instances.length === 0 ? (
          <KV k="—" v="not published yet" />
        ) : (
          instances.map((inst, i) => {
            const m = platform(inst.channel);
            return (
              <div key={i} className="kv">
                <span className="kv-k" style={{ color: m.color }}>
                  {m.glyph} {m.label}
                </span>
                <span className="kv-v">
                  {inst.status ?? post.status}
                  {inst.reward?.views != null ? ` · ${formatNumber(inst.reward.views)} views` : ""}
                </span>
              </div>
            );
          })
        )}
        <KV
          k="Since prev post"
          v={post.gapSincePrevMs == null ? undefined : humanizeDuration(post.gapSincePrevMs)}
        />
      </Section>

      <Section title="Reward · the signal · all platforms">
        <KV k="Views" v={fmt(post.reward?.views)} />
        <KV k="Profile clicks" v={fmt(post.reward?.profile_clicks)} />
        <KV k="Likes" v={fmt(post.reward?.likes)} />
        <KV k="Comments" v={fmt(post.reward?.comments)} />
      </Section>

      <Section title="Latent">
        <KV
          k="Embedding"
          v={post.embedding == null ? "— · surrogate dormant" : `${post.embedding.length}-d`}
        />
        <KV
          k="Render"
          v={post.render?.url ? "uploaded" : post.render?.path ? "local" : undefined}
        />
      </Section>

      <button
        type="button"
        className="btn-link"
        disabled={linking}
        onClick={async () => {
          setLinking(true);
          setLinkMsg("matching Buffer posts by caption…");
          const r = await onLink(post.id);
          setLinking(false);
          setLinkMsg(
            r.ok
              ? `✓ linked: ${(r.linked ?? []).join(", ") || "done"}`
              : `✕ ${r.error ?? "no match"}`,
          );
        }}
      >
        🔗 Link Buffer posts (if you posted manually)
      </button>
      {linkMsg && <p className="link-msg">{linkMsg}</p>}

      {post.render?.url && (
        <a
          className="btn-dl"
          href={`/api/renders/download?key=${encodeURIComponent(`renders/${post.id}.mp4`)}`}
          download
        >
          ⤓ Download render
        </a>
      )}
      <button
        type="button"
        className="btn-danger"
        onClick={() => {
          if (window.confirm("Delete this post and its render?")) onDelete(post.id);
        }}
      >
        Delete post + render
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <h3>{title}</h3>
      <div className="kvs">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: string }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className="kv-v">{v?.length ? v : "—"}</span>
    </div>
  );
}

function fmt(n?: number): string | undefined {
  return n == null ? undefined : formatNumber(n);
}
