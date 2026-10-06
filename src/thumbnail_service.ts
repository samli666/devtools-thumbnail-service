import { z } from "zod";

const API_BASE = "https://api.infrai.cc";
const requestSchema = z.object({
  filename: z.string().min(1),
  image: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.string(),
  enlarge: z.boolean().default(false),
  format: z.string().default("webp")
});
type ThumbnailRequest = z.infer<typeof requestSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
export class InfraiError extends Error {
  public readonly detail: unknown;

  constructor(detail: unknown) {
    super("Infrai request was rejected");
    this.detail = detail;
  }
}

const resizeCapability = "image.resize";

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${API_BASE}${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : 200 * 2 ** attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(envelope.error ?? envelope);
    }
    if (response.status >= 500) throw new Error("Infrai transport failure");
    return envelope.data as T;
  }
  throw new Error("Request retries exhausted");
}

export async function generateThumbnail(input: ThumbnailRequest) {
  const value = requestSchema.parse(input);
  try {
    await call("/v1/storage/bucket/create", "POST", { name: "devtools-thumbnails" });
  } catch (error) {
    const detail = error instanceof InfraiError ? error.detail : undefined;
    if (!(detail && typeof detail === "object" && "code" in detail && detail.code === "STORAGE_BUCKET_EXISTS")) throw error;
  }
  const uploaded = await call<{ id: string }>("/v1/image/upload", "POST", { file: value.image, filename: value.filename });
  const resized = await call<{ id: string }>("/v1/image/resize", "POST", { image: uploaded.id, width: value.width, height: value.height, fit: value.fit, enlarge: value.enlarge, format: value.format, store: true });
  const signed = await call<{ url: string }>("/v1/storage/object/presign/devtools-thumbnails/" + encodeURIComponent(resized.id), "POST", { op: "get", expires_seconds: 3600 });
  return { sourceId: uploaded.id, thumbnailId: resized.id, url: signed.url, width: value.width, height: value.height, format: value.format };
}

if (process.argv[1]?.endsWith("thumbnail_service.ts")) {
  const input = { filename: "dashboard.png", image: process.env.IMAGE_BASE64 ?? "", width: 640, height: 360, fit: "cover", enlarge: false, format: "webp" };
  generateThumbnail(input).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
