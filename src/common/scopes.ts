/**
 * 前端权限声明 (Scopes) 模块
 *
 * 本模块定义了前端需要请求的 Microsoft Graph 和 SharePoint Embedded 权限常量。
 * 这些权限会在两个地方使用：
 *
 * 1. index.tsx 初始化 Msal2Provider 时：
 *    - GRAPH_OPENID_CONNECT_BASIC: 用户登录时请求的基础 OpenID Connect 权限
 *    - SPEMBEDDED_FILESTORAGECONTAINER_SELECTED: 访问用户授权的容器的委托权限
 *
 * 2. spembedded.ts 获取 API token 时：
 *    - SPEMBEDDED_CONTAINER_ACCESS_AS_USER: 前端代表当前用户访问后端 API 的权限，
 *      格式为 "api://{clientId}/Container.AccessAsUser"
 *
 * 权限类型说明：
 * - 委托权限 (Delegated): 以登录用户的身份执行操作，受用户自身权限限制
 * - 应用权限 (Application): 以应用自身身份执行操作（本项目前端不使用）
 *
 * 注意：部分 Graph 权限（User.Read.All、Files.ReadWrite.All、Sites.Read.All）
 * 经测试不需要，已注释掉，仅需 FileStorageContainer.Selected 即可。
 **/

// Microsoft Graph 权限
/** 读取当前登录用户的基本信息 */
export const GRAPH_USER_READ = "User.Read";
/** 读取组织内用户的基础资料，用于前端目录搜索 People。 */
export const GRAPH_USER_READ_BASIC_ALL = "User.ReadBasic.All";
/** 读取组及成员相关基础信息，用于前端目录搜索 Groups。 */
export const GRAPH_GROUP_MEMBER_READ_ALL = "GroupMember.Read.All";
// Appraently these 3 scopes are not needed for the app to work
// only FileStorageContainer.Selected is needed, both application and delegated
// export const GRAPH_USER_READ_ALL = 'User.Read.All';
// export const GRAPH_FILES_READ_WRITE_ALL = 'Files.ReadWrite.All';
// export const GRAPH_SITES_READ_ALL = 'Sites.Read.All';

/**
 * OpenID Connect 基础权限集
 * - openid: 启用 OpenID Connect 身份验证协议
 * - profile: 获取用户的基本信息（姓名、头像等）
 * - offline_access: 获取 refresh token，允许在用户离线时静默刷新 token
 **/
export const GRAPH_OPENID_CONNECT_BASIC = [
  "openid",
  "profile",
  "offline_access",
];

// SharePoint Embedded 权限
/** 前端代表当前用户访问后端 API 的单一 delegated scope。 */
export const SPEMBEDDED_CONTAINER_ACCESS_AS_USER = "Container.AccessAsUser";
/** 容器文件操作权限：读写用户授权的容器内文件（委托权限，用于 Graph API 直接调用） */
export const SPEMBEDDED_FILESTORAGECONTAINER_SELECTED =
  "FileStorageContainer.Selected";

/** 读取组织内所有用户的 Teams 在线状态（委托权限，用于 Presence API 批量查询） */
export const GRAPH_PRESENCE_READ_ALL = "Presence.Read.All";

/** 读取组织内用户头像缩略图（委托权限，用于头像图片回填） */
export const GRAPH_PROFILE_PHOTO_READ_ALL = "ProfilePhoto.Read.All";
