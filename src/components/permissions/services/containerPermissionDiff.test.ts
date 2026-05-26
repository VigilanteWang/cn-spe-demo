import { describe, expect, it } from "vitest";
import type { IContainerPermissionEntry } from "../models/containerPermissionModels";
import { computeContainerPermissionChanges } from "./containerPermissionDiff";

const createPermissionEntry = (
  overrides: Partial<IContainerPermissionEntry>,
): IContainerPermissionEntry => ({
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

describe("computeContainerPermissionChanges", () => {
  it("should split draft changes into create, update and delete buckets", () => {
    const originalEntriesByTab = {
      people: [createPermissionEntry({ role: "Writer" })],
      groups: [
        createPermissionEntry({
          id: "permission:perm-group-existing",
          permissionId: "perm-group-existing",
          principalId: "group-project-owners",
          principalName: "Project Owners",
          principalType: "groups",
          description: "project.owners@contoso.com",
          role: "Manager",
        }),
      ],
    };

    const draftEntriesByTab = {
      people: [
        createPermissionEntry({ role: "Owner" }),
        createPermissionEntry({
          id: "people:user-megan-bowen",
          permissionId: undefined,
          principalId: "user-megan-bowen",
          principalUserPrincipalName: "megan.bowen@contoso.com",
          principalName: "Megan Bowen",
          description: "megan.bowen@contoso.com",
          role: "Reader",
        }),
      ],
      groups: [
        createPermissionEntry({
          id: "groups:1afaddfa-d1d9-4c2b-9a5d-e0ff98053278",
          permissionId: undefined,
          principalId: "1afaddfa-d1d9-4c2b-9a5d-e0ff98053278",
          principalName: "Sales and Marketing Members",
          principalType: "groups",
          description: "SalesandMarketing@3ctsr2.onmicrosoft.com",
          role: "Writer",
        }),
      ],
    };

    expect(
      computeContainerPermissionChanges(
        originalEntriesByTab,
        draftEntriesByTab,
      ),
    ).toEqual({
      create: [
        {
          principalType: "people",
          principalId: "user-megan-bowen",
          userPrincipalName: "megan.bowen@contoso.com",
          role: "Reader",
        },
        {
          principalType: "groups",
          principalId: "1afaddfa-d1d9-4c2b-9a5d-e0ff98053278",
          role: "Writer",
        },
      ],
      update: [
        {
          permissionId: "perm-adele",
          role: "Owner",
        },
      ],
      remove: [
        {
          permissionId: "perm-group-existing",
        },
      ],
    });
  });
});
