import { useEffect, useRef, useState } from "react";

interface LogLine {
  t: number;
  s: string;
}

function fmtT(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour12: false });
}

export function Terminal({ lines, active }: { lines: LogLine[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [open]);

  const latest = lines[lines.length - 1];

  return (
    <div className={`terminal${open ? " open" : ""}`}>
      <button type="button" className="terminal-bar" onClick={() => setOpen((o) => !o)}>
        <span className="term-chev">{open ? "▾" : "▸"}</span>
        <span className={`term-dot${active ? " live" : ""}`} />
        <span className="term-label">console</span>
        {!open && <span className="term-latest">{latest ? latest.s : "idle"}</span>}
      </button>
      {open && (
        <div className="terminal-body" ref={bodyRef}>
          {lines.length === 0 ? (
            <div className="term-empty">
              no activity yet — flip Autonomous on to watch it churn.
            </div>
          ) : (
            lines.map((l, i) => (
              <div key={i} className="term-line">
                <span className="term-time">{fmtT(l.t)}</span>
                <span className="term-text">{l.s}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
