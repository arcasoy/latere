import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { loadShots, updateShotTags } from "./catalog";
import { readLedger, upsertLedger } from "./io";
import { deleteObject, getObjectBuffer, listObjects, publicUrl, uploadFile } from "./storage";
import { readRecords } from "./supabase";

function configure(t: TestContext) {
  const oldUrl = process.env.LATERE_SUPABASE_URL;
  const oldKey = process.env.LATERE_SUPABASE_SECRET_KEY;
  process.env.LATERE_SUPABASE_URL = "https://latere.test";
  process.env.LATERE_SUPABASE_SECRET_KEY = "sb_secret_test";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.LATERE_SUPABASE_URL;
    else process.env.LATERE_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.LATERE_SUPABASE_SECRET_KEY;
    else process.env.LATERE_SUPABASE_SECRET_KEY = oldKey;
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("reads every page and writes only the selected post", async (t) => {
  configure(t);
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, init });
    assert.equal(new Headers(init?.headers).get("apikey"), "sb_secret_test");
    if (init?.method === "POST") return new Response(null, { status: 201 });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return json(
      Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => ({
        data: { id: `${offset + i}`, created_at: "2026-10-09" },
      })),
    );
  });
  assert.equal((await readLedger()).length, 501);
  assert.equal(calls[1]?.url.searchParams.get("offset"), "500");
  await upsertLedger({ id: "post", created_at: "2026-10-09", status: "drafted", factors: {} });
  const write = calls.at(-1);
  assert.equal(write?.url.pathname, "/rest/v1/posts");
  assert.equal(JSON.parse(String(write?.init?.body)).id, "post");
  assert.match(new Headers(write?.init?.headers).get("prefer") ?? "", /merge-duplicates/);
});

test("database outages and missing credentials do not look like empty content", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => json({ message: "database unavailable" }, 503));
  await assert.rejects(readLedger(), /database unavailable/);
  await assert.rejects(loadShots(), /database unavailable/);
  delete process.env.LATERE_SUPABASE_SECRET_KEY;
  await assert.rejects(readRecords("posts"), /LATERE_SUPABASE_SECRET_KEY/);
});

test("tagging updates one shot without replacing the catalog", async (t) => {
  configure(t);
  const writes: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_input: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    return json([{ data: { id: "shot", tags: ["old"] } }, { data: { id: "other", tags: [] } }]);
  });
  assert.deepEqual((await updateShotTags("shot", ["new"]))?.tags, ["new"]);
  assert.deepEqual(writes, [{ id: "shot", data: { id: "shot", tags: ["new"] } }]);
});

test("media uses the Supabase bucket, lists nested folders, and propagates permission errors", async (t) => {
  configure(t);
  const directory = await mkdtemp(join(tmpdir(), "latere-storage-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "image.png");
  await writeFile(file, "image-bytes");
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    calls.push({ path, init });
    if (path.endsWith("/list/media")) {
      const prefix = JSON.parse(String(init?.body)).prefix;
      return json(
        prefix === "renders"
          ? [{ name: "post", id: null }]
          : [{ name: "slide_01.png", id: "obj", updated_at: "2026-10-09", metadata: { size: 11 } }],
      );
    }
    if (init?.method === "GET") return new Response("image-bytes");
    return json({ Key: "media/raw/image.png" });
  });
  const url = await uploadFile(file, "raw/image.png");
  assert.equal(url, "https://latere.test/storage/v1/object/public/media/raw/image.png");
  assert.equal(
    publicUrl("raw/a b.png"),
    "https://latere.test/storage/v1/object/public/media/raw/a%20b.png",
  );
  assert.equal(Buffer.from((await getObjectBuffer("raw/image.png"))!).toString(), "image-bytes");
  assert.deepEqual(
    (await listObjects("renders/")).map((x) => x.key),
    ["renders/post/slide_01.png"],
  );
  await deleteObject("raw/image.png");
  assert.equal(calls.at(-1)?.init?.method, "DELETE");
  assert.deepEqual(JSON.parse(String(calls.at(-1)?.init?.body)), { prefixes: ["raw/image.png"] });
  t.mock.method(globalThis, "fetch", async () =>
    json({ message: "denied", statusCode: "403" }, 403),
  );
  await assert.rejects(getObjectBuffer("raw/private.png"), /denied/);
});
