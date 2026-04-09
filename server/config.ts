const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`[config] Missing required env var: ${key}`);
  return value;
};

type CloudEnv = "global" | "china";

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

const resolveCloudEnv = (): CloudEnv => {
  const val = (process.env.CLOUD_ENV ?? "global").toLowerCase();
  if (val !== "global" && val !== "china") {
    throw new Error(
      `[config] Unsupported CLOUD_ENV value: "${val}". Supported values: global, china`,
    );
  }
  return val as CloudEnv;
};

const cloudEnv = resolveCloudEnv();
const cloudEndpoints = CLOUD_ENDPOINTS[cloudEnv];
const tenantId = required("API_ENTRA_APP_TENANT_ID");

export const serverConfig = {
  clientId: required("API_ENTRA_APP_CLIENT_ID"),
  clientSecret: required("API_ENTRA_APP_CLIENT_SECRET"),
  tenantId,
  containerTypeId: required("CONTAINER_TYPE_ID"),
  port: process.env.PORT ?? "3001",
  // 默认由 CLOUD_ENV 与 API_ENTRA_APP_TENANT_ID 组合生成；可用 API_ENTRA_APP_AUTHORITY 覆盖。
  authority:
    process.env.API_ENTRA_APP_AUTHORITY ??
    `${cloudEndpoints.aadAuthorityHost}/${tenantId}/`,
  // 默认由 CLOUD_ENV 推导；可用 GRAPH_BASE_URL 覆盖。
  graphBaseUrl: process.env.GRAPH_BASE_URL ?? cloudEndpoints.graphBaseUrl,
  cloudEnv,
};
