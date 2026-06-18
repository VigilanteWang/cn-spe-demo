import { describe, expect, it, vi } from "vitest";
import type {
  Client,
  GraphRequest,
} from "@microsoft/microsoft-graph-client";
import {
  applyContainerPermissionChangeSet,
  fetchMapContainerPermissionFromGraphToEntries,
} from "./containerPermissionsHandlers";
import { mapGraphPermissionToEntryOnUI } from "./containerPermissionsCommonAdapters";
import { mapUiContainerPermissionRoleToGraph } from "./containerPermissionRoleMapper";

vi.mock("../auth", () => ({
  createGraphClient: vi.fn(),
  getGraphOBOToken: vi.fn(),
  requireContainerManageRequest: vi.fn(),
}));

vi.mock("./containerPermissionsCommonAdapters", async () => {
  const actual = await vi.importActual<
    typeof import("./containerPermissionsCommonAdapters")
  >("./containerPermissionsCommonAdapters");

  return {
    ...actual,
    mapGraphPermissionToEntryOnUI: vi.fn(actual.mapGraphPermissionToEntryOnUI),
  };
});

vi.mock("./containerPermissionRoleMapper", async () => {
  const actual = await vi.importActual<
    typeof import("./containerPermissionRoleMapper")
  >("./containerPermissionRoleMapper");

  return {
    ...actual,
    mapUiContainerPermissionRoleToGraph: vi.fn(
      actual.mapUiContainerPermissionRoleToGraph,
    ),
  };
});

describe("containerPermissionsHandlers GraphError boundary", () => {
  it("should keep local entry mapping failures out of GraphError", async () => {
    const graphClient = createMockGraphClient({
      "/storage/fileStorage/containers/container-1/permissions": {
        value: [
          {
            id: "perm-1",
            roles: ["read"],
          },
        ],
      },
    });

    vi.mocked(mapGraphPermissionToEntryOnUI).mockImplementationOnce(() => {
      throw new Error("local container mapping failed");
    });

    await expect(
      fetchMapContainerPermissionFromGraphToEntries(graphClient, "container-1"),
    ).rejects.toMatchObject({
      name: "Error",
      message: "local container mapping failed",
    });
  });

  it("should keep local role mapping failures out of GraphError", async () => {
    const graphClient = createMockGraphClient({});

    vi.mocked(mapUiContainerPermissionRoleToGraph).mockImplementationOnce(() => {
      throw new Error("local container role mapping failed");
    });

    await expect(
      applyContainerPermissionChangeSet(graphClient, "container-1", {
        create: [],
        remove: [],
        update: [
          {
            permissionId: "perm-1",
            role: "write",
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: "Error",
      message: "local container role mapping failed",
    });
  });
});

type IGraphClient = Client;
type IGraphRequest = GraphRequest;

const createMockGraphClient = (
  responsesByPath: Record<string, unknown>,
): IGraphClient => ({
  api: (path: string): IGraphRequest => {
    const request: IGraphRequest = {
      version: () => request,
      header: () => request,
      get: async () => {
        if (!(path in responsesByPath)) {
          throw new Error(`Missing mock response for path: ${path}`);
        }

        return responsesByPath[path];
      },
      post: async () => undefined,
      patch: async () => undefined,
      delete: async () => undefined,
    };

    return request;
  },
});
