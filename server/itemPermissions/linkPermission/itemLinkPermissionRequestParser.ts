import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemLinkPermissionCreateChange,
  IItemLinkPermissionDeleteChange,
  IItemLinkPermissionGrantRecipientsChange,
  IItemLinkPermissionRevokeRecipientsChange,
  IItemPermissionRecipientForUI,
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
 * 解析 link permission apply 请求体。
 */
export const parseItemLinkPermissionChangeSet = (
  body: unknown,
): IApplyItemLinkPermissionChangesRequest | null => {
  const bodyRecord = readGraphToRecord(body);
  const create = bodyRecord.create;
  const deleteLinks =
    bodyRecord.deleteLinks ?? bodyRecord.delete ?? bodyRecord.remove;
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

const mapCreateChange = (value: unknown): IItemLinkPermissionCreateChange => {
  const record = readGraphToRecord(value);
  return {
    scope: readLinkPermissionScope(record.scope),
    type: readLinkPermissionType(record.type),
    recipients: readOptionalRecipients(record.recipients, "create"),
  };
};

const mapDeleteChange = (value: unknown): IItemLinkPermissionDeleteChange => {
  const record = readGraphToRecord(value);
  return {
    permissionId: readRequiredString(
      record.permissionId,
      "deleteLinks permissionId",
    ),
  };
};

const mapGrantRecipientsChange = (
  value: unknown,
): IItemLinkPermissionGrantRecipientsChange => {
  const record = readGraphToRecord(value);
  return {
    permissionId: readRequiredString(
      record.permissionId,
      "grantRecipients permissionId",
    ),
    shareId: readRequiredString(record.shareId, "grantRecipients shareId"),
    type: readLinkPermissionType(record.type),
    recipients: readRequiredRecipients(
      record.recipients,
      "grantRecipients recipients",
    ),
  };
};

const mapRevokeRecipientsChange = (
  value: unknown,
): IItemLinkPermissionRevokeRecipientsChange => {
  const record = readGraphToRecord(value);
  return {
    permissionId: readRequiredString(
      record.permissionId,
      "revokeRecipients permissionId",
    ),
    shareId: readRequiredString(record.shareId, "revokeRecipients shareId"),
    recipients: readRequiredRecipients(
      record.recipients,
      "revokeRecipients recipients",
    ),
  };
};

const readOptionalRecipients = (
  value: unknown,
  fieldName: string,
): IItemPermissionRecipientForUI[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredRecipients(value, fieldName);
};

const readRequiredRecipients = (
  value: unknown,
  fieldName: string,
): IItemPermissionRecipientForUI[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw createValidationError(`${fieldName} must be a non-empty array.`);
  }

  return value.map((entry, index) =>
    readRecipient(readGraphToRecord(entry), `${fieldName}[${index}]`),
  );
};

const readRecipient = (
  record: Record<string, unknown>,
  fieldName: string,
): IItemPermissionRecipientForUI => {
  const recipientObjectId = readOptionalString(record.recipientObjectId);
  const recipientEmail = readOptionalString(record.recipientEmail);
  const recipientAlias = readOptionalString(record.recipientAlias);

  if (!recipientObjectId && !recipientEmail && !recipientAlias) {
    throw createValidationError(
      `${fieldName} requires at least one recipient identifier.`,
    );
  }

  return {
    recipientObjectId,
    recipientEmail,
    recipientAlias,
  };
};

const readLinkPermissionScope = (value: unknown): ItemLinkPermissionScope => {
  if (value === "anonymous" || value === "organization" || value === "users") {
    return value;
  }

  throw createItemLinkPermissionError(
    "itemLinkPermissionScopeNotAllowed",
    `Unsupported item link permission scope: ${String(value)}`,
    { statusCode: 400, cause: value },
  );
};

const readLinkPermissionType = (value: unknown): ItemLinkPermissionType => {
  if (value === "view" || value === "edit" || value === "blocksDownload") {
    return value;
  }

  throw createItemLinkPermissionError(
    "itemLinkPermissionTypeNotAllowed",
    `Unsupported item link permission type: ${String(value)}`,
    { statusCode: 400, cause: value },
  );
};
