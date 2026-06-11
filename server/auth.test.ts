import { beforeEach, describe, expect, it, vi } from "vitest";

const msalMocks = vi.hoisted(() => ({
  acquireTokenOnBehalfOf: vi.fn(),
}));

vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: class {
    acquireTokenOnBehalfOf = msalMocks.acquireTokenOnBehalfOf;
  },
  LogLevel: {
    Warning: 3,
  },
}));

vi.mock("jwks-rsa", () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn(),
  })),
}));

vi.mock("./config", () => ({
  serverConfig: {
    clientId: "client-id",
    clientSecret: "client-secret",
    authority: "https://login.microsoftonline.com/tenant-id",
    graphBaseUrl: "https://graph.microsoft.com",
    tenantId: "tenant-id",
    cloudEnv: "global",
  },
}));

import { getGraphOBOToken } from "./auth";

describe("getGraphOBOToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should map MSAL OBO failures to AppError instead of GraphError", async () => {
    msalMocks.acquireTokenOnBehalfOf.mockRejectedValue(
      new Error("msal token boom"),
    );

    await expect(getGraphOBOToken("user-token")).rejects.toMatchObject({
      name: "InternalError",
      message: "Unable to generate Microsoft Graph OBO token.",
      statusCode: 502,
      originError: {
        source: "app",
        cause: expect.objectContaining({
          name: "Error",
          message: "msal token boom",
        }),
      },
    });
  });
});
