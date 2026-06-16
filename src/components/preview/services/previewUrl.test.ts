// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { IDriveItemExtended } from "../../../common/types";
import {
  appendNoBannerParam,
  openInIsolatedTab,
  resolveOpenInNewTabUrl,
  resolvePreviewFallbackUrl,
  resolvePreviewRequestTarget,
} from "./previewUrl";

const createFile = (
  overrides: Partial<IDriveItemExtended> = {},
): IDriveItemExtended =>
  ({
    id: "file-1",
    name: "Quarterly Report.pdf",
    isFolder: false,
    modifiedByName: "Adele Vance",
    iconElement: {} as JSX.Element,
    webUrl: "https://contoso.sharepoint.com/report.pdf",
    downloadUrl: "https://download.contoso.com/report.pdf",
    parentReference: {
      driveId: "drive-from-parent",
    },
    ...overrides,
  }) as IDriveItemExtended;

describe("previewUrl services", () => {
  it("should append nb=true to preview URLs with or without query params", () => {
    expect(appendNoBannerParam("https://contoso.com/preview")).toBe(
      "https://contoso.com/preview?nb=true",
    );
    expect(appendNoBannerParam("https://contoso.com/preview?foo=bar")).toBe(
      "https://contoso.com/preview?foo=bar&nb=true",
    );
  });

  it("should prefer the explicit containerId when resolving preview request targets", () => {
    expect(
      resolvePreviewRequestTarget(createFile(), "drive-from-container"),
    ).toEqual({
      driveId: "drive-from-container",
      fileId: "file-1",
    });
  });

  it("should fall back to the file webUrl when preview API is unavailable", () => {
    expect(resolvePreviewFallbackUrl(createFile())).toBe(
      "https://contoso.sharepoint.com/report.pdf?nb=true",
    );
    expect(
      resolvePreviewFallbackUrl(createFile({ webUrl: undefined })),
    ).toBeNull();
  });

  it("should choose the correct new-tab target for Office and non-Office files", () => {
    expect(
      resolveOpenInNewTabUrl(
        createFile({
          name: "Budget.xlsx",
          webUrl: "https://contoso.sharepoint.com/budget.xlsx",
        }),
        "https://preview.contoso.com/budget",
      ),
    ).toBe("https://contoso.sharepoint.com/budget.xlsx");

    expect(
      resolveOpenInNewTabUrl(
        createFile({
          name: "Screenshot.png",
          webUrl: undefined,
        }),
        "https://preview.contoso.com/screenshot",
      ),
    ).toBe("https://preview.contoso.com/screenshot");
  });

  it("should open new tabs with opener isolation", () => {
    const openedWindow = { opener: {} as Window | null };
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {
      return openedWindow as unknown as Window;
    });

    openInIsolatedTab("https://contoso.com/preview");

    expect(openSpy).toHaveBeenCalledWith(
      "https://contoso.com/preview",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openedWindow.opener).toBeNull();

    openSpy.mockRestore();
  });
});
