import {
  ContainerPermissionRole,
  IContainerPermissionEntry,
  PermissionEntriesByTab,
} from "../models/permissionModels";

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
 * 计算权限草稿相对初始快照的差异。
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
          permissionId: requirePermissionId(
            originalEntry,
            "update current permission role",
          ),
          role: draftEntry.role,
        });
      }
    }

    // 再扫初始快照：草稿里找不到的项，视为删除。
    for (const originalEntry of originalEntries) {
      if (!draftEntryById.has(originalEntry.id)) {
        remove.push({
          permissionId: requirePermissionId(
            originalEntry,
            "delete a removed permission",
          ),
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
 * 读取更新和删除所需的 permissionId。
 *
 * 缺失时直接抛错，避免把不完整的权限快照写回后端。
 */
const requirePermissionId = (
  entry: IContainerPermissionEntry,
  operation: string,
): string => {
  if (entry.permissionId) {
    return entry.permissionId;
  }

  throw new Error(
    `Cannot ${operation} because permissionId is missing for ${entry.id}.`,
  );
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
      userPrincipalName: requireUserPrincipalName(entry),
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
 * 读取 people 创建所需的 userPrincipalName。
 */
const requireUserPrincipalName = (entry: IContainerPermissionEntry): string => {
  if (entry.principalUserPrincipalName) {
    return entry.principalUserPrincipalName;
  }

  throw new Error(
    `Cannot create people permission for ${entry.id} because userPrincipalName is missing.`,
  );
};
