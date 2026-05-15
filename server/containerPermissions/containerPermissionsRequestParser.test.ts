import { describe, expect, it } from "vitest";
import { parseContainerPermissionChangeSet } from "./containerPermissionsRequestParser";

describe("parseContainerPermissionChangeSet", () => {
  it("should parse remove arrays", () => {
    const parsed = parseContainerPermissionChangeSet({
      create: [],
      update: [],
      remove: [{ permissionId: "perm-1" }],
    });

    expect(parsed).toEqual({
      create: [],
      update: [],
      remove: [{ permissionId: "perm-1" }],
    });
  });

  it("should keep compatibility with the legacy delete field", () => {
    const parsed = parseContainerPermissionChangeSet({
      create: [],
      update: [],
      delete: [{ permissionId: "perm-legacy" }],
    });

    expect(parsed?.remove).toEqual([{ permissionId: "perm-legacy" }]);
  });

  it("should throw when people create changes miss userPrincipalName", () => {
    expect(() =>
      parseContainerPermissionChangeSet({
        create: [
          {
            principalType: "people",
            principalId: "user-1",
            role: "Reader",
          },
        ],
        update: [],
        remove: [],
      }),
    ).toThrow("Missing required create userPrincipalName.");
  });

  it("should throw when role or principal type are unsupported", () => {
    expect(() =>
      parseContainerPermissionChangeSet({
        create: [],
        update: [{ permissionId: "perm-1", role: "Admin" }],
        remove: [],
      }),
    ).toThrow("Unsupported container permission UI role");

    expect(() =>
      parseContainerPermissionChangeSet({
        create: [{ principalType: "teams", principalId: "x", role: "Reader" }],
        update: [],
        remove: [],
      }),
    ).toThrow("Unsupported permission principal type");
  });
});
