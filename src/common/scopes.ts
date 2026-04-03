/**
 * OAuth 2.0 权限范围定义
 *
 * 权限范围 (Scope) 是 OAuth 2.0 中限制应用程序访问权限的机制。
 * 用户在登录时同意自己授予应用哪些权限，而不是赋予应用无限的权限。
 *
 * 权限范围的结构：
 * - 格式：[APP_ID]/[SCOPE_NAME] 或直接 [SCOPE_NAME]
 * - 含义：请求对特定资源的特定级别的访问
 * - 类型分为两类：
 *   * 委派权限 (Delegated): 代表用户执行操作
 *   * 应用权限 (Application): 应用自身的权限（通常不需要用户同意）
 *
 * SharePoint Embedded 权限模型：
 * - 所有权限都通过 Microsoft Graph API 授予
 * - 权限需要管理员在 Entra ID 中为应用预先配置
 * - 运行时不会再次请求权限（只会请求已配置的权限）
 */

// ═══════════════════════════════════════════════════════════════════════════
// Microsoft Graph 权限
// ═══════════════════════════════════════════════════════════════════════════

/**
 * User.Read 权限
 *
 * 用途：读取当前登录用户的基本信息（如用户名、邮箱等）
 * 权限级别：最小权限
 * 权限类型：委派权限
 *
 * 注意：此应用当前实际上不需要此权限，也不显式请求它
 */
export const GRAPH_USER_READ = "User.Read";

/**
 * OpenID Connect 基础权限范围
 *
 * 这些是标准的 OpenID Connect 权限范围，用于身份验证和在线状态管理：
 *
 * - openid: 获取 ID token，基础身份验证
 * - profile: 访问用户的基本配置文件信息（名称、头像等）
 * - offline_access: 获取刷新令牌，允许应用在用户离线后长期访问资源
 *
 * 使用场景：
 * - 在 MSAL 配置中请求这些权限
 * - 用于维持用户的登录会话和获取新 token
 */
export const GRAPH_OPENID_CONNECT_BASIC = [
  "openid",
  "profile",
  "offline_access",
];

// Note: 以下权限在开发过程中被发现实际上不需要
// 应用能正常工作只需要 FileStorageContainer.Selected 权限
// export const GRAPH_USER_READ_ALL = 'User.Read.All';
// export const GRAPH_FILES_READ_WRITE_ALL = 'Files.ReadWrite.All';
// export const GRAPH_SITES_READ_ALL = 'Sites.Read.All';

// ═══════════════════════════════════════════════════════════════════════════
// SharePoint Embedded 权限
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Container.Manage 权限
 *
 * 用途：管理 SharePoint Embedded 容器（创建、删除、修改）
 * 权限级别：容器级别的完全控制
 * 权限类型：委派权限
 *
 * 包含可以执行的操作：
 * 1. 创建新容器：POST /storage/fileStorage/containers
 * 2. 列出现有容器：GET /storage/fileStorage/containers
 * 3. 删除容器：DELETE /storage/fileStorage/containers/{id}
 * 4. 修改容器属性：PATCH /storage/fileStorage/containers/{id}
 *
 * 在此应用中的用途：
 * - 后端通过 OBO 流程获取具有此权限的 Graph token
 * - 前端请求 Container.Manage 权限范围的 access token
 * - 后端验证 token 中是否包含此权限（检查 scp claim）
 *
 * 安全考量：
 * - 此权限应该仅授予管理员或受信任的应用程序
 * - 生产环境中应根据最小权限原则进行限制
 */
export const SPEMBEDDED_CONTAINER_MANAGE = "Container.Manage";

/**
 * FileStorageContainer.Selected 权限
 *
 * 用途：访问特定的 SharePoint Embedded 容器及其文件
 * 权限级别：容器内的文件读写操作
 * 权限类型：委派权限
 *
 * 包含可以执行的操作：
 * 1. 列出容器内的文件/文件夹：GET /drives/{driveId}/items/root/children
 * 2. 上传文件：PUT /drives/{driveId}/items/{itemId}:/{fileName}:/content
 * 3. 下载文件：GET /drives/{driveId}/items/{itemId}/content
 * 4. 删除文件/文件夹：DELETE /drives/{driveId}/items/{itemId}
 * 5. 获取文件信息：GET /drives/{driveId}/items/{itemId}
 *
 * 这个权限对此应用的重要性：
 * - 前端通过 MGT (Microsoft Graph Toolkit) 请求此权限
 * - MGT 中的许多组件隐式依赖此权限来读取文件
 * - 后端调用 Graph API 时也需要此权限
 *
 * 与 Container.Manage 的关系：
 * - Container.Manage 管理容器本身（创建/删除）
 * - FileStorageContainer.Selected 管理容器内的文件
 * - 通常两个权限都需要才能完整地使用 SharePoint Embedded 功能
 */
export const SPEMBEDDED_FILESTORAGECONTAINER_SELECTED =
  "FileStorageContainer.Selected";
