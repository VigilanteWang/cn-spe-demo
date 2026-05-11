import { Request, Response } from "restify";
import {
  authorizeContainerManageRequest,
  createGraphClient,
  getGraphToken,
} from "./auth";
import {
  getContainerPermissionsErrorStatus,
  mapContainerPermissionsGraphError,
  toContainerPermissionsApiErrorBody,
} from "./containerPermissionsError";
import {
  ContainerPermissionUiRole,
  mapGraphContainerPermissionRoleToUi,
  mapUiContainerPermissionRoleToGraph,
} from "./containerPermissionRoleMapper";

type PermissionTabValue = "people" | "groups";

interface IContainerPermissionEntryDto {
  id: string;
  permissionId: string;
  principalId: string;
  principalLookupKey?: string;
  principalUserPrincipalName?: string;
  principalName: string;
  principalType: PermissionTabValue;
  description: string;
  role: ContainerPermissionUiRole;
}

interface IContainerPermissionsResponse {
  entries: IContainerPermissionEntryDto[];
}

/**
 * people 新增权限请求体。
 *
 * Graph 要求通过 userPrincipalName 指定目标用户。
 */
interface ICreatePeopleContainerPermissionChange {
  principalType: "people";
  principalId: string;
  userPrincipalName: string;
  role: ContainerPermissionUiRole;
}

/**
 * groups 新增权限请求体。
 *
 * group 分支继续使用稳定 group id。
 */
interface ICreateGroupContainerPermissionChange {
  principalType: "groups";
  principalId: string;
  role: ContainerPermissionUiRole;
}

type ICreateContainerPermissionChange =
  | ICreatePeopleContainerPermissionChange
  | ICreateGroupContainerPermissionChange;

interface IUpdateContainerPermissionChange {
  permissionId: string;
  role: ContainerPermissionUiRole;
}

interface IDeleteContainerPermissionChange {
  permissionId: string;
}

interface IContainerPermissionChangeSet {
  create: ICreateContainerPermissionChange[];
  update: IUpdateContainerPermissionChange[];
  delete: IDeleteContainerPermissionChange[];
}

interface IGraphRequest {
  version: (value: string) => IGraphRequest;
  header: (name: string, value: string) => IGraphRequest;
  get: () => Promise<unknown>;
  post: (body: unknown) => Promise<unknown>;
  patch: (body: unknown) => Promise<unknown>;
  delete: () => Promise<unknown>;
}

interface IGraphClient {
  api: (path: string) => IGraphRequest;
}

interface IGraphPermissionIdentity {
  graphId?: string;
  displayName: string;
  description: string;
  lookupKey?: string;
  userPrincipalName?: string;
}

/**
 * 读取指定容器的真实权限列表，并映射成前端 access list 视图模型。
 */
export const listContainerPermissions = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await authorizeContainerManageRequest(req);

  if (!authorizationResult.ok) {
    res.send(authorizationResult.status, authorizationResult.body);
    return;
  }

  const containerId = readContainerId(req);

  if (!containerId) {
    res.send(400, {
      code: "invalidRequest",
      message: "containerId route parameter is required.",
      statusCode: 400,
    });
    return;
  }

  try {
    const graphToken = await getGraphToken(authorizationResult.token);
    const graphClient = createGraphClient(graphToken) as unknown as IGraphClient;
    const entries = await fetchContainerPermissionEntries(graphClient, containerId);

    const responseBody: IContainerPermissionsResponse = { entries };
    res.send(200, responseBody);
  } catch (error: unknown) {
    sendMappedContainerPermissionError(res, error);
  }
};

/**
 * 顺序执行新增、更新、删除权限，再返回服务端最新权限列表。
 */
export const applyContainerPermissions = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await authorizeContainerManageRequest(req);

  if (!authorizationResult.ok) {
    res.send(authorizationResult.status, authorizationResult.body);
    return;
  }

  const containerId = readContainerId(req);

  if (!containerId) {
    res.send(400, {
      code: "invalidRequest",
      message: "containerId route parameter is required.",
      statusCode: 400,
    });
    return;
  }

  const changeSet = readChangeSet(req.body);

  if (!changeSet) {
    res.send(400, {
      code: "invalidRequest",
      message: "create, update and delete arrays are required.",
      statusCode: 400,
    });
    return;
  }

  try {
    const graphToken = await getGraphToken(authorizationResult.token);
    const graphClient = createGraphClient(graphToken) as unknown as IGraphClient;

    await applyContainerPermissionChangeSet(graphClient, containerId, changeSet);

    const entries = await fetchContainerPermissionEntries(graphClient, containerId);
    const responseBody: IContainerPermissionsResponse = { entries };
    res.send(200, responseBody);
  } catch (error: unknown) {
    sendMappedContainerPermissionError(res, error);
  }
};

