// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../common/errors.ts";
import { PreviewContent } from "./PreviewContent";

describe("PreviewContent", () => {
  it("should format standardized preview errors before rendering them", () => {
    const throttledError = new AppError({
      name: "AppError",
      code: "throttled",
      message: "Preview request throttled.",
      originError: {
        retryAfter: 12,
      },
    });

    render(
      <PreviewContent
        fileName="Quarterly Report.pdf"
        previewUrl=""
        isLoading={false}
        error={throttledError}
      />,
    );

    expect(
      screen.getByText("AppError: Preview request throttled."),
    ).toBeInTheDocument();
  });
});
