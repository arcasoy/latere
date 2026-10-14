import { useEffect, useState } from "react";
import type { Connector } from "../../server/connectors";
import type { PaybackPanel } from "../../server/payback";
import type { ChartRow, Grain } from "../../server/payback/model";
import { Connectors } from "../Connectors";

const count = (n: number | null) => (n === null ? "Unavailable" : n.toLocaleString("en-US"));
const cash = (n: number | null) =>
  n === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
function sum(rows: ChartRow[] | null, column: number) {
  return rows?.length && rows.every((row) => row.values[column] != null)
    ? rows.reduce((n, row) => n + (row.values[column] ?? 0), 0)
    : null;
}
function Total({ value, label }: { value: string; label: string }) {
  return (
    <div className="total">
      <span className="big">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}
function savedFilters(): { days: number; grain: Grain } {
  try {
    const saved = JSON.parse(localStorage.getItem("payback-live-filters") ?? "{}");
    return {
      days: [30, 90, 180].includes(saved.days) ? saved.days : 90,
      grain: ["day", "week", "month"].includes(saved.grain) ? saved.grain : "week",
    };
  } catch {
    return { days: 90, grain: "week" };
  }
}
export function Payback({ note, connectors }: { note: string; connectors: Connector[] }) {
  const [filters, setFilters] = useState(savedFilters);
  const [revision, setRevision] = useState(0);
  const [panel, setPanel] = useState<PaybackPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem("payback-live-filters", JSON.stringify(filters));
    } catch {}
    const controller = new AbortController();
    setLoading(true);
    setPanel(null);
    setError(null);
    void fetch(`/api/payback?days=${filters.days}&grain=${filters.grain}&revision=${revision}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PaybackPanel>;
      })
      .then(setPanel)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, revision]);
  const failures = Object.fromEntries(
    (panel?.sources ?? [])
      .filter((s) => s.status === "missing" || s.status === "failed")
      .map((s) => [s.name.startsWith("RevenueCat") ? "RevenueCat" : s.name, s.detail]),
  );
  return (
    <section className="panel">
      <Connectors items={connectors} failures={failures} />
      <p className="note">{note}</p>
      <div className="payback-controls">
        <label htmlFor="payback-days">
          Period
          <select
            id="payback-days"
            value={filters.days}
            onChange={(e) => setFilters({ ...filters, days: Number(e.target.value) })}
          >
            {[30, 90, 180].map((days) => (
              <option key={days} value={days}>
                Last {days} days
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="payback-grain">
          Group by
          <select
            id="payback-grain"
            value={filters.grain}
            onChange={(e) => setFilters({ ...filters, grain: e.target.value as Grain })}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <button
          type="button"
          className="refresh"
          disabled={loading}
          onClick={() => setRevision((n) => n + 1)}
        >
          refresh
        </button>
      </div>
      {loading && (
        <p className="pending" role="status">
          Reading provider reports…
        </p>
      )}
      {error && <p className="notice warn">Unable to read payback: {error}</p>}
      {panel && (
        <>
          {panel.sources
            .filter((s) => s.status === "missing" || s.status === "failed")
            .map((s) => (
              <p className="notice warn" key={s.name}>
                {s.name}: {s.detail}
              </p>
            ))}
          <h3 className="subhead">Spend and proceeds</h3>
          <div className="totals wrap">
            <Total value="Unavailable" label="TikTok spend · not connected" />
            <Total value={cash(sum(panel.proceeds, 0))} label="proceeds · RevenueCat estimate" />
            <Total value="Unavailable" label="proceeds minus ad spend" />
          </div>
          <p className="note">
            All channels combined, including organic users and renewals. Proceeds belong to the
            period of the transaction, after RevenueCat’s estimated fees, taxes and refund
            adjustments. No extra fee deduction
          </p>
          <p className="notice">
            Compare spending changes with proceeds over several weeks, allowing time for trials to
            convert. This measures blended business performance; a change alone does not prove what
            caused it. Spend is not connected yet
          </p>
          <div className="payback-table">
            <table>
              <thead>
                <tr>
                  <th>Period · UTC</th>
                  <th className="num">TikTok spend</th>
                  <th className="num">RC proceeds</th>
                  <th className="num">After ad spend</th>
                </tr>
              </thead>
              <tbody>
                {panel.proceeds?.map((row) => (
                  <tr key={row.start}>
                    <td className="mono">
                      {row.start}
                      {row.incomplete ? " · partial" : ""}
                    </td>
                    <td className="num">Unavailable</td>
                    <td className="num">{cash(row.values[0] ?? null)}</td>
                    <td className="num">Unavailable</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="subhead">Trial → paid · RevenueCat cohorts</h3>
          <div className="totals wrap">
            <Total value={count(sum(panel.cohorts, 0))} label="new customers" />
            <Total value={count(sum(panel.cohorts, 1))} label="trial started" />
            <Total value={count(sum(panel.cohorts, 2))} label="paid" />
          </div>
          <p className="note">
            Customers grouped by RevenueCat’s first-seen date, with outcomes as reported now. Paid
            means a trial converted to a paid subscription, even if later refunded. These are not
            fixed 7-, 14- or 30-day conversion windows; recent cohorts still have time to convert
          </p>
          <div className="payback-table">
            <table>
              <thead>
                <tr>
                  <th>Cohort · UTC</th>
                  <th className="num">New customers</th>
                  <th className="num">Trial started</th>
                  <th className="num">Paid</th>
                  <th className="num">Trial renewing</th>
                  <th className="num">Trial canceled</th>
                  <th className="num">Expired unpaid</th>
                </tr>
              </thead>
              <tbody>
                {panel.cohorts?.map((row) => (
                  <tr key={row.start}>
                    <td className="mono">
                      {row.start}
                      {row.incomplete ? " · partial" : ""}
                    </td>
                    {row.values.map((n, i) => (
                      <td
                        className="num"
                        key={["customers", "trials", "paid", "renewing", "canceled", "expired"][i]}
                      >
                        {count(n)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="payback-paused">
            <h3 className="subhead">App activity · paused</h3>
            <div className="totals wrap">
              <Total value={count(panel.activity.accounts)} label="accounts created" />
              <Total value={count(panel.activity.checkins)} label="first completed check-in" />
              <Total value={count(panel.activity.offers)} label="people shown an offer" />
            </div>
            <p className="note">
              {panel.sources.find((source) => source.status === "paused")?.detail}
            </p>
          </div>
          <details className="payback-details">
            <summary>Sources and freshness</summary>
            <ul>
              {panel.sources.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}</strong>: {s.detail}
                </li>
              ))}
            </ul>
            <p className="note">
              Provider processing delays still apply. No payback reports or customer history are
              saved by this panel. Only your display preferences are saved in this browser.
              RevenueCat chooses week boundaries; a partial period is not a mature conversion cohort
            </p>
          </details>
          <p className="stamp">
            {panel.start} to {panel.end} · USD · UTC · fetched{" "}
            {new Date(panel.asOf).toLocaleString()} · refresh to fetch again
          </p>
        </>
      )}
    </section>
  );
}
