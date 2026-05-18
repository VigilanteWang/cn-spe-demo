import { beforeEach, describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "./common/errorResponse";
import {
  getDownloadArchiveManifestRequest,
  getDownloadArchiveProgressRequest,
} from "./downloadArchiveHandlers";

const authMocks = vi.hoisted(() => ({
  requireContainerManageRequest: vi.fn(),
}));

const downloadArchiveMocks = vi.hoisted(() => ({
  getJobProgress: vi.fn(),
  getJobManifest: vi.fn(),
  startDownloadJob: vi.fn(),
}));

vi.mock("./auth", () => authMocks);
vi.mock("./downloadArchive", () => downloadArchiveMocks);

describe("downloadArchiveHandlers error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.requireContainerManageRequest.mockResolvedValue({
      token: "user-token",
      claims: { oid: "user-oid" },
    });
  });

  it("should return notFound when archive progress does not exist", async () => {
    downloadArchiveMocks.getJobProgress.mockReturnValue(null);

    const req = { params: { jobId: "job-1" } } as never;
    const res = { send: vi.fn() } as never;

    await withErrorHandling(getDownloadArchiveProgressRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(404, {
      code: "notFound",
      message: "Job not found, expired, or access denied.",
      statusCode: 404,
      details: undefined,
      requestId: undefined,
      retryAfterSeconds: undefined,
    });
  });

  it("should return conflict when archive manifest is not ready", async () => {
    downloadArchiveMocks.getJobProgress.mockReturnValue({
      status: "preparing",
    });

    const req = { params: { jobId: "job-2" } } as never;
    const res = { send: vi.fn() } as never;

    await withErrorHandling(getDownloadArchiveManifestRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(409, {
      code: "conflict",
      message: "Archive manifest not ready yet. Status: preparing",
      statusCode: 409,
      details: undefined,
      requestId: undefined,
      retryAfterSeconds: undefined,
    });
  });
});
