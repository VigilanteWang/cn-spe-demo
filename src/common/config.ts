/**
 * 前端应用配置管理模块
 *
 * 本模块负责：
 * 1. 从环境变量读取配置（如客户端 ID、服务器地址等）
 * 2. 验证所有必需的配置都已提供
 * 3. 根据云环境（全球/中国）配置对应的端点
 * 4. 导出一个集中式的配置对象供应用使用
 *
 * 配置来源：
 * - 环境变量（.env 文件或系统环境变量）
 * - 前缀为 REACT_APP_ 的变量（Create React App 惯例）
 *
 * 使用场景：
 * 所有需要配置的地方（API URL、客户端 ID 等）都通过 clientConfig 获取，
 * 避免硬编码，提高应用的可配置性和可移植性。
 *
 * 示例：
 * ```
 * import { clientConfig } from "./common/config";
 * const apiUrl = clientConfig.apiServerUrl;
 * const clientId = clientConfig.clientEntraAppClientId;
 * ```
 */

/**
 * 从环境变量读取配置值的辅助函数
 *
 * 流程：
 * 1. 尝试从 process.env 读取指定的环境变量
 * 2. 如果变量未定义或为空，抛出错误
 * 3. 错误信息包含缺失的环境变量名，便于调试
 *
 * @param {string} key - 环境变量名称
 * @returns {string} 环境变量的值
 * @throws {Error} 如果环境变量未定义或为空，抛出错误
 *
 * 使用示例：
 * ```
 * const clientId = required("REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID");
 * // 如果变量未设置，输出：[config] Missing required env var: REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID
 * ```
 */
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`[config] Missing required env var: ${key}`);
  return value;
};

/**
 * 云环境类型
 * - "global": 全球 Azure 环境（默认）
 * - "china": 由 21Vianet 运营的中国 Azure 环境
 *
 * 不同的云环境有不同的：
 * - Entra ID 端点（AAD Authority）
 * - Microsoft Graph 端点
 */
type CloudEnv = "global" | "china";

/**
 * 不同云环境的 API 端点配置
 *
 * 为什么需要不同的端点？
 * - 全球 Azure 和中国 Azure 是两个完全独立的系统
 * - 它们有不同的数据中心、合规要求和服务端点
 * - 应用必须使用正确的环境端点，否则认证或 API 调用会失败
 *
 * 端点说明：
 * - aadAuthorityHost: Entra ID (Azure AD) 的认证服务地址
 *   用于用户登录和令牌获取
 * - graphBaseUrl: Microsoft Graph API 的根地址
 *   所有 Graph API 调用都基于这个地址
 *
 * 用例：
 * - 访问全球环境：所有用户都在此
 * - 访问中国环境：必须符合中国政府要求和数据驻留政策的部署
 */
const CLOUD_ENDPOINTS: Record<
  CloudEnv,
  { aadAuthorityHost: string; graphBaseUrl: string }
> = {
  global: {
    aadAuthorityHost: "https://login.microsoftonline.com", // 全球 Entra ID 认证端点
    graphBaseUrl: "https://graph.microsoft.com", // 全球 Graph API 端点
  },
  china: {
    aadAuthorityHost: "https://login.chinacloudapi.cn", // 中国 Entra ID 认证端点
    graphBaseUrl: "https://microsoftgraph.chinacloudapi.cn", // 中国 Graph API 端点
  },
};

/**
 * 解析和验证云环境配置
 *
 * 流程：
 * 1. 从 REACT_APP_CLOUD_ENV 环境变量读取配置（默认为 "global"）
 * 2. 将值转换为小写以支持各种大小写形式
 * 3. 验证值只能是 "global" 或 "china"
 * 4. 如果值无效，抛出错误告知用户哪些值是允许的
 * 5. 返回类型安全的 CloudEnv 值
 *
 * @returns {CloudEnv} 有效的云环境值
 * @throws {Error} 如果环境变量值无效
 *
 * 使用示例：
 * ```
 * // 假设 REACT_APP_CLOUD_ENV=china
 * const env = resolveCloudEnv(); // 返回 "china"
 *
 * // 假设 REACT_APP_CLOUD_ENV=invalid
 * const env = resolveCloudEnv(); // 抛出错误：Unsupported REACT_APP_CLOUD_ENV value
 * ```
 */
const resolveCloudEnv = (): CloudEnv => {
  const val = (process.env.REACT_APP_CLOUD_ENV ?? "global").toLowerCase();
  if (val !== "global" && val !== "china") {
    throw new Error(
      `[config] Unsupported REACT_APP_CLOUD_ENV value: "${val}". Supported values: global, china`,
    );
  }
  return val as CloudEnv;
};

// ── 配置初始化 ─────────────────────────────────────────────────────────────
// 应用启动时立即执行这些步骤，确保所有必需的配置都已加载

const cloudEnv = resolveCloudEnv(); // 确定当前使用的云环境
const cloudEndpoints = CLOUD_ENDPOINTS[cloudEnv]; // 获取该环境的端点配置
const tenantId = required("REACT_APP_CLIENT_ENTRA_APP_TENANT_ID"); // 租户 ID

/**
 * 前端应用的全局配置对象
 *
 * 这是应用使用的集中式配置。所有其他模块都应该从这里获取配置值。
 *
 * 字段说明：
 * - clientEntraAppClientId: 前端应用在 Entra ID 中注册的应用 ID
 *   用于 MSAL/MGT 初始化和 token 验证
 * - tenantId: Azure 租户 ID（可以是租户 UUID 或 tenant.onmicrosoft.com）
 *   用于限制登录只能使用该租户的账户
 * - apiEntraAppClientId: 后端 API 在 Entra ID 中注册的应用 ID
 *   用于请求访问后端 API 的权限范围
 * - apiServerUrl: 后端 API 服务的根 URL
 *   所有 API 调用都相对于这个 URL
 * - authority: Entra ID 认证授权管理 URL
 *   格式：https://{aadAuthorityHost}/{tenantId}
 *   用于 MSAL 和 MGT 的登录重定向
 * - graphBaseUrl: Microsoft Graph API 的根地址
 *   所有 Graph API 调用都基于这个 URL
 * - cloudEnv: 当前使用的云环境
 *   值为 "global" 或 "china"
 *
 * 使用示例：
 * ```
 * // 在任何需要配置的地方
 * import { clientConfig } from "./common/config";
 *
 * // 获取 API 服务器地址
 * const apiUrl = clientConfig.apiServerUrl; // https://api.example.com
 *
 * // 获取客户端 ID
 * const clientId = clientConfig.clientEntraAppClientId;
 *
 * // 获取认证授权 URL
 * const authority = clientConfig.authority; // https://login.microsoftonline.com/tenant-id
 * ```
 */
export const clientConfig = {
  clientEntraAppClientId: required("REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID"),
  tenantId,
  apiEntraAppClientId: required("REACT_APP_API_ENTRA_APP_CLIENT_ID"),
  apiServerUrl: required("REACT_APP_API_SERVER_URL"),
  // 根据云环境和租户 ID 构造认证授权 URL
  // 用户登录时会被重定向到这个地址
  authority: `${cloudEndpoints.aadAuthorityHost}/${tenantId}`,
  // 使用环境变量 REACT_APP_GRAPH_BASE_URL（如果提供），否则使用默认值
  // 这允许在某些特殊场景下覆盖 Graph API 地址
  graphBaseUrl: (process.env.REACT_APP_GRAPH_BASE_URL ??
    cloudEndpoints.graphBaseUrl) as string,
  cloudEnv,
};
