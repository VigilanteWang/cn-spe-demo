"use strict";
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverConfig = void 0;
const required = (key) => {
    const value = process.env[key];
    if (!value)
        throw new Error(`[config] Missing required env var: ${key}`);
    return value;
};
const CLOUD_ENDPOINTS = {
    global: {
        aadAuthorityHost: "https://login.microsoftonline.com",
        graphBaseUrl: "https://graph.microsoft.com",
    },
    china: {
        aadAuthorityHost: "https://login.chinacloudapi.cn",
        graphBaseUrl: "https://microsoftgraph.chinacloudapi.cn",
    },
};
const resolveCloudEnv = () => {
    var _a;
    const val = ((_a = process.env.CLOUD_ENV) !== null && _a !== void 0 ? _a : "global").toLowerCase();
    if (val !== "global" && val !== "china") {
        throw new Error(`[config] Unsupported CLOUD_ENV value: "${val}". Supported values: global, china`);
    }
    return val;
};
const cloudEnv = resolveCloudEnv();
const cloudEndpoints = CLOUD_ENDPOINTS[cloudEnv];
const tenantId = required("API_ENTRA_APP_TENANT_ID");
exports.serverConfig = {
    clientId: required("API_ENTRA_APP_CLIENT_ID"),
    clientSecret: required("API_ENTRA_APP_CLIENT_SECRET"),
    tenantId,
    containerTypeId: required("CONTAINER_TYPE_ID"),
    port: (_a = process.env.PORT) !== null && _a !== void 0 ? _a : "3001",
    // Derived from CLOUD_ENV + API_ENTRA_APP_TENANT_ID; override with API_ENTRA_APP_AUTHORITY if needed.
    authority: (_b = process.env.API_ENTRA_APP_AUTHORITY) !== null && _b !== void 0 ? _b : `${cloudEndpoints.aadAuthorityHost}/${tenantId}/`,
    // Derived from CLOUD_ENV; override with GRAPH_BASE_URL if needed.
    graphBaseUrl: (_c = process.env.GRAPH_BASE_URL) !== null && _c !== void 0 ? _c : cloudEndpoints.graphBaseUrl,
    cloudEnv,
};
//# sourceMappingURL=config.js.map