/**
 * 真实读取 Graph 容器权限列表。
 */
export const fetchContainerPermissionEntries = async (
  graphClient: IGraphClient,
  containerId: string,
): Promise<IContainerPermissionEntryDto[]> => {
  try {
    const response = await graphClient
      .api(getContainerPermissionsPath(containerId))
      .version("v1.0")
      .get();

    const responseRecord = readRecord(response);
    const permissionItems = responseRecord.value;

    if (!Array.isArray(permissionItems)) {
      return [];
    }

    return permissionItems.map(mapGraphPermissionToEntry);
  } catch (error: unknown) {
    throw mapContainerPermissionsGraphError(error);
  }
};

/**
 * 顺序执行权限变更。
 *
 * 这里故意不用并发批量写入：
 * - 容器权限数量通常不大；
 * - 顺序写入更容易控制节流和失败定位；
 * - 与本次“最小可用后端能力”的目标更匹配。
 */
export const applyContainerPermissionChangeSet = async (
  graphClient: IGraphClient,
  containerId: string,
  changeSet: IContainerPermissionChangeSet,
): Promise<void> => {
  try {
    for (const deleteChange of changeSet.delete) {
      await graphClient
        .api(getSingleContainerPermissionPath(containerId, deleteChange.permissionId))
        .version("v1.0")
        .header("Prefer", "onlyRemoveContainerScopedPermission")
        .delete();
    }

    for (const updateChange of changeSet.update) {
      await graphClient
        .api(getSingleContainerPermissionPath(containerId, updateChange.permissionId))
        .version("v1.0")
        .patch({
          roles: [mapUiContainerPermissionRoleToGraph(updateChange.role)],
        });
    }

    for (const createChange of changeSet.create) {
      await graphClient
        .api(getContainerPermissionsPath(containerId))
        .version("v1.0")
        .post(createGraphCreatePermissionBody(createChange));
    }
  } catch (error: unknown) {
    throw mapContainerPermissionsGraphError(error);
  }
};

/**
 * 把 Graph permission 对象映射成前端 access list 行数据。
 */
const mapGraphPermissionToEntry = (
  permission: unknown,
): IContainerPermissionEntryDto => {
  const permissionRecord = readRecord(permission);
  const permissionId = readRequiredString(permissionRecord.id, "permission id");
  const roles = readStringArray(permissionRecord.roles);
  const grantedToV2 = readRecord(permissionRecord.grantedToV2);
  const principal =
    readGraphPermissionIdentity(grantedToV2.user) ??
    readGraphPermissionIdentity(grantedToV2.siteUser) ??
    readGraphPermissionIdentity(grantedToV2.group) ??
    readGraphPermissionIdentity(grantedToV2.siteGroup);

  if (!principal) {
    throw new Error(`Permission ${permissionId} is missing grantedToV2 identity.`);
  }

  const principalType =
    grantedToV2.user || grantedToV2.siteUser ? "people" : "groups";
  const primaryRole = roles[0] ?? "reader";

  return {
    // 现有权限列表使用 permissionId 作为行级唯一键，
    // 避免把“Graph 是否返回了 principal object id”错误地当成列表稳定性的前提。
    id: `permission:${permissionId}`,
    permissionId,
    // 对“已有权限读取”来说，Graph 有时只返回 email / UPN，不返回 user.id。
    // 因此这里允许 people 回退到仅供前端本地识别的合成 id。
    // groups 的真实响应通常会带 group.id，因此仍然优先保留稳定 id。
    principalId:
      principal.graphId ??
      createFallbackPrincipalId(principalType, permissionId, principal.lookupKey),
    principalLookupKey: principal.lookupKey,
    principalUserPrincipalName:
      principalType === "people" ? principal.userPrincipalName : undefined,
    principalName: principal.displayName,
    principalType,
    description: principal.description,
    role: mapGraphContainerPermissionRoleToUi(primaryRole),
  };
};

/**
 * 从 Graph identity 对象里提取前端真正需要的最小字段。
 */
const readGraphPermissionIdentity = (
  identity: unknown,
): IGraphPermissionIdentity | null => {
  if (!identity) {
    return null;
  }

  const record = readRecord(identity);
  const graphId = readOptionalString(record.id);
  const userPrincipalName = readOptionalString(record.userPrincipalName);
  const lookupKey = normalizeLookupKey(
    userPrincipalName ??
      readOptionalString(record.email) ??
      readOptionalString(record.mail) ??
      readOptionalString(record.loginName),
  );
  const displayName =
    readOptionalString(record.displayName) ??
    readOptionalString(record.email) ??
    userPrincipalName ??
    readOptionalString(record.mail) ??
    readOptionalString(record.loginName) ??
    graphId ??
    "Unknown principal";
  const description =
    readOptionalString(record.email) ??
    userPrincipalName ??
    readOptionalString(record.mail) ??
    readOptionalString(record.loginName) ??
    "";

  return {
    graphId,
    displayName,
    description,
    lookupKey,
    userPrincipalName,
  };
};

