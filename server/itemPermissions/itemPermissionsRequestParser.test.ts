import { describe, expect, it } from "vitest";
import { parseItemPermissionChangeSet } from "./itemPermissionsRequestParser";

describe("parseItemPermissionChangeSet", () => {
  it("should parse create, update and remove arrays", () => {
    const parsed = parseItemPermissionChangeSet({
      create: [
        {
          principalType: "groups",
          principalId: "group-1",
          recipientObjectId: "group-1",
          role: "Reader",
        },
      ],
      update: [
        {
          permissionId: "perm-1",
          principalType: "people",
          principalId: "user-1",
          recipientEmail: "adele@contoso.com",
          role: "Writer",
        },
      ],
      remove: [{ permissionId: "perm-2" }],
    });

    expect(parsed).toEqual({
      create: [
        {
          principalType: "groups",
          principalId: "group-1",
          recipientObjectId: "group-1",
          role: "Reader",
        },
      ],
      update: [
        {
          permissionId: "perm-1",
          principalType: "people",
          principalId: "user-1",
          recipientEmail: "adele@contoso.com",
          role: "Writer",
        },
      ],
      remove: [{ permissionId: "perm-2" }],
    });
  });

  it("should keep compatibility with the legacy delete field", () => {
    const parsed = parseItemPermissionChangeSet({
      create: [],
      update: [],
      delete: [{ permissionId: "perm-legacy" }],
    });

    expect(parsed?.remove).toEqual([{ permissionId: "perm-legacy" }]);
  });

  it("should require at least one recipient identifier for create and update", () => {
    expect(() =>
      parseItemPermissionChangeSet({
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
    ).toThrow("requires at least one recipient identifier");

    expect(() =>
      parseItemPermissionChangeSet({
        create: [],
        update: [
          {
            permissionId: "perm-1",
            principalType: "groups",
            principalId: "group-1",
            role: "Writer",
          },
        ],
        remove: [],
      }),
    ).toThrow("requires at least one recipient identifier");
  });

  it("should throw when role or principal type are unsupported", () => {
    expect(() =>
      parseItemPermissionChangeSet({
        create: [],
        update: [
          {
            permissionId: "perm-1",
            principalType: "people",
            principalId: "user-1",
            recipientEmail: "adele@contoso.com",
            role: "Owner",
          },
        ],
        remove: [],
      }),
    ).toThrow("Unsupported item permission UI role");

    expect(() =>
      parseItemPermissionChangeSet({
        create: [{ principalType: "teams", principalId: "x", role: "Reader" }],
        update: [],
        remove: [],
      }),
    ).toThrow("Unsupported permission principal type");
  });
});
