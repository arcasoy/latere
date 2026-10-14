import type { Connector } from "../server/connectors";

export function Connectors({
  items,
  failures = {},
}: {
  items: Connector[];
  failures?: Record<string, string>;
}) {
  if (!items.length) return null;

  return (
    <ul className="connectors">
      {items.map((item) => {
        const failure = failures[item.name];
        const connected = item.connected && !failure;
        return (
          <li
            key={item.name}
            className={
              item.paused ? "connector paused" : connected ? "connector on" : "connector off"
            }
            title={failure ?? item.detail}
          >
            <span className="connector-dot" />
            {item.name}
            {item.paused ? " · paused" : ""}
          </li>
        );
      })}
    </ul>
  );
}
