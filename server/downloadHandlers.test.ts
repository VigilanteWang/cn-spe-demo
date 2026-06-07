import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../common/appError";
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
      throw new AppError({
        name: "ArchiveJobNotFoundError",
        code: "notFound",
        message: "Job not found, expired, or access denied.",
        statusCode: 404,
        originError: {
          source: "app",
        },
      });
    });

    const req = { params: { jobId: "job-1" } } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(getDownloadProgressRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(404, {
      error: {
        name: "ArchiveJobNotFoundError",
        code: "notFound",
        message: "Job not found, expired, or access denied.",
        statusCode: 404,
        originError: {
          source: "app",
          cause: undefined,
        },
        details: undefined,
      },
    });
  });

  it("should return conflict when archive manifest is not ready", async () => {
    downloadMocks.getJobManifest.mockImplementation(() => {
      throw new AppError({
        name: "ArchiveManifestNotReadyError",
        code: "conflict",
        message: "Archive manifest not ready yet. Status: preparing",
        statusCode: 409,
        originError: {
          source: "app",
        },
      });
    });

    const req = { params: { jobId: "job-2" } } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(getDownloadManifestRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(409, {
      error: {
        name: "ArchiveManifestNotReadyError",
        code: "conflict",
        message: "Archive manifest not ready yet. Status: preparing",
        statusCode: 409,
        originError: {
          source: "app",
          cause: undefined,
        },
        details: undefined,
      },
    });
  });

  it("should return invalidRequest when jobId route parameter is missing", async () => {
    const req = { params: {} } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(getDownloadProgressRequest)(req, res);

    expect(res.send).toHaveBeenCalledWith(400, {
      error: {
        name: "ValidationError",
        code: "invalidRequest",
        message: "jobId route parameter is required.",
        statusCode: 400,
        originError: {
          source: "validation",
          cause: undefined,
        },
        details: undefined,
      },
    });
  });
});
