import { type ChangeEvent } from "react";
import {
  Button,
  Combobox,
  Option,
  Select,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import {
  getItemLinkPermissionRoleLabel,
  isItemLinkPermissionScope,
  isItemLinkPermissionType,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_TYPES,
  type ItemLinkPermissionScope,
  type ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import {
  getItemLinkPermissionScopeLabel,
} from "../services/itemLinkPermissionUiUtils";
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

  /**
   * 第一个下拉框使用固定选项，因此只在选择 Option 时回写业务 scope。
   */
  const handleScopeSelect: NonNullable<ComboboxProps["onOptionSelect"]> = (
    _event,
    data,
  ) => {
    const nextScope = data.optionValue;

    if (isItemLinkPermissionScope(nextScope)) {
      onCreateScopeChange(nextScope);
    }
  };

  /**
   * 第二个下拉框收集 link type。
   */
  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.currentTarget.value;

    if (isItemLinkPermissionType(nextType)) {
      onCreateTypeChange(nextType);
    }
  };

  return (
    <div className={styles.linkCreateRow}>
      <Combobox
        aria-label="Link scope"
        className={styles.linkCreateCombobox}
        selectedOptions={[createScope]}
        value={getItemLinkPermissionScopeLabel(createScope)}
        disabled={interactionDisabled}
        onOptionSelect={handleScopeSelect}
      >
        {ITEM_LINK_PERMISSION_SCOPES.map((scope) => (
          <Option
            key={scope}
            disabled={scopeOptionDisabledState[scope]}
            text={getItemLinkPermissionScopeLabel(scope)}
            value={scope}
          >
            <div className={styles.linkScopeOption}>
              {renderItemLinkPermissionScopeIcon(scope)}
              <span>{getItemLinkPermissionScopeLabel(scope)}</span>
            </div>
          </Option>
        ))}
      </Combobox>

      <Select
        aria-label="Link permission type"
        className={styles.linkCreateSelect}
        disabled={interactionDisabled}
        value={createType}
        onChange={handleTypeChange}
      >
        {ITEM_LINK_PERMISSION_TYPES.map((type) => (
          <option
            key={type}
            disabled={typeOptionDisabledState[type]}
            value={type}
          >
            {getItemLinkPermissionRoleLabel(type)}
          </option>
        ))}
      </Select>

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
