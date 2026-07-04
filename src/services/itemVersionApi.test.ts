import { describe, expect, it, vi } from "vitest";
import {
  deleteItemHistoryVersions,
  deleteItemVersion,
  getCurrentItemVersion,
  getItemVersionDownload,
  listItemVersions,
  restoreItemVersion,
} from "./itemVersionApi";
import { sendAuthorizedRequest } from "./apiClient";

vi.mock("./apiClient", () => ({
  sendAuthorizedRequest: vi.fn(),
}));

const sendAuthorizedRequestMock = vi.mocked(sendAuthorizedRequest);

describe("itemVersionApi", () => {
  it("should call list route and return entries", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entries: [
            {
              id: "2.0",
              lastModifiedDateTime: "2026-07-01T10:00:00Z",
              lastModifiedByDisplayName: "Adele Vance",
              size: 128,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      listItemVersions("drive A", "item/1"),
    ).resolves.toMatchObject([
      {
        id: "2.0",
        lastModifiedByDisplayName: "Adele Vance",
      },
    ]);

    expect(sendAuthorizedRequestMock).toHaveBeenCalledWith(
      "/api/itemVersions/drive%20A/item%2F1",
      { method: "GET" },
    );
  });

  it("should call current route and return the current entry", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entry: {
            id: "3.0",
            lastModifiedDateTime: "2026-07-02T10:00:00Z",
            lastModifiedByDisplayName: "Megan Bowen",
            size: 256,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      getCurrentItemVersion("drive-1", "item-1"),
    ).resolves.toMatchObject({
      id: "3.0",
    });

    expect(sendAuthorizedRequestMock).toHaveBeenCalledWith(
      "/api/itemVersions/drive-1/item-1/current",
      { method: "GET" },
    );
  });

  it("should call download route and return the download url", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          downloadUrl: "https://download.contoso.com/versions/2.0",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      getItemVersionDownload("drive-1", "item-1", "2.0"),
    ).resolves.toBe("https://download.contoso.com/versions/2.0");

    expect(sendAuthorizedRequestMock).toHaveBeenCalledWith(
      "/api/itemVersions/drive-1/item-1/2.0/download",
      { method: "GET" },
    );
  });

  it("should preserve structured backend errors when restore fails", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            name: "GraphError",
            code: "conflict",
            message: "Version restore conflicted.",
            statusCode: 409,
            originError: {
              source: "microsoft-graph",
            },
          },
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      restoreItemVersion("drive-1", "item-1", "2.0"),
    ).rejects.toMatchObject({
      name: "GraphError",
      code: "conflict",
      message: "Version restore conflicted.",
      statusCode: 409,
    });
  });

  it("should call delete route for a single version", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteItemVersion("drive-1", "item-1", "2.0");

    expect(sendAuthorizedRequestMock).toHaveBeenCalledWith(
      "/api/itemVersions/drive-1/item-1/2.0",
      { method: "DELETE" },
    );
  });

  it("should call delete history route", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteItemHistoryVersions("drive-1", "item-1");

    expect(sendAuthorizedRequestMock).toHaveBeenCalledWith(
      "/api/itemVersions/drive-1/item-1/history",
      { method: "DELETE" },
    );
  });
});