/**
 * people 没有返回 object id 时，生成仅供前端本地识别的回退 id。
 *
 * groups 的真实响应通常会带 group id；
 * people 才更常见只有 email / UPN，没有 user object id。
 */
const createFallbackPrincipalId = (
  principalType: PermissionTabValue,
  permissionId: string,
  lookupKey?: string,
): string => {
  if (lookupKey) {
    return `${principalType}:lookup:${lookupKey}`;
  }

  return `${principalType}:permission:${permissionId}`;
};

/**
 * 把新增权限差异转换成 Graph create permission 请求体。
 *
 * 这里显式区分 people / groups：
 * - people 使用 userPrincipalName
 * - groups 使用稳定 group id
 */
const createGraphCreatePermissionBody = (
  createChange: ICreateContainerPermissionChange,
): {
  roles: string[];
  grantedToV2: {
    user?: { userPrincipalName: string };
    group?: { id: string };
  };
} => {
  if (createChange.principalType === "people") {
    return {
      roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
      grantedToV2: {
        user: {
          userPrincipalName: createChange.userPrincipalName,
        },
      },
    };
  }

  return {
    roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
    grantedToV2: {
      group: {
        id: createChange.principalId,
      },
    },
  };
};

/**
 * 统一发送映射后的错误响应。
 */
const sendMappedContainerPermissionError = (
  res: Response,
  error: unknown,
) => {
  const mappedError = mapContainerPermissionsGraphError(error);
  res.send(
    getContainerPermissionsErrorStatus(mappedError),
    toContainerPermissionsApiErrorBody(mappedError),
  );
};

/**
 * 读取容器 id 路由参数。
 */
const readContainerId = (req: Request): string | undefined => {
  const paramsRecord = readRecord(req.params);
  return readOptionalString(paramsRecord.containerId);
};

/**
 * 读取并校验 apply 请求体。
 */
const readChangeSet = (body: unknown): IContainerPermissionChangeSet | null => {
  const bodyRecord = readRecord(body);
  const create = bodyRecord.create;
  const update = bodyRecord.update;
  const remove = bodyRecord.delete;

  if (!Array.isArray(create) || !Array.isArray(update) || !Array.isArray(remove)) {
    return null;
  }

  return {
    create: create.map(mapCreateChange),
    update: update.map(mapUpdateChange),
    delete: remove.map(mapDeleteChange),
  };
};

const mapCreateChange = (change: unknown): ICreateContainerPermissionChange => {
  const record = readRecord(change);
  const principalType = readPrincipalType(record.principalType);

  if (principalType === "people") {
    return {
      principalType: "people",
      principalId: readRequiredString(record.principalId, "create principalId"),
      userPrincipalName: readRequiredString(
        record.userPrincipalName,
        "create userPrincipalName",
      ),
      role: readUiRole(record.role),
    };
  }

  return {
    principalType: "groups",
    principalId: readRequiredString(record.principalId, "create principalId"),
    role: readUiRole(record.role),
  };
};

const mapUpdateChange = (change: unknown): IUpdateContainerPermissionChange => {
  const record = readRecord(change);

  return {
    permissionId: readRequiredString(record.permissionId, "update permissionId"),
    role: readUiRole(record.role),
  };
};

const mapDeleteChange = (change: unknown): IDeleteContainerPermissionChange => {
  const record = readRecord(change);

  return {
    permissionId: readRequiredString(record.permissionId, "delete permissionId"),
  };
};

const readUiRole = (value: unknown): ContainerPermissionUiRole => {
  if (
    value === "Reader" ||
    value === "Writer" ||
    value === "Manager" ||
    value === "Owner"
  ) {
    return value;
  }

  throw new Error(`Unsupported container permission UI role: ${String(value)}`);
};

const readPrincipalType = (value: unknown): PermissionTabValue => {
  if (value === "people" || value === "groups") {
    return value;
  }

  throw new Error(`Unsupported permission principal type: ${String(value)}`);
};

const getContainerPermissionsPath = (containerId: string): string =>
  `/storage/fileStorage/containers/${encodeURIComponent(containerId)}/permissions`;

const getSingleContainerPermissionPath = (
  containerId: string,
  permissionId: string,
): string =>
  `${getContainerPermissionsPath(containerId)}/${encodeURIComponent(permissionId)}`;

const readRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

const normalizeLookupKey = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const readRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw new Error(`Missing required ${fieldName}.`);
};
