import { FrontendValidationError } from "../../../common/errors.ts";
import type {
  IItemPermissionChangeSetFromUI,
  IItemPermissionCreateChange,
  IItemPermissionRemoveChange,
  IItemPermissionUpdateChange,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type {
  IItemPermissionEntry,
  IItemPermissionEntriesByTab,
} from "../models/itemPermissionModels";

export { type IItemPermissionChangeSetFromUI as IItemPermissionChangeSet } from "../../../../common/contracts/itemPermissionCommonContracts";

/**
 * 表示 item 权限草稿差异计算阶段的前端校验错误。
 *
 * 这个错误会把问题定位到具体 entry，方便调用方在草稿列表里高亮出错项。
 */
export class ItemPermissionValidationError extends FrontendValidationError {
  /**
   * 创建一个带 entryId 上下文的草稿校验错误。
   *
   * @param code 稳定错误码，供上层区分错误类型。
   * @param message 面向界面和日志的错误说明。
   * @param entryId 出错的权限行 id。
   */
  constructor(code: string, message: string, entryId: string) {
    super(code, message, {
      name: "ItemPermissionValidationError",
      details: { entryId },
    });
  }
}

interface IRequiredFieldErrorOptions {
  code: string;
  operation: string;
  fieldName:
    | "permissionId"
    | "recipientObjectId"
    | "recipientEmail"
    | "recipientAlias";
  entryId: string;
}

/**
 * 计算 item 权限草稿相对初始快照的变更集合。
 *
 * 这里会把草稿变化拆成 create、update、remove 三类，并且显式阻止
 * inherited 或只读行进入 update/remove，避免 UI 误把不可写的权限提交给后端。
 *
 * @param originalEntriesByTab 打开对话框时的原始权限快照。
 * @param draftEntriesByTab 用户在界面上编辑后的草稿权限。
 * @returns 可直接提交给后端 apply 接口的差异结果。
 */
export const computeItemPermissionChanges = (
  originalEntriesByTab: IItemPermissionEntriesByTab,
  draftEntriesByTab: IItemPermissionEntriesByTab,
): IItemPermissionChangeSetFromUI => {
  const create: IItemPermissionCreateChange[] = [];
  const update: IItemPermissionUpdateChange[] = [];
  const remove: IItemPermissionRemoveChange[] = [];

  for (const tab of ["people", "groups"] as const) {
    const originalEntries = originalEntriesByTab[tab];
    const draftEntries = draftEntriesByTab[tab];
    // 用 entry id 建索引，后面就能用 O(1) 方式判断“新增 / 修改 / 删除”。
    const originalEntryById = new Map(
      originalEntries.map((entry) => [entry.id, entry] as const),
    );
    const draftEntryById = new Map(
      draftEntries.map((entry) => [entry.id, entry] as const),
    );

    for (const draftEntry of draftEntries) {
      const originalEntry = originalEntryById.get(draftEntry.id);

      // 草稿里有、原始快照里没有，说明这是新增权限。
      if (!originalEntry) {
        create.push(createItemPermissionChangeFromEntry(draftEntry));
        continue;
      }

      // 当前实现只把 role 变化视为 update，其他字段默认认为是只读展示数据。
      if (originalEntry.role !== draftEntry.role) {
        // 先挡住 inherited / readonly 行，避免前端构造出不该写回的更新。
        ensureEntryIsEditable(
          originalEntry,
          "update inherited or readonly item permission",
        );
        update.push({
          // update/delete 都必须依赖 permissionId 才能精确命中既有权限记录。
          permissionId: requireEntryField(originalEntry.permissionId, {
            code: "missingPermissionId",
            operation: "update current item permission role",
            fieldName: "permissionId",
            entryId: originalEntry.id,
          }),
          principalType: originalEntry.principalType,
          principalId: originalEntry.principalId,
          ...readRecipientFromEntry(originalEntry),
          // 写回时只带最终草稿角色，不重复回传整条 UI 状态。
          role: draftEntry.role,
        });
      }
    }

    for (const originalEntry of originalEntries) {
      // 原始快照里有、草稿里没有，说明用户删除了这一行权限。
      if (!draftEntryById.has(originalEntry.id)) {
        // 删除前，同样要确认这条权限在当前 item 上允许移除。
        ensureEntryIsRemovable(
          originalEntry,
          "remove inherited or readonly item permission",
        );
        remove.push({
          permissionId: requireEntryField(originalEntry.permissionId, {
            code: "missingPermissionId",
            operation: "delete a removed item permission",
            fieldName: "permissionId",
            entryId: originalEntry.id,
          }),
        });
      }
    }
  }

  return {
    create,
    update,
    remove,
  };
};

/**
 * 把前端权限模型，转换成新增权限所需的change模型。
 *
 * @param entry 草稿中的单条权限行。
 * @returns 可写入 create 变更集合的对象。
 */
const createItemPermissionChangeFromEntry = (
  entry: IItemPermissionEntry,
): IItemPermissionCreateChange => ({
  principalType: entry.principalType,
  principalId: entry.principalId,
  ...readRecipientFromEntry(entry),
  role: entry.role,
});

/**
 * 从权限行里提取 Graph invite 所需的 recipient 标识。
 *
 * recipient 优先级与前面的设计结论保持一致：`objectId -> email/UPN -> alias`。
 * 当前共享候选模型还没有正式把 alias 作为主要输入源，所以这里优先产出 objectId / email。
 *
 * @param entry 当前权限行。
 * @returns 可写回后端 create/update 合同的 recipient 字段。
 * @throws 当 entry 既没有 objectId 也没有 email/UPN 时抛出校验错误。
 */
const readRecipientFromEntry = (
  entry: IItemPermissionEntry,
): {
  recipientObjectId?: string;
  recipientEmail?: string;
  recipientAlias?: string;
} => {
  const recipientObjectId = entry.principalObjectId;
  // mail 不存在时退回 userPrincipalName，尽量保留可用于 invite 的身份线索。
  const recipientEmail =
    entry.principalMail ?? entry.principalUserPrincipalName;

  // create 或重新构造 update 时至少要能拿到一个可识别的 recipient。
  if (!recipientObjectId && !recipientEmail) {
    throw new ItemPermissionValidationError(
      "missingRecipient",
      "Cannot create or recreate item permission: missing recipientObjectId and recipientEmail.",
      entry.id,
    );
  }

  return {
    recipientObjectId,
    recipientEmail,
  };
};

/**
 * 确保权限行允许更新。
 *
 * @param entry 待更新的权限行。
 * @param operation 当前要执行的操作说明。
 * @throws 当权限行继承自父级或被标记为只读时抛出错误。
 */
const ensureEntryIsEditable = (
  entry: IItemPermissionEntry,
  operation: string,
) => {
  // 继承行和只读行都不应该进入 update 变更集。
  if (entry.isInherited || !entry.isEditable) {
    throw new ItemPermissionValidationError(
      "readonlyPermission",
      `Cannot ${operation}: entry ${entry.id} is readonly.`,
      entry.id,
    );
  }
};

/**
 * 确保权限行允许删除。
 *
 * @param entry 待删除的权限行。
 * @param operation 当前要执行的操作说明。
 * @throws 当权限行继承自父级或被标记为不可删除时抛出错误。
 */
const ensureEntryIsRemovable = (
  entry: IItemPermissionEntry,
  operation: string,
) => {
  // 删除保护和更新保护分开封装，便于未来按产品规则分别收紧。
  if (entry.isInherited || !entry.isRemovable) {
    throw new ItemPermissionValidationError(
      "readonlyPermission",
      `Cannot ${operation}: entry ${entry.id} is readonly.`,
      entry.id,
    );
  }
};

/**
 * 断言某个写回必填字段存在。
 *
 * @param value 待校验的字段值。
 * @param requiredFieldErrorOptions 构造错误消息所需的字段上下文。
 * @returns 原样返回非空字符串值。
 * @throws 当字段为空时抛出带 entryId 的校验错误。
 */
const requireEntryField = (
  value: string | undefined,
  requiredFieldErrorOptions: IRequiredFieldErrorOptions,
): string => {
  // 只有非空字符串才算满足写回条件，避免把空值带进 API 合同。
  if (typeof value === "string" && value) {
    return value;
  }

  throw new ItemPermissionValidationError(
    requiredFieldErrorOptions.code,
    `Cannot ${requiredFieldErrorOptions.operation}: missing ${requiredFieldErrorOptions.fieldName}.`,
    requiredFieldErrorOptions.entryId,
  );
};
