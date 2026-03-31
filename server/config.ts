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
  // Derived from CLOUD_ENV + API_ENTRA_APP_TENANT_ID; override with API_ENTRA_APP_AUTHORITY if needed.
  authority:
    process.env.API_ENTRA_APP_AUTHORITY ??
    `${cloudEndpoints.aadAuthorityHost}/${tenantId}/`,
  // Derived from CLOUD_ENV; override with GRAPH_BASE_URL if needed.
  graphBaseUrl: process.env.GRAPH_BASE_URL ?? cloudEndpoints.graphBaseUrl,
  cloudEnv,
};
