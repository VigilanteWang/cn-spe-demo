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
import { BackendValidationError } from "../common/errors";

/**
 * 读取并校验前端请求，转成 item 权限变更集。
 */
export const parseItemPermissionChangeSet = (
  body: unknown,
): IItemPermissionChangeSetFromUI | null => {
  const bodyRecord = readGraphToRecord(body);
  const create = bodyRecord.create;
  const update = bodyRecord.update;
  const remove = bodyRecord.remove ?? bodyRecord.delete;

  if (
    !Array.isArray(create) ||
    !Array.isArray(update) ||
    !Array.isArray(remove)
  ) {
    return null;
  }

  return {
    create: create.map(mapCreateChangeFromUI),
    update: update.map(mapUpdateChangeFromUI),
    remove: remove.map(mapRemoveChangeFromUI),
  };
};

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

const mapUpdateChangeFromUI = (
  change: unknown,
): IItemPermissionUpdateChange => {
  const record = readGraphToRecord(change);
  return {
    permissionId: readRequiredString(record.permissionId, "update permissionId"),
    principalType: readPrincipalType(record.principalType),
    principalId: readRequiredString(record.principalId, "update principalId"),
    ...readRecipient(record, "update"),
    role: readUiRole(record.role),
  };
};

const mapRemoveChangeFromUI = (
  change: unknown,
): IItemPermissionRemoveChange => {
  const record = readGraphToRecord(change);
  return {
    permissionId: readRequiredString(record.permissionId, "remove permissionId"),
  };
};

const readRecipient = (
  record: Record<string, unknown>,
  operationLabel: "create" | "update",
): IItemPermissionRecipientForUI => {
  const recipientObjectId = readOptionalString(record.recipientObjectId);
  const recipientEmail = readOptionalString(record.recipientEmail);
  const recipientAlias = readOptionalString(record.recipientAlias);

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

const readUiRole = (value: unknown): ItemPermissionRoleForUI => {
  if (value === "Reader" || value === "Writer") {
    return value;
  }

  throw new BackendValidationError(
    `Unsupported item permission UI role: ${String(value)}`,
  );
};

const readPrincipalType = (value: unknown): "people" | "groups" => {
  if (value === "people" || value === "groups") {
    return value;
  }

  throw new BackendValidationError(
    `Unsupported permission principal type: ${String(value)}`,
  );
};
