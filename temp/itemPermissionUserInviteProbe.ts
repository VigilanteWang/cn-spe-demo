/**
 * 验证把 item-level permission 直接授予某个用户后，真实 payload 会长什么样。
 *
 * 说明：
 * - 复用当前仓库已有的前端登录配置与后端 OBO Graph token 路径
 * - 默认验证用户为 MiriamG@3ctsr2.onmicrosoft.com，也可用环境变量覆盖
 * - 为避免影响现有数据，脚本会创建一个临时文件夹进行授权验证，结束后删除整个临时项
 */

import {
  ConfidentialClientApplication,
  type AuthenticationResult,
  type Configuration,
  LogLevel,
  PublicClientApplication,
} from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { serverConfig } from "../server/config.ts";

type JsonRecord = Record<string, unknown>;

interface IResolvedUser {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  source: string;
}

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
const graphReadScopes = [
  "openid",
  "profile",
  "offline_access",
  "FileStorageContainer.Selected",
  "User.ReadBasic.All",
];
const targetUserUpn =
  process.env.VALIDATION_USER_UPN ?? "MiriamG@3ctsr2.onmicrosoft.com";

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
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const prettyJson = (value: unknown): string => JSON.stringify(value, null, 2);

const collectIdentityKinds = (permission: JsonRecord): string[] => {
  const result = new Set<string>();
  const fields = [
    "grantedTo",
    "grantedToV2",
    "grantedToIdentities",
    "grantedToIdentitiesV2",
  ];

  for (const field of fields) {
    const value = permission[field];

    if (Array.isArray(value)) {
      for (const item of value) {
        const itemRecord = asRecord(item);
        for (const key of Object.keys(itemRecord)) {
          result.add(`${field}.${key}`);
        }
      }
      continue;
    }

    const record = asRecord(value);
    for (const key of Object.keys(record)) {
      result.add(`${field}.${key}`);
    }
  }

  return Array.from(result).sort();
};

const acquireToken = async (
  scopes: string[],
  label: string,
): Promise<AuthenticationResult> => {
  const accounts = await publicClient.getAllAccounts();
  const firstAccount = accounts[0];

  if (firstAccount) {
    try {
      const silentResult = await publicClient.acquireTokenSilent({
        account: firstAccount,
        scopes,
      });

      if (silentResult) {
        return silentResult;
      }
    } catch {
      // 静默获取失败时，回退到 device code 登录，继续沿用同一租户上下文。
    }
  }

  console.log(`\n[auth] 开始获取 ${label} token...`);
  const deviceCodeResult = await publicClient.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (response) => {
      console.log(`\n[device-code] ${response.message}\n`);
    },
  });

  if (!deviceCodeResult) {
    throw new Error(`Unable to acquire ${label} token.`);
  }

  return deviceCodeResult;
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
    return {
      id: requestedContainerId,
      displayName: "env-specified",
    };
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

  const first = asRecord(containers[0]);
  return {
    id: String(first.id),
    displayName:
      typeof first.displayName === "string" ? first.displayName : undefined,
  };
};

const resolveUserByUpn = async (
  graphClient: Client,
  userPrincipalName: string,
): Promise<IResolvedUser> => {
  const payload = await graphClient
    .api(`/users/${encodeURIComponent(userPrincipalName)}`)
    .version("v1.0")
    .select("id,displayName,mail,userPrincipalName")
    .get();

  const record = asRecord(payload);
  const id = typeof record.id === "string" ? record.id : undefined;

  if (!id) {
    throw new Error(`Unable to resolve user by UPN: ${userPrincipalName}`);
  }

  return {
    id,
    displayName:
      typeof record.displayName === "string" ? record.displayName : undefined,
    mail: typeof record.mail === "string" ? record.mail : undefined,
    userPrincipalName:
      typeof record.userPrincipalName === "string"
        ? record.userPrincipalName
        : undefined,
    source: "users/{userPrincipalName}",
  };
};

const createTempFolder = async (graphClient: Client, driveId: string) => {
  const folderName = `_codex_user_item_permission_probe_${Date.now()}`;
  const created = await graphClient
    .api(`/drives/${encodeURIComponent(driveId)}/items/root/children`)
    .version("v1.0")
    .post({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });

  const record = asRecord(created);
  return {
    id: String(record.id),
    name: typeof record.name === "string" ? record.name : folderName,
    webUrl: typeof record.webUrl === "string" ? record.webUrl : undefined,
  };
};

