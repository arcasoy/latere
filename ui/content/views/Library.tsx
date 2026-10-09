import { useRef, useState } from "react";
import type { AppScreen, Format, Shot, Tag } from "../types";
import { UploadModal } from "./UploadModal";

function canFill(format: Format, shots: Shot[]): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const slot of format.segments) {
    if (slot.required === false) continue;
    const tags = slot.match_tags_any ?? [];
    const has = shots.some((s) => tags.length === 0 || s.tags.some((t) => tags.includes(t)));
    if (!has) missing.push(slot.role);
  }
  return { ok: missing.length === 0, missing };
}

export function Library({
  shots,
  tags,
  formats,
  appScreens,
  onRetag,
  onDelete,
  onUploaded,
}: {
  shots: Shot[];
  tags: Tag[];
  formats: Format[];
  appScreens: AppScreen[];
  onRetag: (id: string, tags: string[]) => void;
  onDelete: (id: string) => void;
  onUploaded: () => void;
}) {
  const live = formats.filter((f) => !f.deferred);
  const [pending, setPending] = useState<File[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const takeFiles = (fl: FileList | null) => {
    if (!fl) return;
    const media = [...fl].filter((f) => f.type.startsWith("video/") || f.type.startsWith("image/"));
    if (media.length) setPending(media);
  };
  return (
    <div className="library">
      <button
        type="button"
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          takeFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        ＋ Drag clips or images here, or click to browse — then tag them
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            takeFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>
      <p className="view-intro">
        Your shot library — tags are the only organization. One shot fills many roles; the optimizer
        pulls shots into formats by tag.
      </p>

      <div className="coverage">
        {live.map((f) => {
          const { ok, missing } = canFill(f, shots);
          return (
            <div key={f.id} className={`cov ${ok ? "ready" : "blocked"}`}>
              <span className="cov-name">{f.label}</span>
              <span className="cov-state">{ok ? "ready" : `needs ${missing.join(", ")}`}</span>
            </div>
          );
        })}
      </div>

      {shots.length === 0 ? (
        <div className="empty pad">
          No shots yet — <code>latere ingest &lt;file&gt; --tags hands,nails,loopable</code>
        </div>
      ) : (
        <div className="shot-grid">
          {shots.map((s) => (
            <ShotCard key={s.id} shot={s} vocab={tags} onRetag={onRetag} onDelete={onDelete} />
          ))}
        </div>
      )}

      {pending && (
        <UploadModal
          files={pending}
          tags={tags}
          appScreens={appScreens}
          onClose={() => setPending(null)}
          onUploaded={() => {
            setPending(null);
            onUploaded();
          }}
        />
      )}
    </div>
  );
}

function isImage(shot: Shot): boolean {
  return shot.kind === "image" || /\.(png|jpe?g|webp|gif)$/i.test(shot.key);
}

function ShotCard({
  shot,
  vocab,
  onRetag,
  onDelete,
}: {
  shot: Shot;
  vocab: Tag[];
  onRetag: (id: string, tags: string[]) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const available = vocab.filter((t) => !shot.tags.includes(t.id));
  return (
    <div className="shot-card">
      <button
        type="button"
        className="shot-del"
        title="delete shot"
        onClick={() => {
          if (window.confirm("Delete this shot? Removes it from the media library."))
            onDelete(shot.id);
        }}
      >
        ✕
      </button>
      {isImage(shot) ? (
        <img
          className="shot-vid"
          src={shot.url}
          loading="lazy"
          alt={shot.tags.join(", ") || shot.id}
        />
      ) : (
        <video
          className="shot-vid"
          src={`${shot.url}#t=0.1`}
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
      )}
      <div className="shot-meta">
        <span className="shot-id">{shot.id.replace("sh_", "")}</span>
        <span className="shot-dim">
          {isImage(shot)
            ? "image"
            : `${shot.duration_s ? `${shot.duration_s}s` : ""} ${shot.orientation ?? ""}`}
        </span>
      </div>
      <div className="shot-tags">
        {shot.tags.map((t) => (
          <span key={t} className="chip tagchip">
            {t}
            <button
              type="button"
              className="x"
              onClick={() =>
                onRetag(
                  shot.id,
                  shot.tags.filter((x) => x !== t),
                )
              }
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <select
            className="tag-add"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onRetag(shot.id, [...shot.tags, e.target.value]);
              setAdding(false);
            }}
            onBlur={() => setAdding(false)}
          >
            <option value="">+ tag…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        ) : (
          <button type="button" className="chip add" onClick={() => setAdding(true)}>
            + tag
          </button>
        )}
      </div>
    </div>
  );
}
