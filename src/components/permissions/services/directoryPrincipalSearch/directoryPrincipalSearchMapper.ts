/**
 * 这个文件先把 Graph 返回的 unknown narrowing 成对象，再逐个字段做类型判断，
 * 这样才能安全读取 user/group 的 id、displayName、mail、upn、groupTypes 等属性。
 */
import { DirectoryPrincipalSearchError } from "./directoryPrincipalSearchError";
import {
  readOptionalBoolean,
  readOptionalString,
  readRecord,
  readStringArray,
} from "./directoryPrincipalSearchObjectUtils";
import {
  DirectoryPrincipalType,
  IDirectoryPrincipalSearchResult,
} from "./directoryPrincipalSearchTypes";

/**
 * 把 Graph user 响应转换成选择器需要的统一模型。
 *
 * Graph 可能缺少 mail 或 displayName，所以这里提供安全回退，避免 UI 因空字段崩溃。
 */
export const mapGraphUser = (
  rawUser: unknown,
): IDirectoryPrincipalSearchResult => {
  const user = readRecord(rawUser);
  const id = readRequiredString(user.id, "User");
  const displayName = readOptionalString(user.displayName) ?? id;
  const mail = readOptionalString(user.mail);
  const userPrincipalName = readOptionalString(user.userPrincipalName);

  return {
    id,
    displayName,
    secondaryText: mail ?? userPrincipalName ?? "User",
    principalType: "user",
    mail,
    userPrincipalName,
  };
};

/**
 * 把 Graph group 响应转换成选择器需要的统一模型。
 *
 * groupTypes/mailEnabled/securityEnabled 共同决定 group 类型，不能只看 displayName。
 */
export const mapGraphGroup = (
  rawGroup: unknown,
): IDirectoryPrincipalSearchResult => {
  const group = readRecord(rawGroup);
  const id = readRequiredString(group.id, "Group");
  const displayName = readOptionalString(group.displayName) ?? id;
  const mail = readOptionalString(group.mail);
  const description = readOptionalString(group.description);
  const groupTypes = readStringArray(group.groupTypes);
  const mailEnabled = readOptionalBoolean(group.mailEnabled);
  const securityEnabled = readOptionalBoolean(group.securityEnabled);

  return {
    id,
    displayName,
    secondaryText:
      mail ??
      description ??
      getGroupTypeLabel(groupTypes, mailEnabled, securityEnabled),
    principalType: mapGroupPrincipalType(
      groupTypes,
      mailEnabled,
      securityEnabled,
    ),
    mail,
    groupTypes,
    mailEnabled,
    securityEnabled,
  };
};

/**
 * 根据 Graph group 字段映射组类型。
 *
 * 初级开发者容易误以为 groupTypes 为空就不是特殊组；实际上 DL 和 security group
 * 主要依赖 mailEnabled/securityEnabled 两个布尔值判断。
 */
export const mapGroupPrincipalType = (
  groupTypes: string[],
  mailEnabled: boolean | undefined,
  securityEnabled: boolean | undefined,
): DirectoryPrincipalType => {
  if (groupTypes.includes("Unified")) {
    return "microsoft365Group";
  }

  if (mailEnabled === true && securityEnabled === false) {
    return "distributionList";
  }

  if (mailEnabled === false && securityEnabled === true) {
    return "securityGroup";
  }

  if (mailEnabled === true && securityEnabled === true) {
    return "mailEnabledSecurityGroup";
  }

  return "group";
};

/**
 * 没有 mail/description 时，用组类型作为辅助显示文本。
 */
const getGroupTypeLabel = (
  groupTypes: string[],
  mailEnabled: boolean | undefined,
  securityEnabled: boolean | undefined,
): string => {
  const principalType = mapGroupPrincipalType(
    groupTypes,
    mailEnabled,
    securityEnabled,
  );

  if (principalType === "microsoft365Group") {
    return "Microsoft 365 group";
  }

  if (principalType === "distributionList") {
    return "Distribution list";
  }

  if (principalType === "securityGroup") {
    return "Security group";
  }

  if (principalType === "mailEnabledSecurityGroup") {
    return "Mail-enabled security group";
  }

  return "Group";
};

/**
 * 读取 Graph 响应里的必需字符串字段。
 */
const readRequiredString = (value: unknown, entityName: string): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw new DirectoryPrincipalSearchError(
    "graphFailure",
    `${entityName} response is missing the required id field.`,
  );
};
