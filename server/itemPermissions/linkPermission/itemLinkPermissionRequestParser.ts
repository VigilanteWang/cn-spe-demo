import {
  isItemLinkPermissionScope,
  isItemLinkPermissionType,
} from "../../../common/contracts/itemPermissionCommonContracts";
import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemLinkPermissionCreateChange,
  IItemLinkPermissionDeleteChange,
  IItemLinkPermissionGrantRecipientsChange,
  IItemLinkPermissionRevokeRecipientsChange,
  IItemUserPermissionRecipientForUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../common/contracts/itemPermissionCommonContracts";
import {
  readGraphToRecord,
  readOptionalString,
  readRequiredString,
} from "../../permissionsCore/permissionGraphReaders";
import { createValidationError } from "../../common/appErrorHelpers";
import { createItemLinkPermissionError } from "./itemLinkPermissionErrors";

/**
 * 解析 item link permission 的变更请求体。
 *
 * @param body 外部 HTTP 请求传入的原始 body。
 * @returns 结构完整时返回可供后续服务层直接消费的变更集；如果顶层数组骨架不完整，则返回 null。
 */
export const parseItemLinkPermissionChangeSet = (
  body: unknown,
): IApplyItemLinkPermissionChangesRequest | null => {
  // 请求体来自运行时输入，先统一收窄成 record，再按字段逐个读取。
  const bodyRecord = readGraphToRecord(body);
  const create = bodyRecord.create;
  const deleteLinks = bodyRecord.deleteLinks;
  const grantRecipients = bodyRecord.grantRecipients;
  const revokeRecipients = bodyRecord.revokeRecipients;

  if (
    !Array.isArray(create) ||
    !Array.isArray(deleteLinks) ||
    !Array.isArray(grantRecipients) ||
    !Array.isArray(revokeRecipients)
  ) {
    return null;
  }

  return {
    create: create.map(mapCreateChange),
    deleteLinks: deleteLinks.map(mapDeleteChange),
    grantRecipients: grantRecipients.map(mapGrantRecipientsChange),
    revokeRecipients: revokeRecipients.map(mapRevokeRecipientsChange),
  };
};

/**
 * 解析单条新建 link 的变更对象。
 *
 * @param value 单条 createLinks 原始数据。
 * @returns 已完成 scope/type 收窄后的新建变更对象。
 */
const mapCreateChange = (value: unknown): IItemLinkPermissionCreateChange => {
  const record = readGraphToRecord(value);
  return {
    scope: readLinkPermissionScope(record.scope),
    type: readLinkPermissionType(record.type),
    // createLinks 的 recipients 允许省略，因为有些 link 只创建链接本身，不立即授权具体对象。
    recipients: readOptionalRecipients(record.recipients, "createLinks"),
  };
};

/**
 * 解析单条删除 link 的变更对象。
 *
 * @param value 单条 deleteLinks 原始数据。
 * @returns 已校验 permissionId 的删除变更对象。
 */
const mapDeleteChange = (value: unknown): IItemLinkPermissionDeleteChange => {
  const record = readGraphToRecord(value);
  return {
    permissionId: readRequiredString(
      record.permissionId,
      "permissionId in one of the deleteLink",
    ),
  };
};

/**
 * 解析单条 grantRecipients 变更对象。
 *
 * @param value 单条 grantRecipients 原始数据。
 * @returns 已校验 permissionId、shareId、type 和 recipients 的授权变更对象。
 */
const mapGrantRecipientsChange = (
  value: unknown,
): IItemLinkPermissionGrantRecipientsChange => {
  const record = readGraphToRecord(value);
  return {
    permissionId: readRequiredString(
      record.permissionId,
      "permissionId in one of the grantRecipients",
    ),
    shareId: readRequiredString(
      record.shareId,
      "shareId in one of the grantRecipients",
    ),
    type: readLinkPermissionType(record.type),
    // grantRecipients 会直接驱动后续授权写操作，因此 recipients 必须是非空数组。
    recipients: readRequiredRecipients(record.recipients, "grantRecipients"),
  };
};

