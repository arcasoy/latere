import type { RenderItem } from "../control";

function fmtSize(n?: number | null): string {
  if (n == null) return "";
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function fmtDate(s?: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Renders({
  renders,
  onDelete,
}: {
  renders: RenderItem[];
  onDelete: (key: string) => void;
}) {
  if (renders.length === 0) {
    return (
      <div className="empty pad">
        No renders yet — run the loop. Finished slides are archived here in Supabase.
      </div>
    );
  }
  return (
    <div className="library">
      <p className="view-intro">
        Rendered content, archived in Supabase (`renders/`). Hover to preview; delete any you don't
        want to keep.
      </p>
      <div className="shot-grid">
        {renders.map((r) => (
          <div key={r.key} className="shot-card">
            <button
              type="button"
              className="shot-del"
              title="delete render"
              onClick={() => {
                if (window.confirm("Delete this render from storage?")) onDelete(r.key);
              }}
            >
              ✕
            </button>
            {r.kind !== "slideshow" && (
              <a
                className="shot-dl"
                href={`/api/renders/download?key=${encodeURIComponent(r.key)}`}
                download
                title="download to post yourself"
              >
                ⤓
              </a>
            )}
            {r.kind === "slideshow" && r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" title="open slides">
                <img className="shot-vid" src={r.url} loading="lazy" alt={r.hookText ?? r.id} />
              </a>
            ) : r.url ? (
              <video
                className="shot-vid"
                src={`${r.url}#t=0.1`}
                muted
                loop
                playsInline
                preload="metadata"
                onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0.1;
                }}
              />
            ) : (
              <div className="shot-vid" />
            )}
            <div className="shot-meta">
              <span className="shot-id">{r.format ?? r.id}</span>
              <span className="shot-dim">
                {r.kind === "slideshow" ? `${r.urls?.length ?? 0} slides` : fmtSize(r.size)}
              </span>
            </div>
            <div className="render-hook">{r.hookText ?? "—"}</div>
            <div className="render-foot">
              {r.status && <span className={`status status-${r.status}`}>{r.status}</span>}
              {r.channel && <span className="chip soft">{r.channel}</span>}
              <span className="render-date">{fmtDate(r.lastModified)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
