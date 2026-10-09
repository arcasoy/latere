import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

interface MediaInfo {
  durationS?: number;
  width?: number;
  height?: number;
  orientation?: "vertical" | "horizontal" | "square";
  hasAudio?: boolean;
}

function dimensions(width?: number, height?: number): MediaInfo {
  if (!width || !height) return {};
  return {
    width,
    height,
    orientation: width < height ? "vertical" : width > height ? "horizontal" : "square",
  };
}

export async function probeMedia(path: string): Promise<MediaInfo> {
  try {
    const metadata = await sharp(path).metadata();
    const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    return dimensions(
      rotated ? metadata.height : metadata.width,
      rotated ? metadata.width : metadata.height,
    );
  } catch {
    try {
      const { stdout } = await promisify(execFile)(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        { timeout: 15_000, maxBuffer: 1024 * 1024 },
      );
      const result = JSON.parse(stdout) as {
        streams?: { codec_type?: string; width?: number; height?: number }[];
        format?: { duration?: string };
      };
      const video = result.streams?.find((stream) => stream.codec_type === "video");
      const durationS = Number(result.format?.duration);
      return {
        ...dimensions(video?.width, video?.height),
        ...(Number.isFinite(durationS) ? { durationS } : {}),
        hasAudio: result.streams?.some((stream) => stream.codec_type === "audio") ?? false,
      };
    } catch {
      return {};
    }
  }
}
