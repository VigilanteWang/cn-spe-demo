// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrontendApiError } from "../../../common/errors.ts";
import { PreviewContent } from "./PreviewContent";

describe("PreviewContent", () => {
  it("should format standardized preview errors before rendering them", () => {
    const throttledError = Object.assign(
      new FrontendApiError("throttled", "Preview request throttled.", {
        details: {
          retryAfterSeconds: 12,
        },
      }),
      {
        retryAfterSeconds: 12,
      },
    );

    render(
      <PreviewContent
        fileName="Quarterly Report.pdf"
        previewUrl=""
        isLoading={false}
        error={throttledError}
      />,
    );

    expect(
      screen.getByText("Preview request throttled. Retry after 12 seconds."),
    ).toBeInTheDocument();
  });
});
