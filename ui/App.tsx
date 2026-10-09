import { useEffect, useState } from "react";
import type { Connector, ConnectorsBySection } from "../server/connectors";
import { Connectors } from "./Connectors";
import { Content } from "./content/Content";
import { Acquisition } from "./panels/Acquisition";
import { Payback } from "./panels/Payback";
import { Revenue } from "./panels/Revenue";

const SECTIONS = [
  {
    id: "payback",
    title: "Payback",
    note: "Blended spend and proceeds, with trial conversion straight from RevenueCat.",
  },
  {
    id: "acquisition",
    title: "Acquisition",
    note: "What a post produced. PostHog sees the click and nothing after it; Apple sees the download and nothing before it. The conversion between them lives here.",
  },
  {
    id: "content",
    title: "Content",
    note: "What goes out: the shot library, the hooks, what got made, and what the algorithm did with it.",
  },
  {
    id: "activation",
    title: "Activation",
    note: "sign-up → first capture → second day",
  },
  {
    id: "retention",
    title: "Retention",
    note: "cohort curves, the day-2 and day-7 lines",
  },
  {
    id: "revenue",
    title: "Revenue",
    note: 'RevenueCat\'s own overview, carried across unchanged. "Customers" counts identities RevenueCat has seen, not people who have paid — that is Active Subscriptions.',
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const isSection = (value: string): value is SectionId =>
  SECTIONS.some((section) => section.id === value);

function initialSection(): SectionId {
  const hash = location.hash.replace("#", "").split("/")[0] ?? "";
  return isSection(hash) ? hash : "acquisition";
}

function Identity() {
  const [who, setWho] = useState("checking the gate…");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { email?: string | null }) => setWho(body.email ?? "signed in"))
      .catch(() => setWho("gate unreachable"));
  }, []);

  return <p className="who">{who}</p>;
}

function Placeholder({ note, connectors }: { note: string; connectors: Connector[] }) {
  return (
    <section className="panel">
      <Connectors items={connectors} />
      <p className="note">{note}</p>
      <p className="pending">not wired yet</p>
    </section>
  );
}

export function App() {
  const [section, setSection] = useState<SectionId>(initialSection);
  const [wiring, setWiring] = useState<ConnectorsBySection>({});

  useEffect(() => {
    fetch("/api/connectors")
      .then((r) => (r.ok ? (r.json() as Promise<ConnectorsBySection>) : Promise.reject()))
      .then(setWiring)
      .catch(() => setWiring({}));
  }, []);

  useEffect(() => {
    const rest = location.hash.replace("#", "").split("/").slice(1).join("/");
    location.hash = rest ? `${section}/${rest}` : section;
  }, [section]);

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const wired = wiring[section] ?? [];

  return (
    <div className="console">
      <header className="masthead">
        <h1>gtm</h1>
        <Identity />
      </header>

      <nav className="nav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === section ? "on" : ""}
            onClick={() => setSection(s.id)}
          >
            {s.title}
          </button>
        ))}
      </nav>

      {section === "payback" && <Payback note={current.note} connectors={wired} />}
      {section === "acquisition" && <Acquisition note={current.note} connectors={wired} />}
      {section === "content" && <Content connectors={wired} />}
      {section === "revenue" && <Revenue note={current.note} connectors={wired} />}
      {(section === "activation" || section === "retention") && (
        <Placeholder note={current.note} connectors={wired} />
      )}
    </div>
  );
}
