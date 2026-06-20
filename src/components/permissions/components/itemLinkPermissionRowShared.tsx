import {
  GlobeRegular,
  PeopleRegular,
  PersonRegular,
} from "@fluentui/react-icons";
import type { ItemLinkPermissionScope } from "../models/itemLinkPermissionModels";

/**
 * 渲染 link scope 对应的图标，确保创建区和列表行保持同一套视觉语义。
 *
 * @param scope 当前 link 的业务 scope。
 * @returns 对应 scope 的 Fluent UI 图标。
 */
export const renderItemLinkPermissionScopeIcon = (
  scope: ItemLinkPermissionScope,
) => {
  if (scope === "anonymous") {
    return <GlobeRegular />;
  }

  if (scope === "organization") {
    return <PeopleRegular />;
  }

  return <PersonRegular />;
};
