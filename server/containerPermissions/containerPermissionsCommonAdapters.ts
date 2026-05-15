import type {
  IContainerPermissionEntry,
  ICreateContainerPermissionChange,
  PermissionTabValue,
} from "../../common/contracts/containerPermissionCommonContracts";
import { mapGraphContainerPermissionRoleToUi, mapUiContainerPermissionRoleToGraph } from "./containerPermissionRoleMapper";
import type { IGraphPermissionIdentity } from "./containerPermissionsInternalContracts";
import {
  readOptionalString,
  readRecord,
  readRequiredString,
  readStringArray,
} from "./containerPermissionsReaders";

/**
 * 把 Graph permission 对象映射成前后端共同使用的 access list 行模型。
 */
export const mapGraphPermissionToEntry = (
  permission: unknown,
): IContainerPermissionEntry => {
  const permissionRecord = readRecord(permission);
  const permissionId = readRequiredString(permissionRecord.id, "permission id");
  const roles = readStringArray(permissionRecord.roles);
  const grantedToV2 = readRecord(permissionRecord.grantedToV2);
  // Graph 可能把同一条权限挂在 user、siteUser、group 或 siteGroup 上，
  // 这里按优先级收口成统一 identity，后面的映射逻辑就不需要知道原始分支细节。
  const principal =
    normalizeGraphPermissionIdentity(grantedToV2.user) ??
    normalizeGraphPermissionIdentity(grantedToV2.siteUser) ??
    normalizeGraphPermissionIdentity(grantedToV2.group) ??
    normalizeGraphPermissionIdentity(grantedToV2.siteGroup);

  if (!principal) {
    throw new Error(
      `Permission ${permissionId} is missing grantedToV2 identity.`,
    );
  }

  const principalType =
    grantedToV2.user || grantedToV2.siteUser ? "people" : "groups";
  // Graph roles 是数组，但当前 UI 一行只展示一个主角色，所以这里显式取第一项并兜底为 reader。
  const primaryRole = roles[0] ?? "reader";

  return {
    // 这里用 permissionId 生成稳定列表键，而不是直接依赖 principal id，
    // 因为 people 在 Graph 读回时不一定能拿到稳定 object id。
    id: `permission:${permissionId}`,
    permissionId,
    // people 缺少 Graph object id 时，回退为本地可识别的合成 id，
    // 这样前端草稿态和列表渲染仍然有稳定主键可用。
    principalId:
      principal.graphId ??
      createFallbackPrincipalId(principalType, permissionId),
    principalUserPrincipalName:
      principalType === "people" ? principal.userPrincipalName : undefined,
    principalName: principal.displayName,
    principalType,
    description: principal.description,
    role: mapGraphContainerPermissionRoleToUi(primaryRole),
  };
};

/**
 * 从 Graph identity 对象里提取共同契约真正需要的最小字段。
 */
export const normalizeGraphPermissionIdentity = (
  identity: unknown,
): IGraphPermissionIdentity | null => {
  if (!identity) {
    return null;
  }

  const record = readRecord(identity);
  const graphId = readOptionalString(record.id);
  const userPrincipalName = readOptionalString(record.userPrincipalName);
  const displayName =
    readOptionalString(record.displayName) ??
    readOptionalString(record.email) ??
    userPrincipalName ??
    readOptionalString(record.mail) ??
    readOptionalString(record.loginName) ??
    graphId ??
    "Unknown principal";
  const description =
    readOptionalString(record.email) ??
    userPrincipalName ??
    readOptionalString(record.mail) ??
    readOptionalString(record.loginName) ??
    "";

  return {
    graphId,
    displayName,
    description,
    userPrincipalName,
  };
};

/**
 * people 没有返回 object id 时，生成仅供前端本地识别的回退 id。
 */
export const createFallbackPrincipalId = (
  principalType: PermissionTabValue,
  permissionId: string,
): string => {
  return `${principalType}:permission:${permissionId}`;
};

/**
 * 把新增权限差异转换成 Graph create permission 请求体。
 */
export const createGraphCreatePermissionBody = (
  createChange: ICreateContainerPermissionChange,
): {
  roles: string[];
  grantedToV2: {
    user?: { userPrincipalName: string };
    group?: { id: string };
  };
} => {
  if (createChange.principalType === "people") {
    return {
      roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
      grantedToV2: {
        // people 分支必须用 userPrincipalName，Graph 才知道要给哪个用户创建权限。
        user: {
          userPrincipalName: createChange.userPrincipalName,
        },
      },
    };
  }

  return {
    roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
    grantedToV2: {
      // groups 分支继续使用稳定的 group object id。
      group: {
        id: createChange.principalId,
      },
    },
  };
};
