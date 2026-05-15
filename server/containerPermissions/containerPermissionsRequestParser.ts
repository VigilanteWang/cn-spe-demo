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
 * 读取并校验 apply 请求体。
 */
export const parseContainerPermissionChangeSet = (
  body: unknown,
): IContainerPermissionChangeSet | null => {
  const bodyRecord = readRecord(body);
  const create = bodyRecord.create;
  const update = bodyRecord.update;
  // 这里继续兼容历史 delete 字段，避免前端与后端版本短暂错位时直接写回失败。
  const remove = bodyRecord.remove ?? bodyRecord.delete;

  if (
    !Array.isArray(create) ||
    !Array.isArray(update) ||
    !Array.isArray(remove)
  ) {
    return null;
  }

  return {
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
      userPrincipalName: readRequiredString(
        record.userPrincipalName,
        "create userPrincipalName",
      ),
      role: readUiRole(record.role),
    };
  }

  return {
    principalType: "groups",
    principalId: readRequiredString(record.principalId, "create principalId"),
    role: readUiRole(record.role),
  };
};

const mapUpdateChange = (change: unknown): IUpdateContainerPermissionChange => {
  const record = readRecord(change);

  return {
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
