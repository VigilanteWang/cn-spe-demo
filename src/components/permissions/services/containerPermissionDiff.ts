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
  delete: IDeleteContainerPermissionChange[];
}

/**
 * 计算当前草稿相对初始权限的新增、更新、删除差异。
 *
 * 设计说明：
 * - “同一个 principal 是不是同一条权限”使用 `entry.id` 判断，
 *   因为它由 `principalType + principalId` 组成，能稳定区分 people/groups。
 * - 真正发给后端做更新 / 删除时，则一律使用 `permissionId`，
 *   避免靠展示字段位置或文本去找对应权限。
 * - 新增时则按 principalType 分成两条链路：
 *   people 需要 `userPrincipalName`，groups 继续使用 `principalId`。
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
    const originalEntryById = new Map(
      originalEntries.map((entry) => [entry.id, entry] as const),
    );
    const draftEntryById = new Map(
      draftEntries.map((entry) => [entry.id, entry] as const),
    );

    for (const draftEntry of draftEntries) {
      const originalEntry = originalEntryById.get(draftEntry.id);

      if (!originalEntry) {
        create.push(createContainerPermissionChangeFromEntry(draftEntry));
        continue;
      }

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
    delete: remove,
  };
};

/**
 * 更新和删除必须需要真实的 permissionId。
 *
 * 如果这里缺少，说明服务端权限快照没有被完整映射进本地模型，
 * 继续写回会导致后端无法精确定目标，因此直接抛错更安全。
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
 * 把一条新的本地草稿权限项转换成后端可直接消费的 create 差异。
 */
const createContainerPermissionChangeFromEntry = (
  entry: IContainerPermissionEntry,
): ICreateContainerPermissionChange => {
  if (entry.principalType === "people") {
    return {
      principalType: "people",
      principalId: entry.principalId,
      userPrincipalName: requireUserPrincipalName(entry),
      role: entry.role,
    };
  }

  return {
    principalType: "groups",
    principalId: entry.principalId,
    role: entry.role,
  };
};

/**
 * 新增用户权限时，Graph 要求我们提供 userPrincipalName。
 */
const requireUserPrincipalName = (entry: IContainerPermissionEntry): string => {
  if (entry.principalUserPrincipalName) {
    return entry.principalUserPrincipalName;
  }

  throw new Error(
    `Cannot create people permission for ${entry.id} because userPrincipalName is missing.`,
  );
};
