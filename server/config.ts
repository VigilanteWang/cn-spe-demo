const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`[config] Missing required env var: ${key}`);
  return value;
};

export const serverConfig = {
  clientId: required("API_ENTRA_APP_CLIENT_ID"),
  clientSecret: required("API_ENTRA_APP_CLIENT_SECRET"),
  authority: required("API_ENTRA_APP_AUTHORITY"),
  containerTypeId: required("CONTAINER_TYPE_ID"),
  port: process.env.PORT ?? "3001",
};
