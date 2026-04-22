/**
 * 前端配置管理模块
 *
 * 本模块负责：
 * 1. 从环境变量读取前端配置（以 VITE_ 前缀，Vite 规范）
 * 2. 根据 CLOUD_ENV 自动选择对应的云环境端点（全球版 / 世纪互联版）
 * 3. 导出统一的 clientConfig 对象供全局使用
 *
 * 环境变量说明（在 .env.development.local 或 .env.production.local 中配置）：
 * - VITE_CLIENT_ENTRA_APP_CLIENT_ID: 前端 Entra App 的客户端 ID（用于 MSAL 登录）
 * - VITE_CLIENT_ENTRA_APP_TENANT_ID: Azure AD 租户 ID
 * - VITE_API_ENTRA_APP_CLIENT_ID: 后端 API 的 Entra App 客户端 ID（用于 token scope）
 * - VITE_API_SERVER_URL: 后端 API 服务器地址（如 http://localhost:3001）
 * - VITE_CLOUD_ENV: 云环境选择，"global"（默认）或 "china"
 * - VITE_GRAPH_BASE_URL: （可选）自定义 Graph API 基础 URL
 *
 * 安全注意：VITE_ 前缀的变量会被 Vite 打包进浏览器 bundle，
 * 对最终用户可见，绝不能放入 secret 或敏感信息！
 *
 * 云环境对照：
 * | 环境     | AAD 登录地址                        | Graph API 地址                          |
 * |----------|------------------------------------|-----------------------------------------|
 * | global   | login.microsoftonline.com          | graph.microsoft.com                     |
 * | china    | login.chinacloudapi.cn             | microsoftgraph.chinacloudapi.cn          |
 **/

/**
 * 读取必需的环境变量，缺失时抛出明确错误
 * @param key 环境变量名（VITE_ 前缀，与 src/react-app-env.d.ts 中的 ImportMetaEnv 对应）
 * @returns 环境变量值
 * @throws 如果环境变量未设置
 **/
const required = (key: string): string => {
  // Vite 通过 import.meta.env 注入前端环境变量，替代 CRA 的 process.env
  const value = import.meta.env[key] as string | undefined;
  if (!value) throw new Error(`[config] Missing required env var: ${key}`);
  return value;
};

/** 支持的云环境类型 */
type CloudEnv = "global" | "china";

/** 各云环境的端点地址映射 */
const CLOUD_ENDPOINTS: Record<
  CloudEnv,
  { aadAuthorityHost: string; graphBaseUrl: string }
> = {
  global: {
    aadAuthorityHost: "https://login.microsoftonline.com",
    graphBaseUrl: "https://graph.microsoft.com",
  },
  china: {
    aadAuthorityHost: "https://login.chinacloudapi.cn",
    graphBaseUrl: "https://microsoftgraph.chinacloudapi.cn",
  },
};

/**
 * 解析云环境配置
 * 从 VITE_CLOUD_ENV 环境变量读取，默认为 "global"
 * @returns 合法的 CloudEnv 值
 * @throws 如果环境变量值不是 "global" 或 "china"
 **/
const resolveCloudEnv = (): CloudEnv => {
  const val = (import.meta.env.VITE_CLOUD_ENV ?? "global").toLowerCase();
  if (val !== "global" && val !== "china") {
    throw new Error(
      `[config] Unsupported VITE_CLOUD_ENV value: "${val}". Supported values: global, china`,
    );
  }
  return val as CloudEnv;
};

const cloudEnv = resolveCloudEnv();
const cloudEndpoints = CLOUD_ENDPOINTS[cloudEnv];
const tenantId = required("VITE_CLIENT_ENTRA_APP_TENANT_ID");

/**
 * 前端全局配置对象
 *
 * 导出给 index.tsx（初始化 Msal2Provider）和 spembedded.ts（调用后端 API）使用
 **/
export const clientConfig = {
  /** 前端 Entra App 的客户端 ID（MSAL 登录用） */
  clientEntraAppClientId: required("VITE_CLIENT_ENTRA_APP_CLIENT_ID"),
  /** Azure AD 租户 ID */
  tenantId,
  /** 后端 API 的 Entra App 客户端 ID（构建 token scope 用） */
  apiEntraAppClientId: required("VITE_API_ENTRA_APP_CLIENT_ID"),
  /** 后端 API 服务器地址 */
  apiServerUrl: required("VITE_API_SERVER_URL"),
  /** MSAL 认证 authority URL，格式: {loginHost}/{tenantId} */
  authority: `${cloudEndpoints.aadAuthorityHost}/${tenantId}`,
  /** Graph API 基础 URL，可通过 VITE_GRAPH_BASE_URL 覆盖 */
  graphBaseUrl: (import.meta.env.VITE_GRAPH_BASE_URL ??
    cloudEndpoints.graphBaseUrl) as string,
  /** 当前云环境 */
  cloudEnv,
};
