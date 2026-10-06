import assert from "node:assert/strict";
import { generateThumbnail } from "./thumbnail_service.js";

const requests: Array<{ path: string; body: any }> = [];
globalThis.fetch = async (url, init) => {
  requests.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) });
  if (requests.length === 1) {
    return new Response(JSON.stringify({ ok: false, error: { code: "STORAGE_BUCKET_EXISTS" } }), { status: 409, headers: { "content-type": "application/json" } });
  }
  const data = requests.length === 1 ? {} : requests.length === 2 ? { id: "source-1" } : requests.length === 3 ? { id: "thumb-1" } : { url: "https://signed.example/thumb-1" };
  return new Response(JSON.stringify({ ok: true, data, metadata: {} }), { status: 200, headers: { "content-type": "application/json" } });
};
process.env.INFRAI_API_KEY = "test-key";
const result = await generateThumbnail({ filename: "screen.png", image: "base64-data", width: 320, height: 180, fit: "cover", enlarge: false, format: "webp" });
assert.deepEqual(result, { sourceId: "source-1", thumbnailId: "thumb-1", url: "https://signed.example/thumb-1", width: 320, height: 180, format: "webp" });
assert.equal(requests[1].path, "/v1/image/upload");
assert.equal(requests[2].path, "/v1/image/resize");
assert.equal(requests[2].body.store, true);
assert.equal(requests[3].body.expires_seconds, 3600);
console.log("thumbnail decision test passed");
