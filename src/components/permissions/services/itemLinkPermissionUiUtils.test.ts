import { describe, expect, it } from "vitest";
import { createItemLinkPermissionChangeSet } from "./itemLinkPermissionUiUtils";

describe("createItemLinkPermissionChangeSet", () => {
  it("should omit recipients for non-specific created links", () => {
    const changeSet = createItemLinkPermissionChangeSet([], {
      createdLinks: [
        {
          id: "draft-org-1",
          scope: "organization",
          type: "edit",
          recipients: [],
        },
      ],
      deletedPermissionIds: [],
      grantsByPermissionId: {},
      revokesByPermissionId: {},
    });

    expect(changeSet).toEqual({
      create: [
        {
          scope: "organization",
          type: "edit",
        },
      ],
      deleteLinks: [],
      grantRecipients: [],
      revokeRecipients: [],
    });
  });

  it("should keep recipients for specific created links", () => {
    const changeSet = createItemLinkPermissionChangeSet([], {
      createdLinks: [
        {
          id: "draft-specific-1",
          scope: "specific",
          type: "review",
          recipients: [
            {
              id: "candidate-1",
              objectId: "user-1",
              name: "Adele Vance",
              type: "users",
              secondaryText: "adele@contoso.com",
              initials: "AV",
              mail: "adele@contoso.com",
              userPrincipalName: "adele@contoso.com",
            },
          ],
        },
      ],
      deletedPermissionIds: [],
      grantsByPermissionId: {},
      revokesByPermissionId: {},
    });

    expect(changeSet).toEqual({
      create: [
        {
          scope: "specific",
          type: "review",
          recipients: [
            {
              recipientObjectId: "user-1",
              recipientEmail: "adele@contoso.com",
              recipientAlias: "adele@contoso.com",
            },
          ],
        },
      ],
      deleteLinks: [],
      grantRecipients: [],
      revokeRecipients: [],
    });
  });
});
