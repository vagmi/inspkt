// File uploads to a Cloudflare R2 bucket. Keys are org-prefixed so one org
// can never read or overwrite another's objects. Never trust the client
// filename for the key — generate it.
// Copy to: workers/api/services/uploads-service.ts
import { newId } from "~/lib/id";
import { ValidationError } from "./errors";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export interface UploadInput {
  filename: string;
  contentType: string;
  size: number;
  body: ReadableStream | ArrayBuffer | Blob;
}

export interface UploadsServiceDeps {
  bucket: R2Bucket;
  /** Public base URL for the bucket, e.g. https://pub-xxx.r2.dev */
  publicBaseUrl: string;
}

export function createUploadsService({
  bucket,
  publicBaseUrl,
}: UploadsServiceDeps) {
  return {
    async put(
      orgId: string,
      file: UploadInput,
    ): Promise<{ key: string; url: string }> {
      if (!ALLOWED_TYPES.has(file.contentType)) {
        throw new ValidationError(`unsupported file type: ${file.contentType}`);
      }
      if (file.size > MAX_BYTES) {
        throw new ValidationError("file too large (max 5 MB)");
      }

      const ext = extFromName(file.filename);
      // org-scoped, unguessable key — the client name is only used for the ext.
      const key = `${orgId}/${newId()}${ext}`;

      await bucket.put(key, file.body, {
        httpMetadata: { contentType: file.contentType },
      });

      return { key, url: `${publicBaseUrl.replace(/\/$/, "")}/${key}` };
    },

    async delete(orgId: string, key: string): Promise<void> {
      // Enforce org scoping: refuse keys outside the org's prefix.
      if (!key.startsWith(`${orgId}/`)) {
        throw new ValidationError("key does not belong to this organization");
      }
      await bucket.delete(key);
    },
  };
}

export type UploadsService = ReturnType<typeof createUploadsService>;

function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}
