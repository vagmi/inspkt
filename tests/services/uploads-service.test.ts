import { describe, expect, it, vi } from "vitest";
import { createUploadsService } from "../../workers/api/services/uploads-service";
import { ValidationError } from "../../workers/api/services/errors";

function fakeBucket() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ body: "stream" }),
    delete: vi.fn(),
  };
}

function makeService() {
  const bucket = fakeBucket();
  const service = createUploadsService({ bucket: bucket as never });
  return { service, bucket };
}

const png = (size = 1000) => ({
  filename: "shot.PNG",
  contentType: "image/png",
  size,
  body: new ArrayBuffer(8),
});

describe("uploads service", () => {
  it("stores under an org-prefixed key and returns only the key (no URL)", async () => {
    const { service, bucket } = makeService();
    const result = await service.put("org_test_1", png());

    expect(result.key.startsWith("org_test_1/")).toBe(true);
    expect(result.key.toLowerCase().endsWith(".png")).toBe(true);
    expect(result).not.toHaveProperty("url");
    expect(bucket.put).toHaveBeenCalledOnce();
  });

  it("reads an object within the caller's org prefix", async () => {
    const { service, bucket } = makeService();
    const obj = await service.get("org_test_1", "org_test_1/abc.png");
    expect(bucket.get).toHaveBeenCalledWith("org_test_1/abc.png");
    expect(obj).toEqual({ body: "stream" });
  });

  it("refuses to read a key outside the org prefix", async () => {
    const { service, bucket } = makeService();
    await expect(
      service.get("org_test_1", "org_other/secret.png"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it("rejects an unsupported content type", async () => {
    const { service } = makeService();
    await expect(
      service.put("org_test_1", { ...png(), contentType: "text/html" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a file over the size limit", async () => {
    const { service } = makeService();
    await expect(
      service.put("org_test_1", png(6 * 1024 * 1024)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to delete a key outside the org prefix", async () => {
    const { service, bucket } = makeService();
    await expect(
      service.delete("org_test_1", "org_other/secret.png"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(bucket.delete).not.toHaveBeenCalled();
  });
});
