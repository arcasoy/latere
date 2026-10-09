import { readFile } from "node:fs/promises";
import { isSupabaseConfigured, supabase } from "./supabase";

const BUCKET = "media";
export const isStorageConfigured = isSupabaseConfigured;

export function publicUrl(key: string): string {
  const url = process.env.LATERE_SUPABASE_URL;
  if (!url) throw new Error("LATERE_SUPABASE_URL is required");
  return `${url.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadFile(
  localPath: string,
  key: string,
  contentType = "image/png",
): Promise<string> {
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(key, await readFile(localPath), { contentType, upsert: true });
  if (error) throw new Error(`Upload ${key}: ${error.message}`);
  return publicUrl(key);
}

export async function getObjectBuffer(key: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase().storage.from(BUCKET).download(key);
  if (error) {
    if ("statusCode" in error && String(error.statusCode) === "404") return null;
    throw new Error(`Download ${key}: ${error.message}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function deleteObject(key: string): Promise<void> {
  const { error } = await supabase().storage.from(BUCKET).remove([key]);
  if (error) throw new Error(`Delete ${key}: ${error.message}`);
}

interface StoredObject {
  key: string;
  lastModified?: string;
  size?: number;
}

export async function listObjects(prefix = ""): Promise<StoredObject[]> {
  const result: StoredObject[] = [];
  const directory = prefix.replace(/\/+$/, "");
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase()
      .storage.from(BUCKET)
      .list(directory, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) throw new Error(`List ${prefix}: ${error.message}`);
    for (const item of data) {
      const key = directory ? `${directory}/${item.name}` : item.name;
      if (!item.id) result.push(...(await listObjects(key)));
      else
        result.push({ key, lastModified: item.updated_at ?? undefined, size: item.metadata?.size });
    }
    if (data.length < 100) return result;
  }
}
