/**
 * 用对照实验验证两件事：
 * 1. 子项上的 inheritedFrom 是否只会在父文件夹存在显式 item-level permission 后出现
 * 2. container permission 是否不会出现在 item permission 的 inheritedFrom 里
 *
 * 目标组通过环境变量提供：
 * - VALIDATION_GROUP_EMAIL
 *
 * 验证思路：
 * - 先解析目标组
 * - 读取 container permissions，确认该组是否已有 container permission
 * - 创建临时父文件夹、子文件夹、子文件
 * - 在父文件夹未授权前，读取子项 permissions（before）
 * - 对父文件夹执行 group invite
 * - 再读取父/子项 permissions（after）
 * - 输出对照结果并清理
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

interface IResolvedGroup {
  id: string;
  displayName?: string;
  mail?: string;
  alias?: string;
  source: string;
}

interface IItemPermissionSummary {
  label: string;
  permissionCount: number;
  permissions: Array<{
    id?: string;
    roles: string[];
    hasInheritedFrom: boolean;
    inheritedFromIsEmptyObject: boolean;
    grantedToKeys: string[];
    grantedToV2Keys: string[];
  }>;
  rawPayload: unknown;
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
  "GroupMember.Read.All",
];
const targetGroupMail = requiredEnv("VALIDATION_GROUP_EMAIL");

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
      // 静默失败则回退到 device code。
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

const resolveGroupByMail = async (
  graphClient: Client,
  mail: string,
): Promise<IResolvedGroup> => {
  const escapedMail = mail.replace(/'/g, "''");
  const response = await graphClient
    .api("/groups")
    .version("v1.0")
    .filter(`mail eq '${escapedMail}'`)
    .select("id,displayName,mail,mailNickname")
    .top(5)
    .get();

  const groups = Array.isArray(response?.value) ? response.value.map(asRecord) : [];
  const exact = groups.find(
    (group: JsonRecord) =>
      typeof group.id === "string" &&
      typeof group.mail === "string" &&
      group.mail.toLowerCase() === mail.toLowerCase(),
  );

  if (!exact) {
    throw new Error(`Unable to resolve group by mail: ${mail}`);
  }

  return {
    id: String(exact.id),
    displayName:
      typeof exact.displayName === "string" ? exact.displayName : undefined,
    mail: typeof exact.mail === "string" ? exact.mail : undefined,
    alias:
      typeof exact.mailNickname === "string"
        ? exact.mailNickname
        : undefined,
    source: "groups.filter(mail)",
  };
};

const listContainerPermissions = async (graphClient: Client, containerId: string) =>
  graphClient
    .api(`/storage/fileStorage/containers/${encodeURIComponent(containerId)}/permissions`)
    .version("v1.0")
    .get();

const createFolder = async (
  graphClient: Client,
  driveId: string,
  parentItemId: string,
  name: string,
) => {
  const created = await graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children`,
    )
    .version("v1.0")
    .post({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });

  const record = asRecord(created);
  return {
    id: String(record.id),
    name: typeof record.name === "string" ? record.name : name,
  };
};

const createTextFile = async (
  graphClient: Client,
  driveId: string,
  parentItemId: string,
  name: string,
  content: string,
) => {
  const created = await graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(name)}:/content`,
    )
    .version("v1.0")
    .put(Buffer.from(content, "utf8"));

  const record = asRecord(created);
  return {
    id: String(record.id),
    name: typeof record.name === "string" ? record.name : name,
  };
};

const inviteGroupToItem = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  group: IResolvedGroup,
) =>
  graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/invite`,
    )
    .version("v1.0")
    .post({
      recipients: [{ objectId: group.id }],
      requireSignIn: true,
      sendInvitation: false,
      roles: ["read"],
    });

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

const summarizeItemPermissions = (
  label: string,
  payload: unknown,
): IItemPermissionSummary => {
  const record = asRecord(payload);
  const items = Array.isArray(record.value) ? record.value.map(asRecord) : [];

  return {
    label,
    permissionCount: items.length,
    permissions: items.map((permission) => {
      const inheritedFrom = asRecord(permission.inheritedFrom);
      return {
        id: typeof permission.id === "string" ? permission.id : undefined,
        roles: asStringArray(permission.roles),
        hasInheritedFrom: permission.inheritedFrom !== undefined && permission.inheritedFrom !== null,
        inheritedFromIsEmptyObject:
          permission.inheritedFrom !== undefined &&
          permission.inheritedFrom !== null &&
          Object.keys(inheritedFrom).length === 0,
        grantedToKeys: Object.keys(asRecord(permission.grantedTo)).sort(),
        grantedToV2Keys: Object.keys(asRecord(permission.grantedToV2)).sort(),
      };
    }),
    rawPayload: payload,
  };
};

const summarizeContainerPermissionForGroup = (
  payload: unknown,
  group: IResolvedGroup,
) => {
  const items = Array.isArray(asRecord(payload).value)
    ? (asRecord(payload).value as unknown[]).map(asRecord)
    : [];

  const matches = items.filter((permission) => {
    const grantedToV2 = asRecord(permission.grantedToV2);
    const groupRecord = asRecord(grantedToV2.group);
    const siteGroupRecord = asRecord(grantedToV2.siteGroup);
    const grantedTo = asRecord(permission.grantedTo);
    const groupLegacy = asRecord(grantedTo.group);

    return [groupRecord.id, siteGroupRecord.id, groupLegacy.id].some(
      (value) => typeof value === "string" && value === group.id,
    );
  });

  return {
    totalContainerPermissionCount: items.length,
    targetGroupMatchCount: matches.length,
    targetGroupMatches: matches,
  };
};

const deleteItem = async (graphClient: Client, driveId: string, itemId: string) =>
  graphClient
    .api(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`)
    .version("v1.0")
    .delete();

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
  const group = await resolveGroupByMail(directoryGraphClient, targetGroupMail);
  const containerPermissions = await listContainerPermissions(
    oboGraphClient,
    container.id,
  );
  const containerGroupSummary = summarizeContainerPermissionForGroup(
    containerPermissions,
    group,
  );

  const stamp = Date.now();
  const parentFolder = await createFolder(
    oboGraphClient,
    container.id,
    "root",
    `_codex_inherited_control_parent_${stamp}`,
  );
  const childFolder = await createFolder(
    oboGraphClient,
    container.id,
    parentFolder.id,
    `_codex_inherited_control_child_folder_${stamp}`,
  );
  const childFile = await createTextFile(
    oboGraphClient,
    container.id,
    parentFolder.id,
    `_codex_inherited_control_child_file_${stamp}.txt`,
    "control probe",
  );

  let cleaned = false;

  try {
    const beforeChildFolder = await listItemPermissions(
      oboGraphClient,
      container.id,
      childFolder.id,
    );
    const beforeChildFile = await listItemPermissions(
      oboGraphClient,
      container.id,
      childFile.id,
    );

    const inviteResponse = await inviteGroupToItem(
      oboGraphClient,
      container.id,
      parentFolder.id,
      group,
    );

    const afterParent = await listItemPermissions(
      oboGraphClient,
      container.id,
      parentFolder.id,
    );
    const afterChildFolder = await listItemPermissions(
      oboGraphClient,
      container.id,
      childFolder.id,
    );
    const afterChildFile = await listItemPermissions(
      oboGraphClient,
      container.id,
      childFile.id,
    );

    const report = {
      runAt: new Date().toISOString(),
      targetGroupMail,
      container,
      group,
      containerGroupSummary,
      parentFolder,
      childFolder,
      childFile,
      before: {
        childFolder: summarizeItemPermissions("beforeChildFolder", beforeChildFolder),
        childFile: summarizeItemPermissions("beforeChildFile", beforeChildFile),
      },
      inviteResponse,
      after: {
        parentFolder: summarizeItemPermissions("afterParentFolder", afterParent),
        childFolder: summarizeItemPermissions("afterChildFolder", afterChildFolder),
        childFile: summarizeItemPermissions("afterChildFile", afterChildFile),
      },
    };

    console.log(prettyJson(report));
  } finally {
    try {
      await deleteItem(oboGraphClient, container.id, parentFolder.id);
      cleaned = true;
    } catch (error: unknown) {
      console.error(
        "[cleanup] Failed to delete inherited controls probe tree:",
        prettyJson(error instanceof Error ? { message: error.message } : error),
      );
    }

    console.error(
      `[cleanup] inherited controls probe parent folder deleted: ${cleaned ? "yes" : "no"}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error("[fatal]", error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
