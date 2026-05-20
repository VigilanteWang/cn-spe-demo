/**
 * 验证 item permission 的 inheritedFrom 是否会在“父文件夹显式授权 -> 子项继承”场景出现。
 *
 * 验证步骤：
 * 1. 创建一个临时父文件夹
 * 2. 在父文件夹下创建一个子文件夹和一个文本子文件
 * 3. 对父文件夹执行 group invite
 * 4. 读取父文件夹 / 子文件夹 / 子文件 的 permissions
 * 5. 输出三者的原始 payload 与 inheritedFrom 摘要
 * 6. 清理临时对象
 *
 * 说明：
 * - 仅用于当前租户验证，不改正式功能代码
 * - 复用当前前端 client app + 后端 OBO Graph token 路径
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

interface IIdentitySummary {
  id?: string;
  displayName?: string;
  mail?: string;
  alias?: string;
  source: string;
}

interface IPermissionShapeSummary {
  id?: string;
  roles: string[];
  hasInheritedFrom: boolean;
  inheritedFromKeys: string[];
  grantedToKeys: string[];
  grantedToV2Keys: string[];
  grantedToIdentityKinds: string[];
  raw: unknown;
}

interface IItemPermissionProbeSummary {
  label: string;
  itemId: string;
  itemName: string;
  permissionCount: number;
  permissions: IPermissionShapeSummary[];
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
  const fields = ["grantedTo", "grantedToV2", "grantedToIdentities", "grantedToIdentitiesV2"];

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
      // 静默获取失败时再回退到交互式获取。
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

const resolveGroupCandidate = async (
  graphClient: Client,
): Promise<IIdentitySummary | undefined> => {
  const envObjectId = process.env.VALIDATION_GROUP_OBJECT_ID;
  const envEmail = process.env.VALIDATION_GROUP_EMAIL;
  const envAlias = process.env.VALIDATION_GROUP_ALIAS;

  if (envObjectId || envEmail || envAlias) {
    return {
      id: envObjectId,
      mail: envEmail,
      alias: envAlias,
      displayName: "env-specified",
      source: "env",
    };
  }

  const page = await graphClient
    .api("/me/transitiveMemberOf/microsoft.graph.group")
    .version("v1.0")
    .select("id,displayName,mail,mailNickname")
    .top(20)
    .get();

  const groups = Array.isArray(page?.value) ? page.value.map(asRecord) : [];
  const preferred = groups.find(
    (group: JsonRecord) =>
      typeof group.id === "string" &&
      typeof group.mail === "string" &&
      group.mail.length > 0,
  );

  if (!preferred) {
    return undefined;
  }

  return {
    id: typeof preferred.id === "string" ? preferred.id : undefined,
    displayName:
      typeof preferred.displayName === "string"
        ? preferred.displayName
        : undefined,
    mail: typeof preferred.mail === "string" ? preferred.mail : undefined,
    alias:
      typeof preferred.mailNickname === "string"
        ? preferred.mailNickname
        : undefined,
    source: "me.transitiveMemberOf",
  };
};

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
  group: IIdentitySummary,
) => {
  if (!group.id) {
    throw new Error("Group objectId is required for inheritedFrom chain probe.");
  }

  return graphClient
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
};

const listPermissions = async (
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

const summarizePermissionPayload = (
  label: string,
  itemId: string,
  itemName: string,
  payload: unknown,
): IItemPermissionProbeSummary => {
  const record = asRecord(payload);
  const items = Array.isArray(record.value) ? record.value.map(asRecord) : [];

  return {
    label,
    itemId,
    itemName,
    permissionCount: items.length,
    permissions: items.map((permission) => ({
      id: typeof permission.id === "string" ? permission.id : undefined,
      roles: asStringArray(permission.roles),
      hasInheritedFrom: Boolean(permission.inheritedFrom),
      inheritedFromKeys: Object.keys(asRecord(permission.inheritedFrom)).sort(),
      grantedToKeys: Object.keys(asRecord(permission.grantedTo)).sort(),
      grantedToV2Keys: Object.keys(asRecord(permission.grantedToV2)).sort(),
      grantedToIdentityKinds: collectIdentityKinds(permission),
      raw: permission,
    })),
    rawPayload: payload,
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
  const group = await resolveGroupCandidate(directoryGraphClient);

  if (!group) {
    throw new Error("Unable to find a usable group candidate.");
  }

  const stamp = Date.now();
  const parentFolder = await createFolder(
    oboGraphClient,
    container.id,
    "root",
    `_codex_inherited_parent_${stamp}`,
  );
  const childFolder = await createFolder(
    oboGraphClient,
    container.id,
    parentFolder.id,
    `_codex_child_folder_${stamp}`,
  );
  const childFile = await createTextFile(
    oboGraphClient,
    container.id,
    parentFolder.id,
    `_codex_child_file_${stamp}.txt`,
    "inheritedFrom probe",
  );

  let cleaned = false;

  try {
    const inviteResponse = await inviteGroupToItem(
      oboGraphClient,
      container.id,
      parentFolder.id,
      group,
    );

    const parentPermissions = await listPermissions(
      oboGraphClient,
      container.id,
      parentFolder.id,
    );
    const childFolderPermissions = await listPermissions(
      oboGraphClient,
      container.id,
      childFolder.id,
    );
    const childFilePermissions = await listPermissions(
      oboGraphClient,
      container.id,
      childFile.id,
    );

    const report = {
      runAt: new Date().toISOString(),
      container,
      group,
      inviteResponse,
      parentFolder,
      childFolder,
      childFile,
      summaries: [
        summarizePermissionPayload(
          "parentFolder",
          parentFolder.id,
          parentFolder.name,
          parentPermissions,
        ),
        summarizePermissionPayload(
          "childFolder",
          childFolder.id,
          childFolder.name,
          childFolderPermissions,
        ),
        summarizePermissionPayload(
          "childFile",
          childFile.id,
          childFile.name,
          childFilePermissions,
        ),
      ],
    };

    console.log(prettyJson(report));
  } finally {
    try {
      await deleteItem(oboGraphClient, container.id, parentFolder.id);
      cleaned = true;
    } catch (error: unknown) {
      console.error(
        "[cleanup] Failed to delete inheritedFrom probe tree:",
        prettyJson(error instanceof Error ? { message: error.message } : error),
      );
    }

    console.error(
      `[cleanup] inheritedFrom probe parent folder deleted: ${cleaned ? "yes" : "no"}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error("[fatal]", error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
