import { FrontendApiError } from "../common/errors.ts";
import type {
  IPermissionApiErrorBody,
  IPermissionEntryBaseForUI,
} from "../../common/contracts/permissionCommonContracts";
import type { PermissionEntriesByTab } from "../components/permissions/models/permissionSharedModels";

/**
 * 权限后端 API 失败时抛出的稳定错误类型。
 */
export class PermissionApiError extends FrontendApiError {
  readonly retryAfterSeconds?: number;

  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
    },
  ) {
    super(code, message, {
      name: "PermissionApiError",
      statusCode: options?.statusCode,
    });
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.requestId = options?.requestId;
  }
}

/**
 * 把权限数组重新按 people/groups 分组。
 */
export const mapPermissionEntriesToTabs = <
  TEntry extends IPermissionEntryBaseForUI,
>(
  entries: TEntry[],
): PermissionEntriesByTab<TEntry> => {
  const nextEntries: PermissionEntriesByTab<TEntry> = {
    people: [],
    groups: [],
  };

  for (const entry of entries) {
    nextEntries[entry.principalType].push(entry);
  }

  return nextEntries;
};

/**
 * 解析后端权限 API 的错误响应。
 */
export const buildPermissionApiError = async (
  response: Response,
  operationLabel: string,
): Promise<PermissionApiError> => {
  const payload = await tryReadErrorPayload(response);
  const code = payload?.code ?? "graphFailure";
  const message =
    payload?.message ?? `${operationLabel} failed: ${response.status}`;

  return new PermissionApiError(code, message, {
    retryAfterSeconds: payload?.retryAfterSeconds,
    requestId: payload?.requestId,
    statusCode: payload?.statusCode ?? response.status,
  });
};

const tryReadErrorPayload = async (
  response: Response,
): Promise<IPermissionApiErrorBody | null> => {
  try {
    return (await response.json()) as IPermissionApiErrorBody;
  } catch {
    return null;
  }
};
