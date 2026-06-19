import type { IPermissionEntryBaseForUI } from "../../../../common/contracts/permissionCommonContracts";
import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";

/**
 * 把目录搜索候选项转换成 user-type 权限草稿共用的基础字段。
 */
export const createBaseUserPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IPermissionEntryBaseForUI => ({
  id: `${candidate.type}:${candidate.id}`,
  principalId: candidate.id,
  principalObjectId: candidate.objectId,
  principalUserPrincipalName: candidate.userPrincipalName,
  principalMail: candidate.mail,
  principalDisplayName: candidate.name,
  principalType: candidate.type,
  description: candidate.secondaryText,
  isInherited: false,
  isEditable: true,
  isRemovable: true,
});
