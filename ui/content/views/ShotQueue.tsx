import type { CaptureRequest, Format } from "../types";

function prioLabel(p: number): string {
  return p >= 3 ? "high" : p === 2 ? "medium" : "low";
}

export function ShotQueue({
  requests,
  formats,
}: {
  requests: CaptureRequest[];
  formats: Format[];
}) {
  const open = requests
    .filter((r) => r.status === "open")
    .sort((a, b) => b.priority - a.priority || b.quantity - a.quantity);

  const fmtLabel = (id?: string) => formats.find((f) => f.id === id)?.label ?? id ?? "";

  if (open.length === 0) {
    return (
      <div className="empty pad">
        No open shot requests — run the loop and the optimizer will tell you what to film.
      </div>
    );
  }

  return (
    <div className="queue">
      <p className="view-intro">
        What the optimizer wants to film next. Shoot one, ingest it with these tags, and the format
        unlocks.
      </p>
      {open.map((r) => {
        const role = r.role ?? r.shot_type ?? "footage";
        const wants = r.want_tags ?? [];
        return (
          <div key={r.id} className={`req prio-${r.priority}`}>
            <div className="req-head">
              <span className="req-shot">
                {role}
                {r.app_screen && <span className="req-screen"> · {r.app_screen}</span>}
              </span>
              <span className="req-qty">×{r.quantity}</span>
            </div>
            <div className="req-rationale">{r.rationale}</div>
            <div className="req-foot">
              <span className={`prio prio-${r.priority}`}>{prioLabel(r.priority)} priority</span>
              {wants.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
              {r.format_context && (
                <span className="chip soft">for {fmtLabel(r.format_context)}</span>
              )}
            </div>
            {wants.length > 0 && (
              <div className="req-how">
                <code>latere ingest clip.mp4 --tags {wants.join(",")}</code>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
