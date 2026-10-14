import type { Connector } from "../../server/connectors";
import { Connectors } from "../Connectors";

export function Payback({ note, connectors }: { note: string; connectors: Connector[] }) {
  return (
    <section className="panel">
      <Connectors items={connectors} />
      <p className="note">{note}</p>
      <p className="pending">
        Not connected yet. This report will combine acquisition attribution, advertising spend, and
        subscription proceeds to track payback over time for each acquisition day.
      </p>
      <p className="note">
        AppsFlyer will supply attribution, RevenueCat will supply subscription revenue, and cost
        data will come from AppsFlyer or the advertising platforms. User matching and data coverage
        still need to be established before this report can calculate payback.
      </p>
    </section>
  );
}
