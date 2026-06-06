import { AppError } from "../../../../common/appError";
import type {
  IContainerPermissionChangeSetFromUI,
  IContainerPermissionCreateChange,
  IContainerPermissionRemoveChange,
  IContainerPermissionUpdateChange,
} from "../../../../common/contracts/containerPermissionCommonContracts";
import type {
  IContainerPermissionEntry,
  IContainerPermissionEntriesByTab,
} from "../models/containerPermissionModels";

export { type IContainerPermissionChangeSetFromUI as IContainerPermissionChangeSet } from "../../../../common/contracts/containerPermissionCommonContracts";

/**
 * 构造容器权限草稿计算阶段的验证错误。
 *
 * 这类错误说明前端当前持有的权限快照不完整，
 * 应该阻止继续写回后端，并把上下文反馈给 UI。
 *
 * @param code 稳定错误码，用于区分不同校验问题。
 * @param message 面向界面和日志的错误说明。
 * @param entryId 出错的权限行 id。
 * @returns 统一的前端校验错误对象。
 */
export const buildContainerPermissionValidationError = (
  code: string,
  message: string,
  entryId: string,
): AppError =>
  new AppError({
    name: "ContainerPermissionValidationError",
    code,
    message,
    originError: {
      source: "validation",
    },
    cause: { entryId },
  });

interface IRequiredFieldErrorOptions {
  code: string;
  operation: string;
  fieldName: keyof IContainerPermissionEntry;
  entryId: string;
}

/**
 * 计算权限草稿相对初始快照的差异，以便一次性保存权限修改。
 */
export const computeContainerPermissionChanges = (
  originalEntriesByTab: IContainerPermissionEntriesByTab,
  draftEntriesByTab: IContainerPermissionEntriesByTab,
): IContainerPermissionChangeSetFromUI => {
  const create: IContainerPermissionCreateChange[] = [];
  const update: IContainerPermissionUpdateChange[] = [];
  const remove: IContainerPermissionRemoveChange[] = [];

  for (const tab of ["people", "groups"] as const) {
    const originalEntries = originalEntriesByTab[tab];
    const draftEntries = draftEntriesByTab[tab];
    // 同一个 principal 是否算同一条权限，统一用 entry.id 判断。
    const originalEntryById = new Map(
      originalEntries.map((entry) => [entry.id, entry] as const),
    );
    // 草稿侧也建立索引，便于快速判断新增、更新和删除。
    const draftEntryById = new Map(
      draftEntries.map((entry) => [entry.id, entry] as const),
    );

    // 先扫草稿：不存在于初始快照里的项，视为新增。
    for (const draftEntry of draftEntries) {
      const originalEntry = originalEntryById.get(draftEntry.id);

      if (!originalEntry) {
        create.push(createContainerPermissionChangeFromEntry(draftEntry));
        continue;
      }

      // 已存在的权限如果角色变了，就只发更新角色所需的 permissionId。
      if (originalEntry.role !== draftEntry.role) {
        update.push({
          permissionId: requireEntryField(originalEntry.permissionId, {
            code: "missingPermissionId",
            operation: "update current permission role",
            fieldName: "permissionId",
            entryId: originalEntry.id,
          }),
          role: draftEntry.role,
        });
      }
    }

    // 再扫初始快照：草稿里找不到的项，视为删除。
    for (const originalEntry of originalEntries) {
      if (!draftEntryById.has(originalEntry.id)) {
        remove.push({
          permissionId: requireEntryField(originalEntry.permissionId, {
            code: "missingPermissionId",
            operation: "delete a removed permission",
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

/**
 * 把草稿权限转换成 create 差异。
 */
const createContainerPermissionChangeFromEntry = (
  entry: IContainerPermissionEntry,
): IContainerPermissionCreateChange => {
  if (entry.principalType === "people") {
    // people 分支必须带 userPrincipalName，后端创建接口才能用。
    return {
      principalType: "people",
      principalId: entry.principalId,
      userPrincipalName: requireEntryField(entry.principalUserPrincipalName, {
        code: "missingUserPrincipalName",
        operation: "create people permission",
        fieldName: "principalUserPrincipalName",
        entryId: entry.id,
      }),
      role: entry.role,
    };
  }

  // groups 继续用稳定的 principalId 即可。
  return {
    principalType: "groups",
    principalId: entry.principalId,
    role: entry.role,
  };
};

/**
 * 读取权限条目中的必需字段。
 *
 * 缺失时统一抛出结构化验证错误，避免各字段各写一套重复逻辑。
 */
const requireEntryField = (
  value: string | undefined,
  requiredFieldErrorOptions: IRequiredFieldErrorOptions,
): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw buildContainerPermissionValidationError(
    requiredFieldErrorOptions.code,
    `Cannot ${requiredFieldErrorOptions.operation}: missing ${String(requiredFieldErrorOptions.fieldName)}`,
    requiredFieldErrorOptions.entryId,
  );
};
