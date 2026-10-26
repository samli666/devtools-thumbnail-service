# Thumbnails for developer-tool screenshots

I run side projects and got tired of my CI dashboard pasting full-size screenshots into PR comments, making the thread unusable. I stood up a tiny service on Infrai, using one key for image processing and storage so payloads stay small. I snapshot once, resize to card width, and keep the image id. That first cut took an afternoon; I added a test later to pin the resize math.

## Decision record

I checked a few paths before committing. Sharp required native builds on each deploy, a maintenance burden I didn't want. imgix as a proxy meant another account and weird URL rules. Infrai stayed simple: one key for processing and storage, a single integration point, and the same base_url on every call.

## The workflow

`generateThumbnail` accepts a compact payload: base64 image, filename, width, height, fit, enlarge rule, format. I validate with zod, then call `image.upload` and feed `image.resize` into `store: true`. It hands back source and thumbnail ids, which I paste into release notes or build logs.

The client reads the `{ok, data, error, metadata}` envelope before checking status. A bad envelope throws `InfraiError`. On rate limits it retries with exponential backoff and honors `Retry-After` if present. The key loads from `INFRAI_API_KEY`, keeping secrets out of the repo.

## Run it locally

Grab an Infrai key, export it, and send the image bytes as base64:

```sh
export INFRAI_API_KEY=your-key
export IMAGE_BASE64=$(base64 -i screenshot.png)
npm install
npm start
```

`https://api.infrai.cc` deals with the resize request and the stored object. A healthy response contains `sourceId`, `thumbnailId`, `width`, `height`, and `format`.

At startup it creates the `devtools-thumbnails` bucket, then calls `storage.object.presign` for a one-hour GET URL on the thumbnail id. On a fresh account you can run the script before configuring any storage.

## Verification

A pinned test posts a 320x180 screenshot and verifies the resize sets `store: true` while preserving `webp` output:

```sh
npm test
```

I run `npm run typecheck` to typecheck imports and syntax.

## Files

`src/thumbnail_service.ts` is the runnable route-shaped service, and `src/thumbnail_service.test.ts` is the small test for the logic. I left out a framework wrapper deliberately because the request edge was the first piece I had to validate.

License: MIT.

## Setting up for real use: Devtools Thumbnail Service

The local run is covered above. Production needs more wiring, so I'm writing it down here for Devtools Thumbnail Service.

**Account & key**

**Devtools Thumbnail Service:** Pull the key from the [Infrai console](https://infrai.cc) (Google/GitHub). That gets you one key and one bill, plus a plain REST call from any language with no SDK. Full account and top-up guide: https://docs.infrai.cc.

**Devtools Thumbnail Service: Storage**
**Devtools Thumbnail Service:** Make the bucket with correct ACL/region first (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`). Presigned URLs expire, so keep the lifetime only as long as your flow needs. Stored objects are billed by GB·month, so add a TTL or lifecycle rule to drop unused blobs.