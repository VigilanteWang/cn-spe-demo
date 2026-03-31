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
  const val = (process.env.REACT_APP_CLOUD_ENV ?? "global").toLowerCase();
  if (val !== "global" && val !== "china") {
    throw new Error(
      `[config] Unsupported REACT_APP_CLOUD_ENV value: "${val}". Supported values: global, china`,
    );
  }
  return val as CloudEnv;
};

const cloudEnv = resolveCloudEnv();
const cloudEndpoints = CLOUD_ENDPOINTS[cloudEnv];
const tenantId = required("REACT_APP_CLIENT_ENTRA_APP_TENANT_ID");

export const clientConfig = {
  clientEntraAppClientId: required("REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID"),
  tenantId,
  apiEntraAppClientId: required("REACT_APP_API_ENTRA_APP_CLIENT_ID"),
  apiServerUrl: required("REACT_APP_API_SERVER_URL"),
  // Derived from REACT_APP_CLOUD_ENV + REACT_APP_CLIENT_ENTRA_APP_TENANT_ID.
  authority: `${cloudEndpoints.aadAuthorityHost}/${tenantId}`,
  // Derived from REACT_APP_CLOUD_ENV; override with REACT_APP_GRAPH_BASE_URL if needed.
  graphBaseUrl: (process.env.REACT_APP_GRAPH_BASE_URL ??
    cloudEndpoints.graphBaseUrl) as string,
  cloudEnv,
};
