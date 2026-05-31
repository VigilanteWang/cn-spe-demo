import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendError } from "./common/errors";
import { withErrorHandling } from "./common/errorResponse";
import {
  getDownloadManifestRequest,
  getDownloadProgressRequest,
} from "./downloadHandlers";

const authMocks = vi.hoisted(() => ({
  requireContainerManageRequest: vi.fn(),
}));

const downloadMocks = vi.hoisted(() => ({
  getJobProgress: vi.fn(),
  getJobManifest: vi.fn(),
  startDownloadJob: vi.fn(),
}));

vi.mock("./auth", () => authMocks);
vi.mock("./download", () => downloadMocks);

describe("downloadHandlers error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.requireContainerManageRequest.mockResolvedValue({
      token: "user-token",
      claims: { oid: "user-oid" },
    });
  });

  it("should return notFound when archive progress does not exist", async () => {
    downloadMocks.getJobProgress.mockImplementation(() => {
      throw new BackendError({
        name: "ArchiveJobNotFoundError",
        code: "notFound",
        category: "business",
        source: "backend",
        message: "Job not found, expired, or access denied.",
        statusCode: 404,
      });
    });

    const req = { params: { jobId: "job-1" } } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(getDownloadProgressRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(404, {
      error: {
        code: "notFound",
        message: "Job not found, expired, or access denied.",
        statusCode: 404,
        category: "business",
        source: "backend",
        details: undefined,
        context: undefined,
        requestId: undefined,
        originError: undefined,
      },
    });
  });

  it("should return conflict when archive manifest is not ready", async () => {
    downloadMocks.getJobManifest.mockImplementation(() => {
      throw new BackendError({
        name: "ArchiveManifestNotReadyError",
        code: "conflict",
        category: "business",
        source: "backend",
        message: "Archive manifest not ready yet. Status: preparing",
        statusCode: 409,
      });
    });

    const req = { params: { jobId: "job-2" } } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(getDownloadManifestRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(409, {
      error: {
        code: "conflict",
        message: "Archive manifest not ready yet. Status: preparing",
        statusCode: 409,
        category: "business",
        source: "backend",
        details: undefined,
        context: undefined,
        requestId: undefined,
        originError: undefined,
      },
    });
  });

  it("should return invalidRequest when jobId route parameter is missing", async () => {
    const req = { params: {} } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(getDownloadProgressRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(400, {
      error: {
        code: "invalidRequest",
        message: "jobId route parameter is required.",
        statusCode: 400,
        category: "validation",
        source: "backend",
        details: undefined,
        context: undefined,
        requestId: undefined,
        originError: undefined,
      },
    });
  });
});
