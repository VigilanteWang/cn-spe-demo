import type {
  IItemPermissionChangeSetFromUI,
  IItemPermissionCreateChange,
  IItemPermissionRecipientForUI,
  IItemPermissionRemoveChange,
  IItemPermissionUpdateChange,
  ItemPermissionRoleForUI,
} from "../../common/contracts/itemPermissionCommonContracts";
import {
  readGraphToRecord,
  readOptionalString,
  readRequiredString,
} from "../permissionsCore/permissionGraphReaders";
import { BackendValidationError } from "../common/errorDefinitions";

/**
 * 读取并校验前端请求，转成 item 权限变更集。
 *
 * 这里既负责字段形状校验，也负责兼容旧版 `delete` 字段，
 * 让后续 handler 可以直接消费稳定的 `create/update/remove` 结构。
 *
 * @param body 前端提交的原始请求体。
 * @returns 合法时返回标准化后的变更集；顶层结构不合法时返回 `null`。
 */
export const parseItemPermissionChangeSet = (
  body: unknown,
): IItemPermissionChangeSetFromUI | null => {
  const bodyRecord = readGraphToRecord(body);
  const create = bodyRecord.create;
  const update = bodyRecord.update;
  // 兼容早期前端仍可能发送的 `delete` 字段，统一归并到 remove。
  const remove = bodyRecord.remove ?? bodyRecord.delete;

  if (
    !Array.isArray(create) ||
    !Array.isArray(update) ||
    !Array.isArray(remove)
  ) {
    return null;
  }

  return {
    // 逐项进入更细的字段校验，确保后续写回层拿到的都是稳定合同形状。
    create: create.map(mapCreateChangeFromUI),
    update: update.map(mapUpdateChangeFromUI),
    remove: remove.map(mapRemoveChangeFromUI),
  };
};

/**
 * 解析一条新增权限变更。
 *
 * @param change 单条 create 变更原始对象。
 * @returns 通过字段收窄后的新增权限变更。
 */
const mapCreateChangeFromUI = (
  change: unknown,
): IItemPermissionCreateChange => {
  const record = readGraphToRecord(change);
  return {
    principalType: readPrincipalType(record.principalType),
    principalId: readRequiredString(record.principalId, "create principalId"),
    ...readRecipient(record, "create"),
    role: readUiRole(record.role),
  };
};

/**
 * 解析一条更新权限变更。
 *
 * @param change 单条 update 变更原始对象。
 * @returns 通过字段收窄后的更新权限变更。
 */
const mapUpdateChangeFromUI = (
  change: unknown,
): IItemPermissionUpdateChange => {
  const record = readGraphToRecord(change);
  return {
    // update 必须携带 permissionId，后端才能精确命中既有显式权限。
    permissionId: readRequiredString(
      record.permissionId,
      "update permissionId",
    ),
    principalType: readPrincipalType(record.principalType),
    principalId: readRequiredString(record.principalId, "update principalId"),
    ...readRecipient(record, "update"),
    role: readUiRole(record.role),
  };
};

/**
 * 解析一条删除权限变更。
 *
 * @param change 单条 remove 变更原始对象。
 * @returns 通过字段收窄后的删除权限变更。
 */
const mapRemoveChangeFromUI = (
  change: unknown,
): IItemPermissionRemoveChange => {
  const record = readGraphToRecord(change);
  return {
    permissionId: readRequiredString(
      record.permissionId,
      "remove permissionId",
    ),
  };
};

/**
 * 读取 create/update 所需的 recipient 标识。
 *
 * @param record 已经转换成 record 的变更对象。
 * @param operationLabel 当前操作类型，仅用于生成清晰错误消息。
 * @returns 至少包含一种 recipient 标识的合同对象。
 * @throws 当三种 recipient 标识都缺失时抛出校验错误。
 */
const readRecipient = (
  record: Record<string, unknown>,
  operationLabel: "create" | "update",
): IItemPermissionRecipientForUI => {
  const recipientObjectId = readOptionalString(record.recipientObjectId);
  const recipientEmail = readOptionalString(record.recipientEmail);
  const recipientAlias = readOptionalString(record.recipientAlias);

  // 三种标识至少要有一个，后端才可能构造出合法的 Graph recipient。
  if (!recipientObjectId && !recipientEmail && !recipientAlias) {
    throw new BackendValidationError(
      `Item permission ${operationLabel} requires at least one recipient identifier.`,
    );
  }

  return {
    recipientObjectId,
    recipientEmail,
    recipientAlias,
  };
};

/**
 * 读取并校验前端 item 权限角色。
 *
 * @param value 待校验的原始角色值。
 * @returns 仅允许 `Reader` 或 `Writer`。
 * @throws 当角色超出前端支持范围时抛出校验错误。
 */
const readUiRole = (value: unknown): ItemPermissionRoleForUI => {
  if (value === "Reader" || value === "Writer") {
    return value;
  }

  throw new BackendValidationError(
    `Unsupported item permission UI role: ${String(value)}`,
  );
};

/**
 * 读取并校验权限主体类型。
 *
 * @param value 待校验的原始主体类型。
 * @returns 仅允许 `people` 或 `groups`。
 * @throws 当主体类型超出当前产品支持范围时抛出校验错误。
 */
const readPrincipalType = (value: unknown): "people" | "groups" => {
  if (value === "people" || value === "groups") {
    return value;
  }

  throw new BackendValidationError(
    `Unsupported permission principal type: ${String(value)}`,
  );
};