/**
 * 解析单条 revokeRecipients 变更对象。
 *
 * @param value 单条 revokeRecipients 原始数据。
 * @returns 已校验 permissionId、shareId 和 recipients 的撤销变更对象。
 */
const mapRevokeRecipientsChange = (
  value: unknown,
): IItemLinkPermissionRevokeRecipientsChange => {
  const record = readGraphToRecord(value);
  return {
    permissionId: readRequiredString(
      record.permissionId,
      "permissionId in one of the revokeRecipients",
    ),
    shareId: readRequiredString(
      record.shareId,
      "shareId in one of the revokeRecipients",
    ),
    // revokeRecipients 与 grantRecipients 一样属于立即执行的写操作，不接受空 recipients。
    recipients: readRequiredRecipients(record.recipients, "revokeRecipients"),
  };
};

/**
 * 读取可选 recipients 字段。
 *
 * @param value 原始 recipients 输入。
 * @param fieldName 当前字段名，用于拼接校验错误文案。
 * @returns 字段缺失时返回 undefined；存在时继续走必填数组校验。
 */
const readOptionalRecipients = (
  value: unknown,
  fieldName: string,
): IItemUserPermissionRecipientForUI[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredRecipients(value, fieldName);
};

/**
 * 读取必填 recipients 数组。
 *
 * @param value 原始 recipients 输入。
 * @param fieldName 当前字段名，用于拼接校验错误文案。
 * @returns 已逐项收窄的 recipients 数组。
 */
const readRequiredRecipients = (
  value: unknown,
  fieldName: string,
): IItemUserPermissionRecipientForUI[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw createValidationError(
      `recipients of ${fieldName} must be a non-empty array.`,
    );
  }

  // 这里不保留原始 entry 形状，统一把每一项收窄成稳定的 recipient 合同对象。
  return value.map((entry) =>
    readRecipient(
      readGraphToRecord(entry),
      `one of the recipients in ${fieldName}`,
    ),
  );
};

/**
 * 读取单个 recipient 标识对象。
 *
 * @param record 已收窄成 record 的单个 recipient 输入。
 * @param fieldName 当前字段名，用于拼接校验错误文案。
 * @returns 至少携带一种标识的 recipient 对象。
 */
const readRecipient = (
  record: Record<string, unknown>,
  fieldName: string,
): IItemUserPermissionRecipientForUI => {
  const recipientObjectId = readOptionalString(record.recipientObjectId);
  const recipientEmail = readOptionalString(record.recipientEmail);
  const recipientAlias = readOptionalString(record.recipientAlias);

  if (!recipientObjectId && !recipientEmail && !recipientAlias) {
    // 三种候选标识至少要命中一种，否则后续既无法授权，也无法精确撤销。
    throw createValidationError(`${fieldName} doesn't have valid identifier.`);
  }

  return {
    recipientObjectId,
    recipientEmail,
    recipientAlias,
  };
};

/**
 * 校验并读取 link scope。
 *
 * @param value 原始 scope 输入。
 * @returns 允许的 item link permission scope。
 */
const readLinkPermissionScope = (value: unknown): ItemLinkPermissionScope => {
  // 这里用白名单把外部输入收窄成合同允许的 scope，避免非法值继续流向 Graph 请求。
  if (isItemLinkPermissionScope(value)) {
    return value;
  }

  throw createItemLinkPermissionError(
    "itemLinkPermissionScopeNotAllowed",
    `Unsupported item link permission scope: ${String(value)}`,
    { statusCode: 400, cause: value },
  );
};

/**
 * 校验并读取 link type。
 *
 * @param value 原始 type 输入。
 * @returns 允许的 item link permission type。
 */
const readLinkPermissionType = (value: unknown): ItemLinkPermissionType => {
  // type 会直接决定 Graph createLink / grant 的行为，因此只接受当前合同明确支持的枚举值。
  if (isItemLinkPermissionType(value)) {
    return value;
  }

  throw createItemLinkPermissionError(
    "itemLinkPermissionTypeNotAllowed",
    `Unsupported item link permission type: ${String(value)}`,
    { statusCode: 400, cause: value },
  );
};
