import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));

function run(contents: string) {
  const dir = mkdtempSync(join(tmpdir(), "latere-manifest-"));
  try {
    const file = join(dir, "manifest.json");
    writeFileSync(file, contents);
    const result = spawnSync(process.execPath, ["--import", "tsx", cli, "validate", file], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, "");
    return { status: result.status, report: JSON.parse(result.stdout) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CLI returns an actionable JSON failure for malformed JSON", () => {
  const result = run("{");
  assert.equal(result.status, 1);
  assert.equal(result.report.valid, false);
  assert.equal(result.report.visual_validation, "not_run");
  assert.equal(typeof result.report.error, "string");
});

test("CLI preserves validation stage and actual counts for a complete story", () => {
  const result = run(
    JSON.stringify({
      version: 1,
      request_key: "cli-smoke",
      posts: [
        {
          id: "story",
          template_version: "v1",
          factors: {
            hook_text: "A story",
            used_tags: ["story"],
            aspect: "9:16",
            composition: {
              format: "story",
              segments: [],
              slides: [
                {
                  id: "cover",
                  background: { shot_id: "a" },
                  text: { role: "hook", body: "A story" },
                },
                {
                  id: "content",
                  background: { shot_id: "b" },
                  text: { role: "beat", body: "The next part" },
                },
              ],
            },
          },
        },
      ],
    }),
  );
  assert.equal(result.status, 0);
  assert.deepEqual(result.report, {
    stage: "manifest",
    valid: true,
    issues: [],
    request_key: "cli-smoke",
    posts: 1,
    slides: 2,
    visual_validation: "not_run",
  });
});
