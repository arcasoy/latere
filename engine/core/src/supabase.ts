import { createClient } from "@supabase/supabase-js";

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.LATERE_SUPABASE_URL && process.env.LATERE_SUPABASE_SECRET_KEY);
}

export function supabase() {
  const url = process.env.LATERE_SUPABASE_URL;
  const key = process.env.LATERE_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set LATERE_SUPABASE_URL and LATERE_SUPABASE_SECRET_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }) },
  });
}

type Table = "posts" | "shots" | "requests" | "hooks" | "lessons";
const PAGE_SIZE = 500;

export async function readRecords<T>(table: Table): Promise<T[]> {
  const records: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase()
      .from(table)
      .select("data")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Read ${table}: ${error.message}`);
    records.push(...data.map((row) => row.data as T));
    if (data.length < PAGE_SIZE) return records;
  }
}

export async function writeRecord<T extends { id: string }>(
  table: Table,
  record: T,
): Promise<void> {
  const { error } = await supabase().from(table).upsert({ id: record.id, data: record });
  if (error) throw new Error(`Write ${table}: ${error.message}`);
}

export async function deleteRecord(table: Table, id: string): Promise<boolean> {
  const { data, error } = await supabase().from(table).delete().eq("id", id).select("id");
  if (error) throw new Error(`Delete ${table}: ${error.message}`);
  return data.length > 0;
}
