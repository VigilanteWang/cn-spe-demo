/**
 * 专门验证 item permission 列表里 inheritedFrom 是否出现。
 *
 * 说明：
 * - 复用和 itemPermissionValidation.ts 相同的当前租户登录 + API OBO 路径
 * - 优先读取 root item；如环境变量提供目标 item，则读取指定 item
 */

import {
  ConfidentialClientApplication,
  type AuthenticationResult,
  type Configuration,
  LogLevel,
  PublicClientApplication,
} from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { serverConfig } from "../server/config";

type JsonRecord = Record<string, unknown>;

const clientAuthority =
  process.env.VITE_CLIENT_ENTRA_APP_AUTHORITY ??
  `${serverConfig.authority.replace(/\/$/, "")}`;

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const clientClientId = requiredEnv("VITE_CLIENT_ENTRA_APP_CLIENT_ID");
const apiScope = `api://${serverConfig.clientId}/Container.Manage`;
const graphResourceScope = `${serverConfig.graphBaseUrl}/FileStorageContainer.Selected`;

const publicClient = new PublicClientApplication({
  auth: {
    clientId: clientClientId,
    authority: clientAuthority,
  },
});

const confidentialClient = new ConfidentialClientApplication({
  auth: {
    clientId: serverConfig.clientId,
    authority: serverConfig.authority,
    clientSecret: serverConfig.clientSecret,
  },
  system: {
    loggerOptions: {
      loggerCallback() {
        return;
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Warning,
    },
  },
} satisfies Configuration);

const graphHost = new URL(serverConfig.graphBaseUrl).hostname;

const createGraphClient = (accessToken: string): Client =>
  Client.init({
    authProvider: (done) => done(null, accessToken),
    defaultVersion: "v1.0",
    baseUrl: serverConfig.graphBaseUrl,
    customHosts: new Set([graphHost]),
  });

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" ? (value as JsonRecord) : {};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const prettyJson = (value: unknown): string => JSON.stringify(value, null, 2);

const acquireToken = async (scopes: string[]): Promise<AuthenticationResult> => {
  const accounts = await publicClient.getAllAccounts();
  const firstAccount = accounts[0];

  if (firstAccount) {
    const result = await publicClient.acquireTokenSilent({
      account: firstAccount,
      scopes,
    });

    if (result) {
      return result;
    }
  }

  const result = await publicClient.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (response) => {
      console.log(`\n[device-code] ${response.message}\n`);
    },
  });

  if (!result) {
    throw new Error("Unable to acquire API token.");
  }

  return result;
};

const acquireGraphOboToken = async (apiAccessToken: string): Promise<string> => {
  const result = await confidentialClient.acquireTokenOnBehalfOf({
    oboAssertion: apiAccessToken,
    scopes: [graphResourceScope],
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire Graph OBO token.");
  }

  return result.accessToken;
};

const pickContainer = async (graphClient: Client) => {
  const requestedContainerId = process.env.VALIDATION_CONTAINER_ID;

  if (requestedContainerId) {
    return requestedContainerId;
  }

  const response = await graphClient
    .api("/storage/fileStorage/containers")
    .version("v1.0")
    .filter(`containerTypeId eq ${serverConfig.containerTypeId}`)
    .get();

  const containers = Array.isArray(response?.value) ? response.value : [];
  if (containers.length === 0) {
    throw new Error("No container available for validation.");
  }

  return String(asRecord(containers[0]).id);
};

async function main(): Promise<void> {
  const apiAuthResult = await acquireToken([apiScope]);
  if (!apiAuthResult.accessToken) {
    throw new Error("Unable to acquire API access token.");
  }

  const oboGraphToken = await acquireGraphOboToken(apiAuthResult.accessToken);
  const graphClient = createGraphClient(oboGraphToken);
  const driveId = await pickContainer(graphClient);
  const itemPath =
    process.env.VALIDATION_EXISTING_ITEM_ID && process.env.VALIDATION_EXISTING_ITEM_ID !== "root"
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(process.env.VALIDATION_EXISTING_ITEM_ID)}/permissions`
      : `/drives/${encodeURIComponent(driveId)}/root/permissions`;

  const payload = await graphClient.api(itemPath).version("v1.0").get();
  const items = Array.isArray(asRecord(payload).value)
    ? (asRecord(payload).value as unknown[]).map(asRecord)
    : [];

  const summary = {
    driveId,
    itemPath,
    permissionCount: items.length,
    items: items.map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      roles: asStringArray(item.roles),
      inheritedFrom: item.inheritedFrom ?? null,
      inheritedFromKeys: Object.keys(asRecord(item.inheritedFrom)).sort(),
      grantedToKeys: Object.keys(asRecord(item.grantedTo)).sort(),
      grantedToV2Keys: Object.keys(asRecord(item.grantedToV2)).sort(),
    })),
    rawPayload: payload,
  };

  console.log(prettyJson(summary));
}

void main().catch((error: unknown) => {
  console.error("[fatal]", error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
