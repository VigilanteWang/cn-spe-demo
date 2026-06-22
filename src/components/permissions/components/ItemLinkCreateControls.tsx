import {
  Button,
  Dropdown,
  Option,
  type DropdownProps,
} from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { getItemLinkPermissionRoleLabel } from "../../../../common/helper/itemLinkPermissionCommonHelper";
import {
  ITEM_LINK_PERMISSION_SCOPE_VALUES,
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
  const dropdownRoot: DropdownProps["root"] = {
    className: styles.linkCreateDropdown,
    style: {
      width: "100%",
      minWidth: 0,
    },
  };

  return (
    <div className={styles.linkCreateRow}>
      {/* scope 选择框：这是固定候选集单选，使用 Dropdown 比可输入的 Combobox 更贴合 Fluent UI 官方推荐场景。 */}
      <Dropdown
        aria-label="Link scope"
        root={dropdownRoot}
        selectedOptions={[createScope]}
        value={getItemLinkPermissionScopeLabel(createScope)}
        disabled={interactionDisabled}
        onOptionSelect={(_event, data) =>
          onCreateScopeChange(data.optionValue as ItemLinkPermissionScope)
        }
      >
        {/* 这里用共享常量数组生成固定选项，避免前端再维护一份分散的 scope 列表。 */}
        {ITEM_LINK_PERMISSION_SCOPE_VALUES.map((scope) => (
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
      </Dropdown>

      {/* type 选择框同样是固定候选集单选，因此也走 Dropdown，避免输入型控件的默认最小宽度干扰布局。 */}
      <Dropdown
        aria-label="Link permission type"
        root={dropdownRoot}
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
      </Dropdown>

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
