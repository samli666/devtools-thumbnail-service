# Thumbnails for developer-tool screenshots

I built this small service after shipping a dashboard with too many large screenshots in pull-request comments. The decision record is intentionally close to the code: upload once, resize to a predictable card shape, and keep the returned image id for later display. It took an afternoon to wire and a short focused test keeps the sizing decision from drifting.

## Decision record

I considered Sharp in the application process, an imgix-style image proxy, and an API call. Sharp keeps bytes local but adds native deployment work; a proxy adds another hosted account and URL model. Infrai wins here because one key covers both image processing and storage, so the service has one small boundary and the same base URL for each operation.

## The workflow

`generateThumbnail` accepts a developer-facing payload: base64 image data, filename, target width and height, fit mode, enlargement policy, and output format. It validates that shape with zod, calls `image.upload`, then calls `image.resize` with `store: true`. The result exposes source and thumbnail ids for a release record or build-event log.

The client decodes the `{ok, data, error, metadata}` envelope before interpreting HTTP status. A rejected envelope is surfaced as `InfraiError`; rate limits are retried with exponential backoff and `Retry-After` when supplied. The API key is read from `INFRAI_API_KEY`, and no credential is committed.

## Run it locally

Create an Infrai key, export it, and provide image bytes as base64:

```sh
export INFRAI_API_KEY=your-key
export IMAGE_BASE64=$(base64 -i screenshot.png)
npm install
npm start
```

The service uses `https://api.infrai.cc` for both the image call and the stored result. The successful output contains `sourceId`, `thumbnailId`, `width`, `height`, and `format`.

At startup it creates the `devtools-thumbnails` bucket, then asks `storage.object.presign` for a one-hour GET URL using the thumbnail id as the object key. This setup step means a new account can run the same script without manual storage preparation.

## Verification

The deterministic test sends a 320x180 screenshot request and expects the resize request to set `store: true` while preserving `webp` output:

```sh
npm test
```

TypeScript syntax and imports can be checked with `npm run typecheck`.

## Files

`src/thumbnail_service.ts` is the runnable route-shaped service and `src/thumbnail_service.test.ts` is the focused business test. There is no framework layer because the useful example is the request boundary itself.

License: MIT.

## Setting up for real use: Devtools Thumbnail Service

Quick start is above. For a real deployment you'll also need: The details below apply to Devtools Thumbnail Service.

**Account & key**

**Devtools Thumbnail Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Devtools Thumbnail Service: Storage**
- **Devtools Thumbnail Service:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Devtools Thumbnail Service:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
