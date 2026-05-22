/**
 * 这个文件负责容器权限模块里最核心的“对象翻译”工作。
 *
 * 它主要处理两类转换：
 * 1. 把 Microsoft Graph 返回的原始 permission / identity 对象，整理成前后端共用的契约类型
 * 2. 把前端提交的新增权限差异，翻译成 Graph 创建权限时要求的请求体
 *
 * 可以把它理解成“共同契约”和“Graph 协议细节”之间的适配层。
 * 这样 handler 不需要理解 Graph 字段形状，前端也不需要直接依赖 Graph 返回结构。
 */
import type {
  IContainerPermissionEntryForUI,
  IContainerPermissionCreateChange,
  PermissionTabValue,
} from "../../common/contracts/containerPermissionCommonContracts";
import {
  mapGraphContainerPermissionRoleToUi,
  mapUiContainerPermissionRoleToGraph,
} from "./containerPermissionRoleMapper";
import type { IGraphIdentityInPermission } from "./containerPermissionsInternalContracts";
import {
  readGraphToRecord,
  readRequiredString,
  readStringArray,
} from "./containerPermissionsReaders";
import { resolveGraphPermissionIdentity } from "../permissionsCore/permissionIdentityAdapters";

/**
 * 把单条 Graph permission 对象映射成前后端共用的契约模型 IContainerPermissionEntry。
 */
export const mapGraphPermissionToEntryOnUI = (
  permission: unknown,
): IContainerPermissionEntryForUI => {
  const permissionRecord = readGraphToRecord(permission);
  // Graph permission 的 id 是后续更新、删除这条权限时最稳定的锚点。
  const permissionId = readRequiredString(permissionRecord.id, "permission id");
  const roles = readStringArray(permissionRecord.roles);
  const principal = resolveGraphPermissionIdentity(permission);

  if (!principal) {
    throw new Error(
      `Permission ${permissionId} is missing a supported identity facet.`,
    );
  }

  const principalType = principal.principalType;
  // Graph roles 是数组，但当前 UI 一行只展示一个主角色，所以这里显式取第一项并兜底为 reader。
  const primaryRole = roles[0] ?? "reader";

  return {
    // 列表行 id 使用 permissionId 生成，而不是直接依赖 principalId。
    // 原因是 people 在 Graph 读回时不一定带稳定 object id，但 permissionId 一定存在。
    id: `permission:${permissionId}`,
    permissionId,
    // people 缺少 Graph object id 时，退回到本地合成 id。
    // 这样前端草稿状态、diff 和列表渲染仍然有稳定主键可用。
    principalId:
      principal.graphId ??
      createFallbackPrincipalId(principalType, permissionId),
    principalObjectId: principal.graphId,
    // people 新增时后续写回 Graph 需要 userPrincipalName，所以读取时也尽量保留下来。
    principalUserPrincipalName:
      principalType === "people" ? principal.userPrincipalName : undefined,
    principalMail: principal.mail,
    principalName: principal.displayName,
    principalType,
    description: principal.description,
    isInherited: false,
    isEditable: true,
    isRemovable: true,
    // 这里把 Graph 小写角色翻译成 UI / 共同契约里使用的大写角色。
    role: mapGraphContainerPermissionRoleToUi(primaryRole),
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
export const newGraphCreatePermissionBody = (
  createChange: IContainerPermissionCreateChange,
): {
  roles: string[];
  grantedToV2: {
    user?: { userPrincipalName: string };
    group?: { id: string };
  };
} => {
  if (createChange.principalType === "people") {
    return {
      // Graph 创建接口使用小写角色值，所以这里先从 UI 角色映射回 Graph 角色。
      roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
      grantedToV2: {
        // people 分支必须使用 userPrincipalName，Graph 才知道要把权限授予哪个用户。
        user: {
          userPrincipalName: createChange.userPrincipalName,
        },
      },
    };
  }

  return {
    // groups 分支同样先把 UI 角色转换成 Graph 角色。
    roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
    grantedToV2: {
      // groups 分支继续使用稳定的 group object id。
      group: {
        id: createChange.principalId,
      },
    },
  };
};
