import { describe, expect, it } from "vitest";
import type { IItemPermissionEntry } from "../models/itemPermissionModels";
import {
  computeItemPermissionChanges,
  ItemPermissionValidationError,
} from "./itemPermissionDiff";

const createPermissionEntry = (
  overrides: Partial<IItemPermissionEntry>,
): IItemPermissionEntry => ({
  id: "people:user-adele-vance",
  permissionId: "perm-adele",
  principalId: "user-adele-vance",
  principalObjectId: "user-adele-vance",
  principalUserPrincipalName: "adele.vance@contoso.com",
  principalMail: "adele.vance@contoso.com",
  principalName: "Adele Vance",
  principalType: "people",
  description: "adele.vance@contoso.com",
  isInherited: false,
  isEditable: true,
  isRemovable: true,
  role: "Writer",
  ...overrides,
});

describe("computeItemPermissionChanges", () => {
  it("should split draft changes into create, update and remove buckets", () => {
    const originalEntriesByTab = {
      people: [createPermissionEntry({ role: "Writer" })],
      groups: [
        createPermissionEntry({
          id: "permission:perm-group-existing",
          permissionId: "perm-group-existing",
          principalId: "group-project-owners",
          principalObjectId: "group-project-owners",
          principalName: "Project Owners",
          principalType: "groups",
          description: "project.owners@contoso.com",
          role: "Reader",
        }),
      ],
    };

    const draftEntriesByTab = {
      people: [
        createPermissionEntry({ role: "Reader" }),
        createPermissionEntry({
          id: "people:user-megan-bowen",
          permissionId: undefined,
          principalId: "user-megan-bowen",
          principalObjectId: "user-megan-bowen",
          principalUserPrincipalName: "megan.bowen@contoso.com",
          principalMail: "megan.bowen@contoso.com",
          principalName: "Megan Bowen",
          description: "megan.bowen@contoso.com",
          role: "Reader",
        }),
      ],
      groups: [
        createPermissionEntry({
          id: "groups:group-sales",
          permissionId: undefined,
          principalId: "group-sales",
          principalObjectId: "group-sales",
          principalName: "Sales and Marketing Members",
          principalType: "groups",
          principalMail: "SalesandMarketing@3ctsr2.onmicrosoft.com",
          description: "SalesandMarketing@3ctsr2.onmicrosoft.com",
          role: "Writer",
        }),
      ],
    };

    expect(
      computeItemPermissionChanges(originalEntriesByTab, draftEntriesByTab),
    ).toEqual({
      create: [
        {
          principalType: "people",
          principalId: "user-megan-bowen",
          recipientObjectId: "user-megan-bowen",
          recipientEmail: "megan.bowen@contoso.com",
          role: "Reader",
        },
        {
          principalType: "groups",
          principalId: "group-sales",
          recipientObjectId: "group-sales",
          recipientEmail: "SalesandMarketing@3ctsr2.onmicrosoft.com",
          role: "Writer",
        },
      ],
      update: [
        {
          permissionId: "perm-adele",
          principalType: "people",
          principalId: "user-adele-vance",
          recipientObjectId: "user-adele-vance",
          recipientEmail: "adele.vance@contoso.com",
          role: "Reader",
        },
      ],
      remove: [
        {
          permissionId: "perm-group-existing",
        },
      ],
    });
  });

  it("should reject update and remove attempts for inherited rows", () => {
    const inheritedEntry = createPermissionEntry({
      id: "permission:perm-inherited",
      permissionId: "perm-inherited",
      isInherited: true,
      isEditable: false,
      isRemovable: false,
    });

    expect(() =>
      computeItemPermissionChanges(
        {
          people: [inheritedEntry],
          groups: [],
        },
        {
          people: [{ ...inheritedEntry, role: "Reader" }],
          groups: [],
        },
      ),
    ).toThrowError(ItemPermissionValidationError);

    expect(() =>
      computeItemPermissionChanges(
        {
          people: [inheritedEntry],
          groups: [],
        },
        {
          people: [],
          groups: [],
        },
      ),
    ).toThrow("readonly");
  });
});
