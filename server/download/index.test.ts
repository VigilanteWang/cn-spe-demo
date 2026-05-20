import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createGraphClient: vi.fn(),
  getGraphOBOToken: vi.fn(),
}));

vi.mock("../auth", () => authMocks);

type DownloadModule = typeof import("./index");

let getJobManifest: DownloadModule["getJobManifest"];
let getJobProgress: DownloadModule["getJobProgress"];
let startDownloadJob: DownloadModule["startDownloadJob"];

interface IMockGraphResponseMap {
  [path: string]:
    | unknown
    | (() => unknown)
    | {
        select?: unknown;
        default?: unknown;
      };
}

const createMockGraphClient = (responses: IMockGraphResponseMap) => ({
  api(path: string) {
    const pathResponse = responses[path];

    return {
      select() {
        return {
          get: async () => resolveMockResponse(pathResponse, "select"),
        };
      },
      get: async () => resolveMockResponse(pathResponse, "default"),
    };
  },
});

const resolveMockResponse = (
  response: IMockGraphResponseMap[string],
  mode: "select" | "default",
) => {
  if (
    typeof response === "object" &&
    response !== null &&
    ("select" in response || "default" in response)
  ) {
    const typedResponse = response as { select?: unknown; default?: unknown };
    return resolveLeafValue(typedResponse[mode]);
  }

  return resolveLeafValue(response);
};

const resolveLeafValue = (value: unknown) => {
  if (typeof value === "function") {
    return (value as () => unknown)();
  }

  return value;
};

const waitForJobStatus = async (
  jobId: string,
  expectedStatus: "ready" | "failed",
) => {
  await vi.waitFor(() => {
    expect(getJobProgress(jobId, "user-oid").status).toBe(expectedStatus);
  });
};

describe("download module", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();

    ({ getJobManifest, getJobProgress, startDownloadJob } = await import(
      "./index"
    ));
  });

  it("should fail the job when graph token acquisition fails", async () => {
    authMocks.getGraphOBOToken.mockRejectedValue(new Error("token boom"));

    const jobId = await startDownloadJob(
      "drive-1",
      ["item-1"],
      "user-token",
      "user-oid",
    );

    await waitForJobStatus(jobId, "failed");

    expect(getJobProgress(jobId, "user-oid").errors).toEqual([
      "Unable to prepare the archive.",
    ]);
  });

  it("should fail the job when expanding an item fails", async () => {
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
    authMocks.createGraphClient.mockReturnValue(
      createMockGraphClient({
        "/drives/drive-1/items/item-1": {
          select: () => {
            throw new Error("expand failed");
          },
        },
      }),
    );

    const jobId = await startDownloadJob(
      "drive-1",
      ["item-1"],
      "user-token",
      "user-oid",
    );

    await waitForJobStatus(jobId, "failed");

    expect(getJobProgress(jobId, "user-oid").errors).toEqual([
      "Unable to expand the selected items.",
    ]);
  });

  it("should fail the job when resolving a download url fails", async () => {
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
    authMocks.createGraphClient.mockReturnValue(
      createMockGraphClient({
        "/drives/drive-1/items/item-1": {
          select: {
            id: "item-1",
            name: "file-1.txt",
            size: 4,
            file: { mimeType: "text/plain" },
          },
          default: () => {
            throw new Error("resolve failed");
          },
        },
      }),
    );

    const jobId = await startDownloadJob(
      "drive-1",
      ["item-1"],
      "user-token",
      "user-oid",
    );

    await waitForJobStatus(jobId, "failed");

    expect(getJobProgress(jobId, "user-oid").errors).toEqual([
      "Unable to resolve the download url for item item-1.",
    ]);
  });

  it("should fail the job when no files are found", async () => {
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
    authMocks.createGraphClient.mockReturnValue(
      createMockGraphClient({
        "/drives/drive-1/items/folder-1": {
          select: {
            id: "folder-1",
            name: "folder-1",
            folder: { childCount: 0 },
          },
        },
        "/drives/drive-1/items/folder-1/children": {
          select: { value: [] },
        },
      }),
    );

    const jobId = await startDownloadJob(
      "drive-1",
      ["folder-1"],
      "user-token",
      "user-oid",
    );

    await waitForJobStatus(jobId, "failed");

    expect(getJobProgress(jobId, "user-oid").errors).toEqual([
      "No files found to archive.",
    ]);
  });

  it("should fail the job when file count exceeds the limit", async () => {
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
    authMocks.createGraphClient.mockReturnValue(
      createMockGraphClient({
        "/drives/drive-1/items/folder-1": {
          select: {
            id: "folder-1",
            name: "folder-1",
            folder: { childCount: 501 },
          },
        },
        "/drives/drive-1/items/folder-1/children": {
          select: {
            value: Array.from({ length: 501 }, (_, index) => ({
              id: `item-${index}`,
              name: `file-${index}.txt`,
              size: 1,
              file: { mimeType: "text/plain" },
            })),
          },
        },
      }),
    );

    const jobId = await startDownloadJob(
      "drive-1",
      ["folder-1"],
      "user-token",
      "user-oid",
    );

    await waitForJobStatus(jobId, "failed");

    expect(getJobProgress(jobId, "user-oid").errors).toEqual([
      "Too many files (501). Maximum is 500.",
    ]);
  });

  it("should fail the job when total size exceeds the limit", async () => {
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
    authMocks.createGraphClient.mockReturnValue(
      createMockGraphClient({
        "/drives/drive-1/items/item-1": {
          select: {
            id: "item-1",
            name: "large.bin",
            size: 500 * 1024 * 1024 + 1,
            file: { mimeType: "application/octet-stream" },
          },
        },
      }),
    );

    const jobId = await startDownloadJob(
      "drive-1",
      ["item-1"],
      "user-token",
      "user-oid",
    );

    await waitForJobStatus(jobId, "failed");

    expect(getJobProgress(jobId, "user-oid").errors).toEqual([
      "Archive would exceed the 500 MB size limit.",
    ]);
  });

  it("should build the manifest when every file is prepared successfully", async () => {
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
    authMocks.createGraphClient.mockReturnValue(
      createMockGraphClient({
        "/drives/drive-1/items/item-1": {
          select: {
            id: "item-1",
            name: "file-1.txt",
            size: 4,
            file: { mimeType: "text/plain" },
          },
          default: {
            "@microsoft.graph.downloadUrl": "https://download.example/file-1",
          },
        },
      }),
    );

    const jobId = await startDownloadJob(
      "drive-1",
      ["item-1"],
      "user-token",
      "user-oid",
    );

    await waitForJobStatus(jobId, "ready");

    expect(getJobManifest(jobId, "user-oid")).toMatchObject({
      jobId,
      totalFiles: 1,
      totalBytes: 4,
      items: [
        {
          itemId: "item-1",
          name: "file-1.txt",
          relativePath: "file-1.txt",
          size: 4,
          mimeType: "text/plain",
          downloadUrl: "https://download.example/file-1",
        },
      ],
    });
  });
});
