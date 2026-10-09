import { readFile } from "node:fs/promises";
import { validateManifest } from "./manifest";

async function main(): Promise<void> {
  const [command, file, ...rest] = process.argv.slice(2);
  if (command !== "validate" || !file || rest.length) {
    throw new Error("usage: npm run production -- validate <manifest.json>");
  }
  const input: unknown = JSON.parse(await readFile(file, "utf8"));
  const result = validateManifest(input);
  console.log(
    JSON.stringify(
      {
        stage: "manifest",
        valid: result.valid,
        issues: result.issues,
        ...(result.valid
          ? {
              request_key: result.manifest.request_key,
              posts: result.manifest.posts.length,
              slides: result.manifest.posts.reduce(
                (n, p) => n + p.factors.composition.slides.length,
                0,
              ),
            }
          : {}),
        visual_validation: "not_run",
      },
      null,
      2,
    ),
  );
  if (!result.valid) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.log(
    JSON.stringify({
      stage: "manifest",
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      visual_validation: "not_run",
    }),
  );
  process.exitCode = 1;
});
