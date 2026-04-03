/**
 * 前端应用通用类型定义
 *
 * 本模块定义了应用中使用的主要数据类型和接口。
 * 这些类型提供了类型安全，帮助开发者在编译时发现错误。
 */

import { DriveItem } from "@microsoft/microsoft-graph-types-beta";

/**
 * 扩展的 DriveItem 类型 - 包含 UI 所需的额外字段
 *
 * Microsoft Graph 返回的 DriveItem 包含文件/文件夹的基本信息。
 * 本类型在此基础上添加了 UI 计算好的字段，避免在渲染时重复计算。
 *
 * 字段说明：
 * - isFolder: 是否为文件夹（自 folder 属性推导）
 * - modifiedByName: 最后修改人的显示名称（用于列表展示）
 * - iconElement: 预渲染的文件夹/文件图标 JSX 元素
 * - downloadUrl: 文件下载链接，来自 @microsoft.graph.downloadUrl 扩展属性
 *
 * 继承于 DriveItem，因此包含原始的所有属性：
 * - id, name, webUrl, parentReference, lastModifiedBy 等
 *
 * 使用场景：
 * ```
 * const items: IDriveItemExtended[] = driveItems.map(item => ({
 *   ...item,
 *   isFolder: item.folder ? true : false,
 *   modifiedByName: item.lastModifiedBy?.user?.displayName || "unknown",
 *   iconElement: item.folder ? <FolderIcon /> : <FileIcon />,
 *   downloadUrl: item["@microsoft.graph.downloadUrl"],
 * }));
 * ```
 */
export interface IDriveItemExtended extends DriveItem {
  isFolder: boolean; // 是否为文件夹
  modifiedByName: string; // 最后修改人名称
  iconElement: JSX.Element; // 文件/文件夹图标 React 组件
  downloadUrl: string; // 文件下载 URL（仅对文件有效）
}

/**
 * SharePoint Embedded 存储容器的信息
 *
 * 容器概念：
 * - 容器是 SharePoint Embedded 中的隔离存储空间
 * - 每个容器有独立的权限控制和文件系统
 * - 用户可以在一个应用中创建和管理多个容器
 *
 * 字段说明：
 * - id: 容器的唯一标识符（由 Microsoft Graph 生成）
 *   格式：b!<base64-encoded-value>
 * - displayName: 容器的显示名称（用户可见、可修改）
 * - containerTypeId: 容器类型 ID（定义了容器的配置和行为）
 * - createdDateTime: ISO 8601 格式的创建时间戳（包含时区）
 *
 * 数据来源：
 * - 由后端的 /api/listContainers 端点返回
 * - 后端通过 Microsoft Graph API 的 /storage/fileStorage/containers 获取
 *
 * 示例：
 * ```json
 * {
 *   "id": "b!abc123def456...",
 *   "displayName": "Project Documents",
 *   "containerTypeId": "abcd1234-5678-9abc-def0-123456789012",
 *   "createdDateTime": "2024-01-15T10:30:00.000Z"
 * }
 * ```
 */
export interface IContainer {
  id: string; // 容器唯一 ID
  displayName: string; // 容器显示名称
  containerTypeId: string; // 容器类型 ID
  createdDateTime: string; // 创建时间（ISO 8601 格式）
}
