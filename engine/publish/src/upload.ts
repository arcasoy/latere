import { isStorageConfigured, uploadFile } from "@latere/core";

export function isUploadConfigured(): boolean {
  return isStorageConfigured();
}

export async function uploadSlide(
  localPath: string,
  id: string,
  basename: string,
): Promise<string> {
  return uploadFile(localPath, `renders/${id}/${basename}`, "image/png");
}
