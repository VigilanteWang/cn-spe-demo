/**
 * 这个文件负责把前端提交的容器权限变更请求体，解析成后端可安全使用的结构。
 *
 * 实际这里做的更多是校验和类型确认，对象形状和值没变
 *
 * 它的职责不是直接调用 Graph，而是站在 HTTP 输入边界做两件事：
 * 1. 读取弱类型的 `req.body`
 * 2. 校验并收口成模块内部认可的 change set
 *
 * 这样 handler 后续就可以基于“已经过基本校验”的数据继续执行，而不用到处写字段判断。
 */
import type {
  ContainerPermissionRoleForUI,
  IContainerPermissionChangeSetFromUI,
  IContainerPermissionCreateChange,
  IContainerPermissionRemoveChange,
  IContainerPermissionUpdateChange,
  PermissionTabValue,
} from "../../common/contracts/containerPermissionCommonContracts";
import {
  readGraphToRecord,
  readRequiredString,
} from "./containerPermissionsReaders";
import { BackendValidationError } from "../common/errorDefinitions";

/**
 * 读取并校验前端请求，转成变更集。
 */
export const parseContainerPermissionChangeSet = (
  body: unknown,
): IContainerPermissionChangeSetFromUI | null => {
  const bodyRecord = readGraphToRecord(body);
  const create = bodyRecord.create;
  const update = bodyRecord.update;
  // 这里继续兼容历史 delete 字段，避免前后端版本短暂错位时直接写回失败。
  const remove = bodyRecord.remove ?? bodyRecord.delete;

  // 三段数据缺一不可；如果整体 shape 不符合预期，就让上层直接返回 400。
  if (
    !Array.isArray(create) ||
    !Array.isArray(update) ||
    !Array.isArray(remove)
  ) {
    return null;
  }

  return {
    // 这里把“原始数组项”逐条收口成已经校验过的差异对象。
    create: create.map(mapCreateChangeFromUI),
    update: update.map(mapUpdateChangeFromUI),
    remove: remove.map(mapRemoveChangeFromUI),
  };
};

const mapCreateChangeFromUI = (
  change: unknown,
): IContainerPermissionCreateChange => {
  const record = readGraphToRecord(change);
  const principalType = readPrincipalType(record.principalType);

  if (principalType === "people") {
    return {
      principalType: "people",
      principalId: readRequiredString(record.principalId, "create principalId"),
      // people 分支后续写入 Graph 时必须使用 userPrincipalName，因此这里强制要求存在。
      userPrincipalName: readRequiredString(
        record.userPrincipalName,
        "create userPrincipalName",
      ),
      role: readUiRole(record.role),
    };
  }

  return {
    principalType: "groups",
    // groups 分支继续依赖稳定的 group id。
    principalId: readRequiredString(record.principalId, "create principalId"),
    role: readUiRole(record.role),
  };
};

const mapUpdateChangeFromUI = (
  change: unknown,
): IContainerPermissionUpdateChange => {
  const record = readGraphToRecord(change);

  return {
    // 已存在权限的更新只允许改角色，因此这里只读取 permissionId 和 role。
    permissionId: readRequiredString(
      record.permissionId,
      "update permissionId",
    ),
    role: readUiRole(record.role),
  };
};

const mapRemoveChangeFromUI = (
  change: unknown,
): IContainerPermissionRemoveChange => {
  const record = readGraphToRecord(change);

  return {
    // 删除阶段只需要知道要删哪一条权限记录。
    permissionId: readRequiredString(
      record.permissionId,
      "remove permissionId",
    ),
  };
};

const readUiRole = (value: unknown): ContainerPermissionRoleForUI => {
  if (
    value === "Reader" ||
    value === "Writer" ||
    value === "Manager" ||
    value === "Owner"
  ) {
    return value;
  }

  throw new BackendValidationError(
    `Unsupported container permission UI role: ${String(value)}`,
  );
};

const readPrincipalType = (value: unknown): PermissionTabValue => {
  if (value === "people" || value === "groups") {
    return value;
  }

  throw new BackendValidationError(
    `Unsupported permission principal type: ${String(value)}`,
  );
};