const listItemPermissions = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
) =>
  graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/permissions`,
    )
    .version("v1.0")
    .get();

const getItemPermission = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  permissionId: string,
) =>
  graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/permissions/${encodeURIComponent(permissionId)}`,
    )
    .version("v1.0")
    .get();

const createInvite = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  user: IResolvedUser,
) =>
  graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/invite`,
    )
    .version("v1.0")
    .post({
      recipients: [{ objectId: user.id }],
      requireSignIn: true,
      sendInvitation: false,
      roles: ["write"],
    });

const deleteItem = async (graphClient: Client, driveId: string, itemId: string) =>
  graphClient
    .api(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`)
    .version("v1.0")
    .delete();

const summarizePermissionList = (payload: unknown) => {
  const items = Array.isArray(asRecord(payload).value)
    ? (asRecord(payload).value as unknown[]).map(asRecord)
    : [];

  return {
    permissionCount: items.length,
    permissions: items.map((permission) => ({
      id: typeof permission.id === "string" ? permission.id : undefined,
      roles: asStringArray(permission.roles),
      hasInheritedFrom:
        permission.inheritedFrom !== undefined && permission.inheritedFrom !== null,
      inheritedFromKeys: Object.keys(asRecord(permission.inheritedFrom)).sort(),
      grantedToKeys: Object.keys(asRecord(permission.grantedTo)).sort(),
      grantedToV2Keys: Object.keys(asRecord(permission.grantedToV2)).sort(),
      identityKinds: collectIdentityKinds(permission),
      raw: permission,
    })),
    rawPayload: payload,
  };
};

async function main(): Promise<void> {
  const apiToken = await acquireToken([apiScope], "API");
  const graphDirectoryToken = await acquireToken(graphReadScopes, "Graph directory");

  if (!apiToken.accessToken) {
    throw new Error("API access token is missing.");
  }

  if (!graphDirectoryToken.accessToken) {
    throw new Error("Graph directory token is missing.");
  }

  const oboToken = await acquireGraphOboToken(apiToken.accessToken);
  const oboGraphClient = createGraphClient(oboToken);
  const directoryGraphClient = createGraphClient(graphDirectoryToken.accessToken);

  const container = await pickContainer(oboGraphClient);
  const user = await resolveUserByUpn(directoryGraphClient, targetUserUpn);
  const tempItem = await createTempFolder(oboGraphClient, container.id);

  let cleaned = false;

  try {
    const before = await listItemPermissions(oboGraphClient, container.id, tempItem.id);
    const inviteResponse = await createInvite(
      oboGraphClient,
      container.id,
      tempItem.id,
      user,
    );

    const invitePermissions = Array.isArray(asRecord(inviteResponse).value)
      ? (asRecord(inviteResponse).value as unknown[]).map(asRecord)
      : [];
    const createdPermissionId =
      typeof invitePermissions[0]?.id === "string"
        ? (invitePermissions[0]?.id as string)
        : undefined;

    const permissionGet = createdPermissionId
      ? await getItemPermission(
          oboGraphClient,
          container.id,
          tempItem.id,
          createdPermissionId,
        )
      : null;
    const after = await listItemPermissions(oboGraphClient, container.id, tempItem.id);

    const report = {
      runAt: new Date().toISOString(),
      targetUserUpn,
      container,
      user,
      tempItem,
      permissionListBeforeInvite: summarizePermissionList(before),
      inviteRequest: {
        recipients: [{ objectId: user.id }],
        requireSignIn: true,
        sendInvitation: false,
        roles: ["write"],
      },
      inviteResponse,
      createdPermissionId: createdPermissionId ?? null,
      permissionGet,
      permissionListAfterInvite: summarizePermissionList(after),
    };

    console.log(prettyJson(report));
  } finally {
    try {
      await deleteItem(oboGraphClient, container.id, tempItem.id);
      cleaned = true;
    } catch (error: unknown) {
      console.error(
        "[cleanup] Failed to delete temp user invite probe item:",
        prettyJson(error instanceof Error ? { message: error.message } : error),
      );
    }

    console.error(
      `[cleanup] temp user invite probe item deleted: ${cleaned ? "yes" : "no"}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error("[fatal]", error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
