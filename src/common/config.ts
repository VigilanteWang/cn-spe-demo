const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`[config] Missing required env var: ${key}`);
  return value;
};

export const clientConfig = {
  clientEntraAppClientId: required("REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID"),
  tenantId: required("REACT_APP_CLIENT_ENTRA_APP_TENANT_ID"),
  apiEntraAppClientId: required("REACT_APP_API_ENTRA_APP_CLIENT_ID"),
  apiServerUrl: required("REACT_APP_API_SERVER_URL"),
  get authority() {
    return `https://login.microsoftonline.com/${this.tenantId}`;
  },
};
