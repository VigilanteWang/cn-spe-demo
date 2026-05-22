import { FrontendValidationError } from "../../../common/errors.ts";
import type {
  IItemPermissionChangeSetFromUI,
  IItemPermissionCreateChange,
  IItemPermissionRemoveChange,
  IItemPermissionUpdateChange,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type {
  IItemPermissionEntry,
  IItemPermissionEntriesByTab,
} from "../models/itemPermissionModels";

export { type IItemPermissionChangeSetFromUI as IItemPermissionChangeSet } from "../../../../common/contracts/itemPermissionCommonContracts";

/**
 * item 权限草稿计算阶段的验证错误。
 */
export class ItemPermissionValidationError extends FrontendValidationError {
  constructor(code: string, message: string, entryId: string) {
    super(code, message, {
      name: "ItemPermissionValidationError",
      details: { entryId },
    });
  }
}

interface IRequiredFieldErrorOptions {
  code: string;
  operation: string;
  fieldName:
    | "permissionId"
    | "recipientObjectId"
    | "recipientEmail"
    | "recipientAlias";
  entryId: string;
}

/**
 * 计算 item 权限草稿相对初始快照的差异。
 *
 * 这里会显式阻止 inherited / 只读行进入 update/remove，
 * 避免 UI 一旦误操作就把本不该写回的继承权限提交给后端。
 */
export const computeItemPermissionChanges = (
  originalEntriesByTab: IItemPermissionEntriesByTab,
  draftEntriesByTab: IItemPermissionEntriesByTab,
): IItemPermissionChangeSetFromUI => {
  const create: IItemPermissionCreateChange[] = [];
  const update: IItemPermissionUpdateChange[] = [];
  const remove: IItemPermissionRemoveChange[] = [];

  for (const tab of ["people", "groups"] as const) {
    const originalEntries = originalEntriesByTab[tab];
    const draftEntries = draftEntriesByTab[tab];
    const originalEntryById = new Map(
      originalEntries.map((entry) => [entry.id, entry] as const),
    );
    const draftEntryById = new Map(
      draftEntries.map((entry) => [entry.id, entry] as const),
    );

    for (const draftEntry of draftEntries) {
      const originalEntry = originalEntryById.get(draftEntry.id);

      if (!originalEntry) {
        create.push(createItemPermissionChangeFromEntry(draftEntry));
        continue;
      }

      if (originalEntry.role !== draftEntry.role) {
        ensureEntryIsEditable(originalEntry, "update inherited or readonly item permission");
        update.push({
          permissionId: requireEntryField(originalEntry.permissionId, {
            code: "missingPermissionId",
            operation: "update current item permission role",
            fieldName: "permissionId",
            entryId: originalEntry.id,
          }),
          principalType: originalEntry.principalType,
          principalId: originalEntry.principalId,
          ...readRecipientFromEntry(originalEntry),
          role: draftEntry.role,
        });
      }
    }

    for (const originalEntry of originalEntries) {
      if (!draftEntryById.has(originalEntry.id)) {
        ensureEntryIsRemovable(originalEntry, "remove inherited or readonly item permission");
        remove.push({
          permissionId: requireEntryField(originalEntry.permissionId, {
            code: "missingPermissionId",
            operation: "delete a removed item permission",
            fieldName: "permissionId",
            entryId: originalEntry.id,
          }),
        });
      }
    }
  }

  return {
    create,
    update,
    remove,
  };
};

const createItemPermissionChangeFromEntry = (
  entry: IItemPermissionEntry,
): IItemPermissionCreateChange => ({
  principalType: entry.principalType,
  principalId: entry.principalId,
  ...readRecipientFromEntry(entry),
  role: entry.role,
});

/**
 * item invite 的 recipient 优先级与 Step 0 结论保持一致：
 * objectId -> email/UPN -> alias。
 *
 * 当前共享候选模型还没有正式引入 alias，
 * 所以这里只会先产出 objectId / email。
 */
const readRecipientFromEntry = (
  entry: IItemPermissionEntry,
): {
  recipientObjectId?: string;
  recipientEmail?: string;
  recipientAlias?: string;
} => {
  const recipientObjectId = entry.principalObjectId;
  const recipientEmail = entry.principalMail ?? entry.principalUserPrincipalName;

  if (!recipientObjectId && !recipientEmail) {
    throw new ItemPermissionValidationError(
      "missingRecipient",
      "Cannot create or recreate item permission: missing recipientObjectId and recipientEmail.",
      entry.id,
    );
  }

  return {
    recipientObjectId,
    recipientEmail,
  };
};

const ensureEntryIsEditable = (
  entry: IItemPermissionEntry,
  operation: string,
) => {
  if (entry.isInherited || !entry.isEditable) {
    throw new ItemPermissionValidationError(
      "readonlyPermission",
      `Cannot ${operation}: entry ${entry.id} is readonly.`,
      entry.id,
    );
  }
};

const ensureEntryIsRemovable = (
  entry: IItemPermissionEntry,
  operation: string,
) => {
  if (entry.isInherited || !entry.isRemovable) {
    throw new ItemPermissionValidationError(
      "readonlyPermission",
      `Cannot ${operation}: entry ${entry.id} is readonly.`,
      entry.id,
    );
  }
};

const requireEntryField = (
  value: string | undefined,
  requiredFieldErrorOptions: IRequiredFieldErrorOptions,
): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw new ItemPermissionValidationError(
    requiredFieldErrorOptions.code,
    `Cannot ${requiredFieldErrorOptions.operation}: missing ${requiredFieldErrorOptions.fieldName}.`,
    requiredFieldErrorOptions.entryId,
  );
};
