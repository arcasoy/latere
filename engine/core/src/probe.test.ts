import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { probeMedia } from "./probe";

test("image metadata uses native decoding and respects EXIF rotation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "latere-probe-"));
  try {
    const file = join(directory, "rotated.jpg");
    await sharp({ create: { width: 80, height: 40, channels: 3, background: "white" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toFile(file);
    assert.deepEqual(await probeMedia(file), { width: 40, height: 80, orientation: "vertical" });
    assert.deepEqual(await probeMedia(join(directory, "missing")), {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
