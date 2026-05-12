import { FrontendValidationError } from "../../../common/errors.ts";
import {
  ContainerPermissionRole,
  IContainerPermissionEntry,
  PermissionEntriesByTab,
} from "../models/permissionModels";

/**
 * 容器权限草稿计算阶段的验证错误。
 *
 * 这类错误说明前端当前持有的权限快照不完整，
 * 应该阻止继续写回后端，并把上下文反馈给 UI。
 */
export class ContainerPermissionValidationError extends FrontendValidationError {
  constructor(code: string, message: string, entryId: string) {
    super(code, message, {
      name: "ContainerPermissionValidationError",
      details: { entryId },
    });
  }
}

interface IRequiredEntryFieldOptions {
  code: string;
  operation: string;
  fieldName: keyof IContainerPermissionEntry;
  entryId: string;
}

/**
 * 新增 people 权限时发给后端的差异项。
 *
 * Graph 的容器权限创建接口要求用户分支提供 userPrincipalName，
 * 因此这里在类型层直接收紧，不允许 people 分支遗漏该字段。
 */
export interface ICreatePeopleContainerPermissionChange {
  principalType: "people";
  principalId: string;
  userPrincipalName: string;
  role: ContainerPermissionRole;
}

/**
 * 新增 groups 权限时发给后端的差异项。
 *
 * 组分支继续使用稳定 group id。
 */
export interface ICreateGroupContainerPermissionChange {
  principalType: "groups";
  principalId: string;
  role: ContainerPermissionRole;
}

/**
 * 新增权限差异项。
 */
export type ICreateContainerPermissionChange =
  | ICreatePeopleContainerPermissionChange
  | ICreateGroupContainerPermissionChange;

/**
 * 更新权限角色的差异项。
 */
export interface IUpdateContainerPermissionChange {
  permissionId: string;
  role: ContainerPermissionRole;
}

/**
 * 删除权限的差异项。
 */
export interface IDeleteContainerPermissionChange {
  permissionId: string;
}

/**
 * 容器权限草稿和初始权限之间的完整差异集。
 */
export interface IContainerPermissionChangeSet {
  create: ICreateContainerPermissionChange[];
  update: IUpdateContainerPermissionChange[];
  remove: IDeleteContainerPermissionChange[];
}

/**
 * 计算权限草稿相对初始快照的差异，以便一次性保存权限的修改。
 */
export const computeContainerPermissionChanges = (
  originalEntriesByTab: PermissionEntriesByTab,
  draftEntriesByTab: PermissionEntriesByTab,
): IContainerPermissionChangeSet => {
  const create: ICreateContainerPermissionChange[] = [];
  const update: IUpdateContainerPermissionChange[] = [];
  const remove: IDeleteContainerPermissionChange[] = [];

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
): ICreateContainerPermissionChange => {
  if (entry.principalType === "people") {
    // people 分支必须带 userPrincipalName，后端创建接口才够用。
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
  options: IRequiredEntryFieldOptions,
): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw new ContainerPermissionValidationError(
    options.code,
    `Cannot ${options.operation}: missing ${String(options.fieldName)}`,
    options.entryId,
  );
};
