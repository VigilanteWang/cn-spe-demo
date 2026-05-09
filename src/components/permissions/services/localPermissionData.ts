import {
  IContainerPermissionEntry,
  IPermissionPrincipalCandidate,
  PermissionEntriesByTab,
} from "../models/permissionModels";

/**
 * People 页签的本地占位数据。
 *
 * 这些数据只用于当前阶段的初始 access list，
 * 不再参与最终的搜索候选来源。
 */
const LOCAL_PEOPLE_CANDIDATES: IPermissionPrincipalCandidate[] = [
  {
    id: "user-adele-vance",
    name: "Adele Vance",
    type: "people",
    secondaryText: "adele.vance@contoso.com",
    initials: "AV",
  },
  {
    id: "user-megan-bowen",
    name: "Megan Bowen",
    type: "people",
    secondaryText: "megan.bowen@contoso.com",
    initials: "MB",
  },
  {
    id: "user-diego-siciliani",
    name: "Diego Siciliani",
    type: "people",
    secondaryText: "diego.siciliani@contoso.com",
    initials: "DS",
  },
];

/**
 * Groups 页签的本地占位数据。
 */
const LOCAL_GROUP_CANDIDATES: IPermissionPrincipalCandidate[] = [
  {
    id: "group-project-owners",
    name: "Project Owners",
    type: "groups",
    secondaryText: "project.owners@contoso.com",
    initials: "PO",
  },
  {
    id: "group-finance-team",
    name: "Finance Team",
    type: "groups",
    secondaryText: "finance-team@contoso.com",
    initials: "FT",
  },
  {
    id: "group-site-visitors",
    name: "Site Visitors",
    type: "groups",
    secondaryText: "site-visitors@contoso.com",
    initials: "SV",
  },
];

/**
 * 将候选项转换成默认权限访问项。
 *
 * 新增权限时默认角色固定为 Reader，
 * 这样可以与后续真实写回前的安全默认值保持一致。
 */
const createEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
  role: IContainerPermissionEntry["role"] = "Reader",
): IContainerPermissionEntry => ({
  // 使用“principal 类型 + principal ID”生成前端唯一键，方便表格渲染和本地更新定位。
  id: `${candidate.type}:${candidate.id}`,
  principalId: candidate.id,
  principalName: candidate.name,
  principalType: candidate.type,
  description: candidate.secondaryText,
  role,
});

/**
 * 返回本地初始化权限列表。
 *
 * 这里相当于“尚未编辑前的原始状态”，
 * 方便本步骤验证草稿编辑、回滚和本地 Apply 行为。
 */
export const createInitialPermissionEntries = (): PermissionEntriesByTab => ({
  people: [createEntryFromCandidate(LOCAL_PEOPLE_CANDIDATES[0], "Writer")],
  groups: [createEntryFromCandidate(LOCAL_GROUP_CANDIDATES[0], "Manager")],
});

/**
 * 从候选项创建一条新的默认权限记录。
 *
 * 这个函数用于“从下拉候选加入表格”的场景，默认角色保持 Reader。
 */
export const createPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IContainerPermissionEntry => createEntryFromCandidate(candidate);
