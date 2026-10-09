import { useEffect, useMemo, useState } from "react";
import { uploadShot } from "../control";
import type { AppScreen, Tag } from "../types";

interface PerFile {
  tags: string[];
  appScreen: string;
}

export function UploadModal({
  files,
  tags,
  appScreens,
  onClose,
  onUploaded,
}: {
  files: File[];
  tags: Tag[];
  appScreens: AppScreen[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [sel, setSel] = useState(0);
  const [perFile, setPerFile] = useState<PerFile[]>(() =>
    files.map(() => ({ tags: [], appScreen: "" })),
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [urls]);

  const groups = useMemo(() => {
    const m = new Map<string, Tag[]>();
    for (const t of tags) {
      const g = m.get(t.group) ?? [];
      g.push(t);
      m.set(t.group, g);
    }
    return [...m.entries()];
  }, [tags]);

  const cur = perFile[sel] ?? { tags: [], appScreen: "" };

  const toggle = (id: string) =>
    setPerFile((p) =>
      p.map((x, i) =>
        i === sel
          ? { ...x, tags: x.tags.includes(id) ? x.tags.filter((t) => t !== id) : [...x.tags, id] }
          : x,
      ),
    );
  const setScreen = (v: string) =>
    setPerFile((p) => p.map((x, i) => (i === sel ? { ...x, appScreen: v } : x)));

  const taggedCount = perFile.filter((p) => p.tags.length > 0).length;

  const save = async () => {
    setBusy(true);
    for (let i = 0; i < files.length; i++) {
      const pf = perFile[i]!;
      if (pf.tags.length === 0) continue;
      await uploadShot(files[i]!, pf.tags, pf.appScreen || undefined);
      setDone((d) => d + 1);
    }
    setBusy(false);
    onUploaded();
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} />
      <div className="modal">
        <div className="modal-head">
          <span>
            Add footage — {taggedCount}/{files.length} tagged
          </span>
          <button type="button" className="x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-list">
            {files.map((f, i) => (
              <button
                type="button"
                key={i}
                className={`mclip${i === sel ? " sel" : ""}`}
                onClick={() => setSel(i)}
              >
                {f.type.startsWith("image/") ? (
                  <img className="mclip-vid" src={urls[i]} alt={f.name} />
                ) : (
                  <video
                    className="mclip-vid"
                    src={`${urls[i]}#t=0.1`}
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
                <div className="mclip-meta">
                  <span className="mclip-name">{f.name}</span>
                  <span className={`mclip-tags${perFile[i]?.tags.length ? " has" : ""}`}>
                    {perFile[i]?.tags.length} tag{perFile[i]?.tags.length === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="modal-tags">
            <div className="mt-preview">
              {files[sel]?.type.startsWith("image/") ? (
                <img key={urls[sel]} src={urls[sel]} alt={files[sel]?.name ?? "selected clip"} />
              ) : (
                <video key={urls[sel]} src={urls[sel]} controls autoPlay muted loop playsInline />
              )}
            </div>
            {groups.map(([group, ts]) => (
              <div key={group} className="tag-group">
                <h4>{group}</h4>
                <div className="tag-checks">
                  {ts.map((t) => (
                    <label key={t.id} className={`tagcheck${cur.tags.includes(t.id) ? " on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={cur.tags.includes(t.id)}
                        onChange={() => toggle(t.id)}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="tag-group">
              <h4>app screen (for app shots)</h4>
              <select
                className="tag-add"
                value={cur.appScreen}
                onChange={(e) => setScreen(e.target.value)}
              >
                <option value="">—</option>
                {appScreens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy || taggedCount === 0}>
            {busy ? `Uploading ${done}/${taggedCount}…` : `Add ${taggedCount} to library`}
          </button>
        </div>
      </div>
    </div>
  );
}
