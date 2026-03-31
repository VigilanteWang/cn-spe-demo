"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverConfig = void 0;
const required = (key) => {
    const value = process.env[key];
    if (!value)
        throw new Error(`[config] Missing required env var: ${key}`);
    return value;
};
exports.serverConfig = {
    clientId: required("API_ENTRA_APP_CLIENT_ID"),
    clientSecret: required("API_ENTRA_APP_CLIENT_SECRET"),
    authority: required("API_ENTRA_APP_AUTHORITY"),
    containerTypeId: required("CONTAINER_TYPE_ID"),
    port: (_a = process.env.PORT) !== null && _a !== void 0 ? _a : "3001",
};
