import { ResponseType } from "@microsoft/microsoft-graph-client";
import {
  IDriveItemExtended,
  IUserPresenceBadgeState,
  UserPresenceStatus,
} from "../../../common/types";

// Presence 场景只依赖 GraphClient 的 api().post() 能力，这里用最小接口约束，
// 让单测更容易 mock，也降低对完整 SDK 类型的耦合。
interface IPeoplePresenceGraphClient {
  api: (path: string) => {
    post: (body: { ids: string[] }) => Promise<{
      value: Array<{
        id: string;
        availability?: string;
        activity?: string;
        outOfOfficeSettings?: {
          isOutOfOffice?: boolean;
        };
      }>;
    }>;
  };
}

// 头像场景只需要请求 Blob，因此只声明 api().responseType().get() 这部分能力。
interface IPeoplePhotoGraphClient {
  api: (path: string) => {
    responseType: (responseType: ResponseType) => {
      get: () => Promise<Blob>;
    };
  };
}

interface IFetchUserPhotoUrlMapOptions {
  // 需要拉头像的用户 ID 列表。
  userIds: string[];
  // 可执行 Graph 请求的客户端。
  graphClient: IPeoplePhotoGraphClient;
  // 复用缓存：避免同一个用户头像被重复下载。
  photoCache: Map<string, string>;
}

/**
 * 统一清洗 Graph presence 字符串值。
 * 例如 "DoNotDisturb"、"do-not-disturb"、"do_not_disturb" 都会归一化。
 */
const normalizePresenceToken = (rawToken: string | undefined): string => {
  if (!rawToken) {
    return "";
  }

  return rawToken.replace(/[^a-zA-Z]/g, "").toLowerCase();
};

/**
 * 根据 Graph availability + activity + OOF 信号生成 Fluent UI PresenceBadge 视图状态。
 *
 * 说明：
 * 1. 基础 status 由 availability/activity 联合判定。
 * 2. OOF 独立为布尔值，通过 PresenceBadge 的 outOfOffice 属性叠加显示。
 */
export const mapGraphPresenceToBadgeState = (presence: {
  availability?: string;
  activity?: string;
  outOfOfficeSettings?: {
    isOutOfOffice?: boolean;
  };
}): IUserPresenceBadgeState => {
  const normalizedAvailability = normalizePresenceToken(presence.availability);
  const normalizedActivity = normalizePresenceToken(presence.activity);

  // OOF 优先读取专用字段，同时兼容部分响应中 availability/activity 直接返回 outOfOffice 的场景。
  const outOfOffice =
    presence.outOfOfficeSettings?.isOutOfOffice === true ||
    normalizedAvailability === "outofoffice" ||
    normalizedActivity === "outofoffice";

  let status: UserPresenceStatus = "unknown";

  // 优先匹配 DND 体系（含 presenting / focusing）。
  if (
    normalizedAvailability === "donotdisturb" ||
    normalizedAvailability === "presenting" ||
    normalizedAvailability === "focusing" ||
    normalizedActivity === "donotdisturb" ||
    normalizedActivity === "presenting" ||
    normalizedActivity === "focusing"
  ) {
    status = "do-not-disturb";
  } else if (
    // busy 体系包含 in a call / in a meeting。
    normalizedAvailability === "busy" ||
    normalizedAvailability === "busyidle" ||
    normalizedAvailability === "inacall" ||
    normalizedAvailability === "inameeting" ||
    normalizedActivity === "busy" ||
    normalizedActivity === "busyidle" ||
    normalizedActivity === "inacall" ||
    normalizedActivity === "inameeting"
  ) {
    status = "busy";
  } else if (
    // away 体系覆盖 be right back 与 idle。
    normalizedAvailability === "away" ||
    normalizedAvailability === "berightback" ||
    normalizedAvailability === "availableidle" ||
    normalizedActivity === "away" ||
    normalizedActivity === "berightback"
  ) {
    status = "away";
  } else if (
    normalizedAvailability === "available" ||
    normalizedActivity === "available"
  ) {
    status = "available";
  } else if (
    normalizedAvailability === "offline" ||
    normalizedAvailability === "offwork" ||
    normalizedAvailability === "presenceunknown" ||
    normalizedActivity === "offline" ||
    normalizedActivity === "offwork" ||
    normalizedActivity === "presenceunknown"
  ) {
    status = "offline";
  }

  return {
    status,
    outOfOffice,
  };
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
    // Set 负责去重，避免后续批量查询时同一用户被重复请求。
    ...new Set(
      items
        // 抽取每个条目的修改者 ID。
        .map((item) => item.modifiedById)
        // 过滤空值，并通过类型守卫把类型收窄为 string。
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
  // 返回值：只包含“本轮可用”的 userId -> photoUrl 映射。
  const photoMap = new Map<string, string>();
  // 只记录缓存里没有命中的用户，减少网络请求。
  const missingUserIds: string[] = [];

  userIds.forEach((userId) => {
    const cachedPhotoUrl = photoCache.get(userId);

    if (cachedPhotoUrl) {
      // 命中缓存：直接放入结果，不发请求。
      photoMap.set(userId, cachedPhotoUrl);
      return;
    }

    // 未命中缓存：加入待拉取队列。
    missingUserIds.push(userId);
  });

  // 全命中时直接返回，省掉 Promise.all 开销。
  if (missingUserIds.length === 0) {
    return photoMap;
  }

  // 并发拉取缺失头像，单个用户失败不会影响其他用户。
  const fetchedEntries = await Promise.all(
    missingUserIds.map(async (userId) => {
      try {
        const photoBlob = await graphClient
          .api(`/users/${userId}/photos/48x48/$value`)
          .responseType(ResponseType.BLOB)
          .get();
        // Blob 需要转成本地 object URL 才能赋给 <img src>。
        const photoUrl = URL.createObjectURL(photoBlob);
        // 同时写入缓存，供后续目录切换复用。
        photoCache.set(userId, photoUrl);
        return [userId, photoUrl] as const;
      } catch {
        // 头像接口失败属于可降级场景，返回 undefined 即可。
        return [userId, undefined] as const;
      }
    }),
  );

  fetchedEntries.forEach(([userId, photoUrl]) => {
    if (!photoUrl) {
      return;
    }

    // 只收集成功项，保证调用方拿到的映射都是可展示 URL。
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
): Promise<Map<string, IUserPresenceBadgeState>> => {
  // 空数组时提前返回，避免向 Graph 发送无效请求体。
  if (userIds.length === 0) {
    return new Map<string, IUserPresenceBadgeState>();
  }

  // Graph 批量接口：一次请求拿到多人的 presence，减少网络往返。
  const presenceResponse = await graphClient
    .api("/communications/getPresencesByUserId")
    .post({ ids: userIds });

  // 将响应数组转换成 Map，方便上层按 userId O(1) 查询。
  return new Map<string, IUserPresenceBadgeState>(
    presenceResponse.value.map(
      ({ id, availability, activity, outOfOfficeSettings }) => {
        const badgeState = mapGraphPresenceToBadgeState({
          availability,
          activity,
          outOfOfficeSettings,
        });

        return [
          id,
          {
            status: badgeState.status,
            outOfOffice: badgeState.outOfOffice,
          },
        ] as const;
      },
    ),
  );
};
