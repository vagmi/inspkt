// File uploads to a PRIVATE Cloudflare R2 bucket. The bucket has NO public
// access — objects are served only through the authenticated /api/uploads/:key
// read route, which checks the Clerk session and the org prefix. Keys are
// org-prefixed (`orgId/<random>.ext`) so one org can never read, overwrite, or
// delete another's objects. Never trust the client filename for the key.
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
}

export function createUploadsService({ bucket }: UploadsServiceDeps) {
  /** Refuse any key outside the caller's org prefix — the isolation boundary
   * for both reads and deletes. */
  function assertOwned(orgId: string, key: string): void {
    if (!key.startsWith(`${orgId}/`)) {
      throw new ValidationError("key does not belong to this organization");
    }
  }

  return {
    async put(orgId: string, file: UploadInput): Promise<{ key: string }> {
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

      return { key };
    },

    /** Fetch an object for a member of the owning org. Returns null if the key
     * doesn't exist; throws if the key is outside the org. */
    async get(orgId: string, key: string): Promise<R2ObjectBody | null> {
      assertOwned(orgId, key);
      return bucket.get(key);
    },

    async delete(orgId: string, key: string): Promise<void> {
      assertOwned(orgId, key);
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
