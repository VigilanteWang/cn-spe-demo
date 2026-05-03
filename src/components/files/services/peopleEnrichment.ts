import { ResponseType } from "@microsoft/microsoft-graph-client";
import { IDriveItemExtended, UserPresenceStatus } from "../../../common/types";

interface IPeoplePresenceGraphClient {
  api: (path: string) => {
    post: (body: { ids: string[] }) => Promise<{
      value: Array<{
        id: string;
        availability: string;
      }>;
    }>;
  };
}

interface IPeoplePhotoGraphClient {
  api: (path: string) => {
    responseType: (responseType: ResponseType) => {
      get: () => Promise<Blob>;
    };
  };
}

interface IFetchUserPhotoUrlMapOptions {
  userIds: string[];
  graphClient: IPeoplePhotoGraphClient;
  photoCache: Map<string, string>;
}

/**
 * 将 Graph Presence API 返回的 availability 字段映射为 Fluent UI PresenceBadge 使用的状态值。
 * 不认识的值一律归为 "unknown"，避免因 API 变更导致渲染报错。
 */
const mapAvailabilityToPresenceStatus = (
  availability: string,
): UserPresenceStatus => {
  switch (availability) {
    case "Available":
    case "AvailableIdle":
      return "available";
    case "Away":
    case "BeRightBack":
      return "away";
    case "Busy":
    case "BusyIdle":
      return "busy";
    case "DoNotDisturb":
      return "do-not-disturb";
    case "Offline":
    case "PresenceUnknown":
      return "offline";
    case "OutOfOffice":
      return "out-of-office";
    default:
      return "unknown";
  }
};

/**
 * 提取文件列表中所有唯一的修改者用户 ID。
 * @param items 当前目录文件列表。
 * @returns 去重后的用户 ID 数组。
 */
export const collectModifiedByUserIds = (
  items: IDriveItemExtended[],
): string[] => {
  return [
    ...new Set(
      items
        .map((item) => item.modifiedById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
};

/**
 * 拉取指定用户集合的头像 URL 映射。
 *
 * 这里仍然需要先 fetch 二进制再转 object URL，原因是 Graph 头像接口要求 Authorization 头，
 * 浏览器原生 img src 不能附带 Bearer token。为减少重复拉取，这里复用会话级 photoCache。
 *
 * @param options 拉取头像所需参数。
 * @returns userId 到 object URL 的映射。
 */
export const fetchUserPhotoUrlMap = async ({
  userIds,
  graphClient,
  photoCache,
}: IFetchUserPhotoUrlMapOptions): Promise<Map<string, string>> => {
  const photoMap = new Map<string, string>();
  const missingUserIds: string[] = [];

  userIds.forEach((userId) => {
    const cachedPhotoUrl = photoCache.get(userId);

    if (cachedPhotoUrl) {
      photoMap.set(userId, cachedPhotoUrl);
      return;
    }

    missingUserIds.push(userId);
  });

  if (missingUserIds.length === 0) {
    return photoMap;
  }

  const fetchedEntries = await Promise.all(
    missingUserIds.map(async (userId) => {
      try {
        const photoBlob = await graphClient
          .api(`/users/${userId}/photos/48x48/$value`)
          .responseType(ResponseType.BLOB)
          .get();
        const photoUrl = URL.createObjectURL(photoBlob);
        photoCache.set(userId, photoUrl);
        return [userId, photoUrl] as const;
      } catch {
        return [userId, undefined] as const;
      }
    }),
  );

  fetchedEntries.forEach(([userId, photoUrl]) => {
    if (!photoUrl) {
      return;
    }

    photoMap.set(userId, photoUrl);
  });

  return photoMap;
};

/**
 * 批量拉取指定用户集合的 Teams 在线状态。
 * @param graphClient Graph 客户端。
 * @param userIds 需要查询的用户 ID。
 * @returns userId 到 PresenceBadge 状态值的映射。
 */
export const fetchUserPresenceMap = async (
  graphClient: IPeoplePresenceGraphClient,
  userIds: string[],
): Promise<Map<string, UserPresenceStatus>> => {
  if (userIds.length === 0) {
    return new Map<string, UserPresenceStatus>();
  }

  const presenceResponse = await graphClient
    .api("/communications/getPresencesByUserId")
    .post({ ids: userIds });

  return new Map<string, UserPresenceStatus>(
    presenceResponse.value.map(({ id, availability }) => [
      id,
      mapAvailabilityToPresenceStatus(availability),
    ]),
  );
};