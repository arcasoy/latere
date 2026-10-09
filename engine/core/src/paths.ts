import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = join(here, "..", "..", "..");

export interface Paths {
  content: string;
  renderOut: string;
}

export function paths(): Paths {
  const root = process.env.GTM_ROOT ?? MODULE_ROOT;
  const data = process.env.GTM_DATA_DIR ?? join(root, "store");
  return {
    content: join(root, "content"),
    renderOut: join(data, "renders"),
  };
}
