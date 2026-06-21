import { Button, Combobox, Option } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { getItemLinkPermissionRoleLabel } from "../../../../common/contracts/itemPermissionCommonContracts";
import {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_TYPES,
  type ItemLinkPermissionScope,
  type ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import { getItemLinkPermissionScopeLabel } from "../services/itemLinkPermissionUiUtils";
import { usePermissionsStyles } from "./permissionsStyles";
import { renderItemLinkPermissionScopeIcon } from "./itemLinkPermissionRowShared";

/**
 * Links 面板顶部创建区的输入属性。
 */
export interface IItemLinkCreateControlsProps {
  createScope: ItemLinkPermissionScope;
  createType: ItemLinkPermissionType;
  interactionDisabled: boolean;
  scopeOptionDisabledState: Record<ItemLinkPermissionScope, boolean>;
  typeOptionDisabledState: Record<ItemLinkPermissionType, boolean>;
  canAddLink: boolean;
  onCreateScopeChange: (scope: ItemLinkPermissionScope) => void;
  onCreateTypeChange: (type: ItemLinkPermissionType) => void;
  onAddLink: () => void;
}

/**
 * 渲染 Links 面板顶部的创建控件。
 *
 * 这个组件只负责把 scope/type 的选择行为收敛成业务回调，
 * 不持有新增 link 后的展开状态。
 */
export const ItemLinkCreateControls = ({
  createScope,
  createType,
  interactionDisabled,
  scopeOptionDisabledState,
  typeOptionDisabledState,
  canAddLink,
  onCreateScopeChange,
  onCreateTypeChange,
  onAddLink,
}: IItemLinkCreateControlsProps) => {
  const styles = usePermissionsStyles();

  return (
    <div className={styles.linkCreateRow}>
      {/* scope 选择框：输入框里展示的是可读标签，真正提交给外层的是受控的 scope 字面量值。 */}
      <Combobox
        aria-label="Link scope"
        className={styles.linkCreateCombobox}
        selectedOptions={[createScope]}
        value={getItemLinkPermissionScopeLabel(createScope)}
        disabled={interactionDisabled}
        onOptionSelect={(_event, data) =>
          onCreateScopeChange(data.optionValue as ItemLinkPermissionScope)
        }
      >
        {/* 这里用共享常量数组生成固定选项，避免前端再维护一份分散的 scope 列表。 */}
        {ITEM_LINK_PERMISSION_SCOPES.map((scope) => (
          <Option
            key={scope}
            disabled={scopeOptionDisabledState[scope]}
            text={getItemLinkPermissionScopeLabel(scope)}
            value={scope}
          >
            {/* 每个 scope 选项同时展示图标和标签，方便用户更快区分匿名、组织内和指定对象链接。 */}
            <div className={styles.linkScopeOption}>
              {renderItemLinkPermissionScopeIcon(scope)}
              <span>{getItemLinkPermissionScopeLabel(scope)}</span>
            </div>
          </Option>
        ))}
      </Combobox>

      {/* type 选择框和 scope 保持同一套 Combobox 交互，只是展示文案来自共享的角色标签映射。 */}
      <Combobox
        aria-label="Link permission type"
        className={styles.linkCreateCombobox}
        selectedOptions={[createType]}
        value={getItemLinkPermissionRoleLabel(createType)}
        disabled={interactionDisabled}
        onOptionSelect={(_event, data) =>
          onCreateTypeChange(data.optionValue as ItemLinkPermissionType)
        }
      >
        {/* type 选项同样来自共享常量数组，这样 UI、请求合同和后端校验可以共用同一份真源。 */}
        {ITEM_LINK_PERMISSION_TYPES.map((type) => (
          <Option
            key={type}
            disabled={typeOptionDisabledState[type]}
            value={type}
            text={getItemLinkPermissionRoleLabel(type)}
          >
            {getItemLinkPermissionRoleLabel(type)}
          </Option>
        ))}
      </Combobox>

      {/* Add 按钮只负责触发外层新增动作，是否允许点击完全由外层已经算好的 canAddLink 控制。 */}
      <Button
        appearance="primary"
        aria-label="Add link"
        disabled={!canAddLink}
        icon={<AddRegular />}
        onClick={onAddLink}
      />
    </div>
  );
};
