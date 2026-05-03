import { Avatar, TableCellLayout } from "@fluentui/react-components";
import { UserPresenceStatus } from "../../../common/types";

/**
 * PersonCell 组件属性。
 */
interface IPersonCellProps {
  /** 用户显示名称，同时作为 Avatar 生成首字母和彩色哈希配色的依据。 */
  name: string;
  /** 用户头像缩略图地址；未提供时自动回退为姓名首字母。 */
  imageUrl?: string;
  /**
   * 用户的 Teams 在线状态。
   * 来自 Graph Presence API 批量拉取，未获取到时为 undefined，
   * 组件将以 "unknown"（灰色未知状态）渲染 PresenceBadge。
   */
  presenceStatus?: UserPresenceStatus;
}

/**
 * 可复用的人员单元格组件。
 *
 * 展示一个带 PresenceBadge 的头像和名称标签，
 * 外观参考 Fluent UI DataGrid "Author" 列的官方示例。
 * badge slot 复用了 Avatar 内置的 PresenceBadge 插槽，无需额外引入 PresenceBadge 组件。
 *
 * @param props 组件属性。
 * @returns 人员头像 + 状态徽章 + 名称的单元格内容。
 */
export const PersonCell = ({
  name,
  imageUrl,
  presenceStatus,
}: IPersonCellProps) => (
  <TableCellLayout
    // Avatar 作为单元格左侧媒体图标
    media={
      <Avatar
        // name 属性同时用于生成首字母缩写；如果 image 加载失败会自动回退到首字母。
        name={name}
        // colorful 模式：根据 name 哈希自动分配颜色，同名用户颜色一致
        color="colorful"
        size={28}
        image={imageUrl ? { src: imageUrl } : undefined}
        // badge 插槽内置 PresenceBadge，直接传 status 即可显示正确状态图标
        badge={{ status: presenceStatus ?? "unknown" }}
        aria-label={`${name} - ${presenceStatus ?? "unknown"}`}
      />
    }
  >
    {name}
  </TableCellLayout>
);
