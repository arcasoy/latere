import sharp, { type OverlayOptions } from "sharp";

const WIDTH = 1080;
const GUTTER = 65;
const TEXT_WIDTH = 780;
const PANEL_PADDING = 44;
const MAX_TEXT_HEIGHT = 380;
const MIN_FONT_SIZE = 42;
const SAMPLE_SCALE = 10;

interface PhotoInput {
  body: string;
  role: "hook" | "beat" | "cta";
  aspect: "9:16" | "4:5";
  brand: string;
}

function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function textImage(body: string, size: number, width: number) {
  return sharp({
    text: {
      text: `<span foreground="white">${escapeMarkup(body)}</span>`,
      font: `Liberation Sans Bold ${size}`,
      width,
      align: "center",
      wrap: "word-char",
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function fitText(body: string, role: PhotoInput["role"]) {
  if (!body.trim() || body.length > 2000)
    throw new Error("Slide text must contain 1–2000 characters");
  const start = role === "hook" ? 74 : role === "cta" ? 54 : 60;
  for (let size = start; size >= MIN_FONT_SIZE; size -= 2) {
    const rendered = await textImage(body, size, TEXT_WIDTH);
    if (rendered.info.width <= TEXT_WIDTH && rendered.info.height <= MAX_TEXT_HEIGHT)
      return { ...rendered, size };
  }
  throw new Error("Text does not fit at the minimum readable font size");
}

function complexity(
  pixels: Buffer,
  width: number,
  left: number,
  top: number,
  boxWidth: number,
  height: number,
): number {
  const firstX = Math.floor(left / SAMPLE_SCALE);
  const lastX = Math.floor((left + boxWidth) / SAMPLE_SCALE);
  const firstY = Math.floor(top / SAMPLE_SCALE);
  const lastY = Math.floor((top + height) / SAMPLE_SCALE);
  let sum = 0;
  let count = 0;
  for (let y = firstY + 1; y < lastY; y++) {
    for (let x = firstX + 1; x < lastX; x++) {
      const here = pixels[y * width + x] ?? 0;
      sum += Math.abs(here - (pixels[y * width + x - 1] ?? 0));
      sum += Math.abs(here - (pixels[(y - 1) * width + x] ?? 0));
      count += 2;
    }
  }
  return count ? sum / count / 255 : 0;
}

export async function renderPhoto(background: Buffer, input: PhotoInput) {
  if (input.aspect !== "9:16" && input.aspect !== "4:5")
    throw new Error("Unsupported aspect ratio");
  const height = input.aspect === "4:5" ? 1350 : 1920;
  const image = sharp(background, { limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (
    !metadata.format ||
    !["jpeg", "png", "webp", "avif"].includes(metadata.format) ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("A single raster background is required");
  const base = await image
    .rotate()
    .resize(WIDTH, height, { fit: "cover", position: "centre" })
    .removeAlpha()
    .png()
    .toBuffer();
  const text = await fitText(input.body, input.role);
  const panelHeight = text.info.height + PANEL_PADDING * 2;
  const panelWidth = text.info.width + PANEL_PADDING * 2;
  const panelLeft = Math.round((WIDTH - panelWidth) / 2);
  const topInset = Math.round(WIDTH * 0.2);
  const bottomInset = Math.round(WIDTH * 0.24);
  const sampleWidth = WIDTH / SAMPLE_SCALE;
  const pixels = await sharp(base)
    .resize(sampleWidth, Math.round(height / SAMPLE_SCALE), { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const candidates = [
    { position: "top", top: topInset },
    { position: "center", top: Math.round((height - panelHeight) / 2) },
    { position: "lower", top: height - bottomInset - panelHeight },
  ].map((candidate) => ({
    ...candidate,
    complexity: complexity(pixels, sampleWidth, panelLeft, candidate.top, panelWidth, panelHeight),
  }));
  const selected = [...candidates].sort((a, b) => a.complexity - b.complexity)[0];
  if (!selected) throw new Error("No eligible text region");
  const panel = Buffer.from(
    `<svg width="${panelWidth}" height="${panelHeight}"><rect width="${panelWidth}" height="${panelHeight}" rx="${Math.round(WIDTH * 0.05)}" fill="black" fill-opacity="0.72"/></svg>`,
  );
  const layers: OverlayOptions[] = [
    { input: panel, left: panelLeft, top: selected.top },
    {
      input: text.data,
      left: Math.round((WIDTH - text.info.width) / 2),
      top: selected.top + PANEL_PADDING,
    },
  ];
  if (input.brand.trim()) {
    const brand = await textImage(input.brand, 35, WIDTH - GUTTER * 2);
    if (brand.info.height > 70) throw new Error("Brand text is too long");
    layers.push({ input: brand.data, left: GUTTER, top: GUTTER });
  }
  const png = await sharp(base).composite(layers).png().toBuffer();
  return {
    png,
    report: {
      width: WIDTH,
      height,
      font: "Liberation Sans Bold",
      font_size: text.size,
      text_box: {
        left: Math.round((WIDTH - text.info.width) / 2),
        top: selected.top + PANEL_PADDING,
        width: text.info.width,
        height: text.info.height,
      },
      placement: selected.position,
      candidates,
      selection_reason: "lowest_background_edge_complexity",
      subject_analysis: "not_run",
      platform_crop_validation: "not_run",
      text_fit: "passed",
    },
  };
}
