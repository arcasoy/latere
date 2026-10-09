import { useCallback, useEffect, useState } from "react";
import type { Connector } from "../../server/connectors";
import type { RevenueMetric, RevenuePanel } from "../../server/revenuecat";
import { Connectors } from "../Connectors";

type Loaded =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; panel: RevenuePanel };

function format(metric: RevenueMetric, currency: string): string {
  if (metric.unit === "$") {
    return metric.value.toLocaleString("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: metric.value % 1 === 0 ? 0 : 2,
    });
  }
  return metric.value.toLocaleString("en-US");
}

function Body({ panel, onRefresh }: { panel: RevenuePanel; onRefresh: () => void }) {
  if (!panel.configured) {
    return <p className="pending">Not configured — missing secrets: {panel.missing.join(", ")}</p>;
  }

  return (
    <>
      <div className="totals wrap">
        {panel.metrics.map((metric) => (
          <div className="total" key={metric.id}>
            <span className="big">{format(metric, panel.currency)}</span>
            <span className="label">
              {metric.name}
              {metric.window ? ` · ${metric.window.toLowerCase()}` : ""}
            </span>
          </div>
        ))}
      </div>

      {panel.metrics.length === 0 && panel.errors.length === 0 && (
        <p className="pending">RevenueCat returned no metrics.</p>
      )}

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

export function Revenue({ note, connectors }: { note: string; connectors: Connector[] }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  const load = useCallback((force: boolean) => {
    setLoaded({ state: "loading" });
    fetch(`/api/revenue${force ? "?refresh=1" : ""}`)
      .then((r) =>
        r.ok ? (r.json() as Promise<RevenuePanel>) : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((panel) => setLoaded({ state: "ready", panel }))
      .catch((error: Error) => setLoaded({ state: "failed", error: error.message }));
  }, []);

  useEffect(() => load(false), [load]);

  const failure =
    loaded.state === "ready" && loaded.panel.configured ? loaded.panel.errors[0] : undefined;

  return (
    <section className="panel">
      <Connectors items={connectors} failures={failure ? { RevenueCat: failure } : {}} />
      <p className="note">{note}</p>

      {loaded.state === "loading" && <p className="pending">loading…</p>}
      {loaded.state === "failed" && <p className="notice warn">failed: {loaded.error}</p>}
      {loaded.state === "ready" && <Body panel={loaded.panel} onRefresh={() => load(true)} />}
    </section>
  );
}
