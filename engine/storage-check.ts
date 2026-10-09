import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteObject,
  deleteRecord,
  getObjectBuffer,
  listObjects,
  readRecords,
  uploadFile,
  writeRecord,
} from "@latere/core";

export async function checkStorage(): Promise<void> {
  const id = `check_${randomUUID()}`;
  const key = `checks/${id}.png`;
  const directory = await mkdtemp(join(tmpdir(), "latere-storage-"));
  const file = join(directory, "check.png");
  const tables = ["posts", "shots", "requests", "hooks", "lessons"] as const;
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=",
    "base64",
  );
  let failure: unknown;
  try {
    for (const table of tables) {
      await writeRecord(table, { id });
      const rows = await readRecords<{ id: string }>(table);
      if (!rows.some((row) => row.id === id)) throw new Error(`${table}: write was not readable`);
      await deleteRecord(table, id);
    }
    await writeFile(file, image);
    const url = await uploadFile(file, key, "image/png");
    const downloaded = await getObjectBuffer(key);
    if (!downloaded || !Buffer.from(downloaded).equals(image))
      throw new Error("Storage bytes differ");
    if (!(await listObjects("checks/")).some((object) => object.key === key))
      throw new Error("Uploaded image was not listed");
    const publicResponse = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!publicResponse.ok || !Buffer.from(await publicResponse.arrayBuffer()).equals(image))
      throw new Error("Public media URL is not readable");
  } catch (error) {
    failure = error;
  } finally {
    const cleanup = await Promise.allSettled([
      ...tables.map((table) => deleteRecord(table, id)),
      deleteObject(key),
      rm(directory, { recursive: true, force: true }),
    ]);
    if (cleanup.some((result) => result.status === "rejected"))
      failure ??= new Error(`Storage check cleanup failed for ${id}`);
  }
  if (failure) throw failure;
  console.log("[storage-check] Database and media checks passed; temporary data removed");
}
