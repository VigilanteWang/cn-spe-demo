/**
 * Item permission 最小验证脚本。
 *
 * 目标：
 * 1. 复用当前仓库的前端登录配置和后端 OBO 配置
 * 2. 在真实 delegated + OBO 路径下验证 item permission 的关键 Graph API
 * 3. 输出可直接写入验证文档的原始 payload、成功/失败结果与风险提示
 *
 * 使用方式：
 * - 默认会尝试通过 device code 登录当前租户用户
 * - 默认自动挑选第一个可用容器，并在 root 下创建临时文件夹作为测试 item
 * - 可通过环境变量覆盖容器或 group 选择：
 *   - VALIDATION_CONTAINER_ID
 *   - VALIDATION_GROUP_OBJECT_ID
 *   - VALIDATION_GROUP_EMAIL
 *   - VALIDATION_GROUP_ALIAS
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

type InviteRecipientMode = "objectId" | "email" | "alias";

interface IInviteProbeResult {
  mode: InviteRecipientMode;
  attemptedRecipient: JsonRecord;
  ok: boolean;
  permissionId?: string;
  inviteResponseBody?: unknown;
  permissionAfterGet?: unknown;
  roleAfterCreate?: string[];
  patch?: {
    ok: boolean;
    responseStatus?: number;
    responseBody?: unknown;
    permissionAfterPatchGet?: unknown;
    roleAfterPatch?: string[];
  };
  delete?: {
    ok: boolean;
    responseStatus?: number;
    responseBody?: unknown;
  };
  error?: {
    message: string;
    status?: number;
    code?: string;
    body?: unknown;
  };
}

interface IValidationReport {
  runAt: string;
  cloudEnv: string;
  graphBaseUrl: string;
  apiAuthority: string;
  apiClientId: string;
  clientClientId: string;
  tenantId: string;
  selectedContainer: {
    id: string;
    displayName?: string;
  };
  tempItem: {
    id: string;
    name?: string;
    webUrl?: string;
  };
  user: {
    id?: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
  graphTokenScopes: string[];
  apiTokenAudience?: string;
  itemPermissionListBeforeInvite: {
    permissionCount: number;
    inheritedPermissionCount: number;
    explicitPermissionCount: number;
    inheritedFromShapes: Array<{
      id?: string;
      hasInheritedFrom: boolean;
      inheritedFromKeys: string[];
      roles: string[];
      principalKinds: string[];
    }>;
    samplePayload: unknown;
  };
  groupCandidate?: {
    id?: string;
    displayName?: string;
    mail?: string;
    alias?: string;
    source: string;
  };
  inviteProbes: IInviteProbeResult[];
  conclusions: {
    requiresAdditionalFilesDelegatedPermission: boolean | "unknown";
    inheritedFromStableInSample: boolean | "unknown";
    inviteCreatedPermissionPatchable: boolean | "unknown";
    preferredGroupRecipientIdentifier: InviteRecipientMode | "unknown";
  };
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
const publicGraphScopes = [
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
    authProvider: (done) => {
      done(null, accessToken);
    },
    defaultVersion: "v1.0",
    baseUrl: serverConfig.graphBaseUrl,
    customHosts: new Set([graphHost]),
  });

const readTokenPayload = (token: string): JsonRecord => {
  const [, payload] = token.split(".");
  if (!payload) {
    return {};
  }

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as JsonRecord;
};

const splitScopes = (value: unknown): string[] =>
  typeof value === "string" ? value.split(" ").filter(Boolean) : [];

const prettyJson = (value: unknown): string => JSON.stringify(value, null, 2);

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" ? (value as JsonRecord) : {};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const collectPrincipalKinds = (permission: JsonRecord): string[] => {
  const keys = [
    "grantedToV2",
    "grantedToIdentitiesV2",
    "grantedTo",
    "grantedToIdentities",
    "invitation",
    "link",
  ];

  const kinds = new Set<string>();

  for (const key of keys) {
    const value = permission[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const record = asRecord(item);
        for (const nestedKey of Object.keys(record)) {
          kinds.add(`${key}.${nestedKey}`);
        }
      }
      continue;
    }

    const record = asRecord(value);
    for (const nestedKey of Object.keys(record)) {
      kinds.add(`${key}.${nestedKey}`);
    }
  }

  return Array.from(kinds).sort();
};

const getGraphErrorDetails = (error: unknown): {
  message: string;
  status?: number;
  code?: string;
  body?: unknown;
} => {
  if (error instanceof Error) {
    const maybeStatus = (error as Error & { statusCode?: number }).statusCode;
    const maybeBody = asRecord(error as unknown as JsonRecord).body;
    const graphError = asRecord(asRecord(maybeBody).error);
    return {
      message: error.message,
      status: typeof maybeStatus === "number" ? maybeStatus : undefined,
      code:
        typeof graphError.code === "string"
          ? graphError.code
          : typeof asRecord(error as unknown as JsonRecord).code === "string"
            ? (asRecord(error as unknown as JsonRecord).code as string)
            : undefined,
      body: maybeBody,
    };
  }

  return {
    message: String(error),
  };
};

const acquireToken = async (
  scopes: string[],
  label: string,
): Promise<AuthenticationResult> => {
  const accounts = await publicClient.getAllAccounts();
  const firstAccount = accounts[0];

  if (firstAccount) {
    try {
      return await publicClient.acquireTokenSilent({
        account: firstAccount,
        scopes,
      });
    } catch {
      // 静默获取失败时回退到 device code，继续沿用同一账号登录上下文。
    }
  }

  console.log(`\n[auth] 开始获取 ${label} token...`);
  try {
    const result = await publicClient.acquireTokenByDeviceCode({
      scopes,
      deviceCodeCallback: (response) => {
        console.log(`\n[device-code] ${response.message}\n`);
      },
    });

    if (!result) {
      throw new Error(`Device code login for ${label} returned no token.`);
    }

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // 某些前端 app registration 不支持 device code，此时回退到浏览器交互登录。
    if (!message.includes("invalid_client")) {
      throw error;
    }

    console.log(
      `\n[auth] ${label} token 的 device code 不可用，回退到浏览器交互登录...\n`,
    );

    const interactiveResult = await publicClient.acquireTokenInteractive({
      scopes,
      openBrowser: async (url: string) => {
        console.log(`[interactive-login-url] ${url}`);
      },
      successTemplate:
        "<html><body><h2>Login complete.</h2><p>You can close this window and return to Codex.</p></body></html>",
    });

    if (!interactiveResult) {
      throw new Error(`Interactive login for ${label} returned no token.`);
    }

    return interactiveResult;
  }
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

const createTempFolder = async (graphClient: Client, driveId: string) => {
  const folderName = `_codex_item_permission_probe_${Date.now()}`;
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
  recipients: JsonRecord[],
  role: "read" | "write",
) =>
  graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/invite`,
    )
    .version("v1.0")
    .post({
      recipients,
      requireSignIn: true,
      sendInvitation: false,
      roles: [role],
    });

const patchPermission = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  permissionId: string,
  role: "read" | "write",
) =>
  graphClient
    .api(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/permissions/${encodeURIComponent(permissionId)}`,
    )
    .version("v1.0")
    .patch({
      roles: [role],
    });

const deletePermission = async (
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
    .delete();

const deleteItem = async (graphClient: Client, driveId: string, itemId: string) =>
  graphClient
    .api(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`)
    .version("v1.0")
    .delete();

const summarizePermissionList = (payload: unknown) => {
  const record = asRecord(payload);
  const items = Array.isArray(record.value) ? record.value.map(asRecord) : [];
  const inherited = items.filter((item) => item.inheritedFrom);
  const explicit = items.filter((item) => !item.inheritedFrom);

  return {
    permissionCount: items.length,
    inheritedPermissionCount: inherited.length,
    explicitPermissionCount: explicit.length,
    inheritedFromShapes: items.map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      hasInheritedFrom: Boolean(item.inheritedFrom),
      inheritedFromKeys: Object.keys(asRecord(item.inheritedFrom)).sort(),
      roles: asStringArray(item.roles),
      principalKinds: collectPrincipalKinds(item),
    })),
    samplePayload: payload,
  };
};

const resolveGroupCandidate = async (graphClient: Client) => {
  const envObjectId = process.env.VALIDATION_GROUP_OBJECT_ID;
  const envEmail = process.env.VALIDATION_GROUP_EMAIL;
  const envAlias = process.env.VALIDATION_GROUP_ALIAS;

  if (envObjectId || envEmail || envAlias) {
    return {
      id: envObjectId,
      displayName: "env-specified",
      mail: envEmail,
      alias: envAlias,
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
      (typeof group.mail === "string" || typeof group.mailNickname === "string"),
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

const inviteWithRecipientMode = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  groupCandidate: NonNullable<Awaited<ReturnType<typeof resolveGroupCandidate>>>,
  mode: InviteRecipientMode,
  role: "read" | "write",
): Promise<IInviteProbeResult> => {
  const recipient =
    mode === "objectId"
      ? { objectId: groupCandidate.id }
      : mode === "email"
        ? { email: groupCandidate.mail }
        : { alias: groupCandidate.alias };

  const normalizedRecipient = Object.fromEntries(
    Object.entries(recipient).filter(([, value]) => Boolean(value)),
  );

  if (Object.keys(normalizedRecipient).length === 0) {
    return {
      mode,
      attemptedRecipient: normalizedRecipient,
      ok: false,
      error: {
        message: `No usable ${mode} value found for group candidate.`,
      },
    };
  }

  try {
    const inviteResponse = await createInvite(
      graphClient,
      driveId,
      itemId,
      [normalizedRecipient],
      role,
    );
    const inviteRecord = asRecord(inviteResponse);
    const permissions = Array.isArray(inviteRecord.value)
      ? inviteRecord.value.map(asRecord)
      : [];
    const createdPermission = permissions[0] ?? {};
    const permissionId =
      typeof createdPermission.id === "string" ? createdPermission.id : undefined;

    const result: IInviteProbeResult = {
      mode,
      attemptedRecipient: normalizedRecipient,
      ok: true,
      permissionId,
      inviteResponseBody: inviteResponse,
      roleAfterCreate: asStringArray(createdPermission.roles),
    };

    if (permissionId) {
      const createdPermissionGet = await getItemPermission(
        graphClient,
        driveId,
        itemId,
        permissionId,
      );
      result.permissionAfterGet = createdPermissionGet;

      try {
        await patchPermission(
          graphClient,
          driveId,
          itemId,
          permissionId,
          role === "read" ? "write" : "read",
        );
        const patchedPermissionGet = await getItemPermission(
          graphClient,
          driveId,
          itemId,
          permissionId,
        );
        const patchedRecord = asRecord(patchedPermissionGet);
        result.patch = {
          ok: true,
          roleAfterPatch: asStringArray(patchedRecord.roles),
          permissionAfterPatchGet: patchedPermissionGet,
        };
      } catch (error: unknown) {
        const details = getGraphErrorDetails(error);
        result.patch = {
          ok: false,
          responseStatus: details.status,
          responseBody: details.body,
        };
      }

      try {
        await deletePermission(graphClient, driveId, itemId, permissionId);
        result.delete = { ok: true, responseStatus: 204 };
      } catch (error: unknown) {
        const details = getGraphErrorDetails(error);
        result.delete = {
          ok: false,
          responseStatus: details.status,
          responseBody: details.body,
        };
      }
    }

    return result;
  } catch (error: unknown) {
    return {
      mode,
      attemptedRecipient: normalizedRecipient,
      ok: false,
      error: getGraphErrorDetails(error),
    };
  }
};

async function main(): Promise<void> {
  const apiAuthResult = await acquireToken([apiScope], "API");
  if (!apiAuthResult.accessToken) {
    throw new Error("Unable to acquire API access token.");
  }

  const graphDirectoryResult = await acquireToken(
    publicGraphScopes,
    "Graph directory",
  );
  if (!graphDirectoryResult.accessToken) {
    throw new Error("Unable to acquire Graph directory token.");
  }

  const oboGraphToken = await acquireGraphOboToken(apiAuthResult.accessToken);
  const oboGraphPayload = readTokenPayload(oboGraphToken);
  const apiPayload = readTokenPayload(apiAuthResult.accessToken);

  const oboGraphClient = createGraphClient(oboGraphToken);
  const directoryGraphClient = createGraphClient(graphDirectoryResult.accessToken);

  const selectedContainer = await pickContainer(oboGraphClient);
  const tempItem = await createTempFolder(oboGraphClient, selectedContainer.id);

  let tempItemDeleted = false;

  try {
    const me = await directoryGraphClient.api("/me").version("v1.0").get();
    const groupCandidate = await resolveGroupCandidate(directoryGraphClient);

    const listBeforeInvite = await listItemPermissions(
      oboGraphClient,
      selectedContainer.id,
      tempItem.id,
    );

    const inviteProbes: IInviteProbeResult[] = [];

    if (groupCandidate) {
      inviteProbes.push(
        await inviteWithRecipientMode(
          oboGraphClient,
          selectedContainer.id,
          tempItem.id,
          groupCandidate,
          "objectId",
          "read",
        ),
      );
      inviteProbes.push(
        await inviteWithRecipientMode(
          oboGraphClient,
          selectedContainer.id,
          tempItem.id,
          groupCandidate,
          "email",
          "write",
        ),
      );
      inviteProbes.push(
        await inviteWithRecipientMode(
          oboGraphClient,
          selectedContainer.id,
          tempItem.id,
          groupCandidate,
          "alias",
          "read",
        ),
      );
    }

    const report: IValidationReport = {
      runAt: new Date().toISOString(),
      cloudEnv: serverConfig.cloudEnv,
      graphBaseUrl: serverConfig.graphBaseUrl,
      apiAuthority: serverConfig.authority,
      apiClientId: serverConfig.clientId,
      clientClientId,
      tenantId: serverConfig.tenantId,
      selectedContainer,
      tempItem,
      user: {
        id: typeof me.id === "string" ? me.id : undefined,
        displayName:
          typeof me.displayName === "string" ? me.displayName : undefined,
        mail: typeof me.mail === "string" ? me.mail : undefined,
        userPrincipalName:
          typeof me.userPrincipalName === "string"
            ? me.userPrincipalName
            : undefined,
      },
      graphTokenScopes: splitScopes(oboGraphPayload.scp),
      apiTokenAudience:
        typeof apiPayload.aud === "string" ? apiPayload.aud : undefined,
      itemPermissionListBeforeInvite: summarizePermissionList(listBeforeInvite),
      groupCandidate,
      inviteProbes,
      conclusions: {
        requiresAdditionalFilesDelegatedPermission: !splitScopes(
          oboGraphPayload.scp,
        ).includes("FileStorageContainer.Selected")
          ? "unknown"
          : false,
        inheritedFromStableInSample: (() => {
          const summary = summarizePermissionList(listBeforeInvite);
          if (summary.inheritedPermissionCount === 0) {
            return "unknown";
          }

          const inheritedRows = summary.inheritedFromShapes.filter(
            (item) => item.hasInheritedFrom,
          );
          const explicitRows = summary.inheritedFromShapes.filter(
            (item) => !item.hasInheritedFrom,
          );

          return (
            inheritedRows.length > 0 &&
            inheritedRows.every((item) => item.inheritedFromKeys.length > 0) &&
            explicitRows.every((item) => item.inheritedFromKeys.length === 0)
          );
        })(),
        inviteCreatedPermissionPatchable: inviteProbes.some(
          (probe) => probe.patch?.ok,
        )
          ? true
          : inviteProbes.some((probe) => probe.permissionId && probe.patch?.ok === false)
            ? false
            : "unknown",
        preferredGroupRecipientIdentifier:
          inviteProbes.find((probe) => probe.ok)?.mode ?? "unknown",
      },
    };

    console.log(prettyJson(report));
  } finally {
    try {
      await deleteItem(oboGraphClient, selectedContainer.id, tempItem.id);
      tempItemDeleted = true;
    } catch (error: unknown) {
      console.error(
        "[cleanup] Failed to delete temp validation item:",
        prettyJson(getGraphErrorDetails(error)),
      );
    }

    console.error(
      `[cleanup] temp item ${tempItem.id} deleted: ${tempItemDeleted ? "yes" : "no"}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error("[fatal]", error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
