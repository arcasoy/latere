import { useEffect, useState } from "react";
import type { ConnectorsBySection } from "../server/connectors";
import { Content } from "./content/Content";
import { Acquisition } from "./panels/Acquisition";
import { Payback } from "./panels/Payback";

const SECTIONS = [
  {
    id: "payback",
    title: "Payback",
    note: "Planned: measure whether each day’s acquired users earn back their advertising cost.",
  },
  {
    id: "acquisition",
    title: "Acquisition",
    note: "App Store downloads and the sources Apple reports.",
  },
  {
    id: "content",
    title: "Content",
    note: "What goes out: the shot library, the hooks, what got made, and what the algorithm did with it.",
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
  const [who, setWho] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { email?: string | null }) => setWho(body.email ?? null))
      .catch(() => setWho("gate unreachable"));
  }, []);

  return who ? <p className="who">{who}</p> : null;
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
    </div>
  );
}
