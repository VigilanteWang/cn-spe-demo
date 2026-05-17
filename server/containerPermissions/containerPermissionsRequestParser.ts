/**
 * 这个文件负责把前端提交的容器权限变更请求体，解析成后端可安全使用的结构。
 *
 * 它的职责不是直接调用 Graph，而是站在 HTTP 输入边界做两件事：
 * 1. 读取弱类型的 `req.body`
 * 2. 校验并收口成模块内部认可的 change set
 *
 * 这样 handler 后续就可以基于“已经过基本校验”的数据继续执行，而不用到处写字段判断。
 */
import type {
  ContainerPermissionRole,
  IContainerPermissionChangeSet,
  ICreateContainerPermissionChange,
  IDeleteContainerPermissionChange,
  IUpdateContainerPermissionChange,
  PermissionTabValue,
} from "../../common/contracts/containerPermissionCommonContracts";
import {
  readRecord,
  readRequiredString,
} from "./containerPermissionsReaders";

/**
 * 读取并校验 Apply 请求体。
 */
export const parseContainerPermissionChangeSet = (
  body: unknown,
): IContainerPermissionChangeSet | null => {
  const bodyRecord = readRecord(body);
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
    create: create.map(mapCreateChange),
    update: update.map(mapUpdateChange),
    remove: remove.map(mapDeleteChange),
  };
};

const mapCreateChange = (change: unknown): ICreateContainerPermissionChange => {
  const record = readRecord(change);
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

const mapUpdateChange = (change: unknown): IUpdateContainerPermissionChange => {
  const record = readRecord(change);

  return {
    // 已存在权限的更新只允许改角色，因此这里只读取 permissionId 和 role。
    permissionId: readRequiredString(
      record.permissionId,
      "update permissionId",
    ),
    role: readUiRole(record.role),
  };
};

const mapDeleteChange = (change: unknown): IDeleteContainerPermissionChange => {
  const record = readRecord(change);

  return {
    // 删除阶段只需要知道要删哪一条权限记录。
    permissionId: readRequiredString(
      record.permissionId,
      "delete permissionId",
    ),
  };
};

const readUiRole = (value: unknown): ContainerPermissionRole => {
  if (
    value === "Reader" ||
    value === "Writer" ||
    value === "Manager" ||
    value === "Owner"
  ) {
    return value;
  }

  throw new Error(`Unsupported container permission UI role: ${String(value)}`);
};

const readPrincipalType = (value: unknown): PermissionTabValue => {
  if (value === "people" || value === "groups") {
    return value;
  }

  throw new Error(`Unsupported permission principal type: ${String(value)}`);
};
