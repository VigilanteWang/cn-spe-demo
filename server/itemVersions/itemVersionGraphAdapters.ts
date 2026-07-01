import type {
  IItemVersionEntryForUI,
  IItemVersionListResponseFromApi,
  IItemVersionResponseFromApi,
} from "../../common/contracts/itemVersionContracts";
import {
  readGraphToRecord,
  readOptionalNumberLike,
  readOptionalString,
} from "../common/graphReaders";

/**
 * 把 Graph 单条版本元数据映射成前端稳定模型。
 *
 * @param version Graph 返回的单条版本对象。
 * @param isCurrent 是否为当前最新版本。
 * @returns 前端可直接消费的最小版本模型。
 */
export const mapGraphItemVersion = (
  version: unknown,
  isCurrent: boolean,
): IItemVersionEntryForUI => {
  const versionRecord = readGraphToRecord(version);

  return {
    id: readOptionalString(versionRecord.id) ?? "",
    lastModifiedDateTime:
      readOptionalString(versionRecord.lastModifiedDateTime) ?? "",
    lastModifiedByDisplayName: readGraphItemVersionLastModifiedByDisplayName(
      versionRecord.lastModifiedBy,
    ),
    size: readOptionalNumberLike(versionRecord.size) ?? 0,
    isCurrent,
  };
};

/**
 * 把 Graph 版本数组保持原顺序映射成列表响应。
 *
 * Graph 默认顺序就是从最新到最旧，
 * 这里故意不重新排序，只按第一项标记 `isCurrent`。
 *
 * @param versions Graph 返回的版本数组。
 * @returns 供前端版本列表直接消费的标准响应体。
 */
export const mapGraphItemVersions = (
  versions: unknown[],
): IItemVersionListResponseFromApi => ({
  entries: versions.map((version, index) =>
    mapGraphItemVersion(version, index === 0),
  ),
});

/**
 * 把单条 Graph 版本对象映射成单条详情响应。
 *
 * @param version Graph 返回的单条版本对象。
 * @param isCurrent 是否为当前最新版本。
 * @returns 单条版本响应体。
 */
export const mapGraphItemVersionResponse = (
  version: unknown,
  isCurrent: boolean,
): IItemVersionResponseFromApi => ({
  entry: mapGraphItemVersion(version, isCurrent),
});

/**
 * 从 Graph `identitySet` 中提取最适合展示的 displayName。
 *
 * 这里按 `user -> application -> device` 的优先级回退，
 * 避免某一类主体缺失时把展示名直接留空。
 *
 * @param lastModifiedBy Graph 版本对象中的 `lastModifiedBy`。
 * @returns 可直接展示的修改者名称；缺失时回退为空字符串。
 */
const readGraphItemVersionLastModifiedByDisplayName = (
  lastModifiedBy: unknown,
): string => {
  const lastModifiedByRecord = readGraphToRecord(lastModifiedBy);

  return (
    readOptionalString(
      readGraphToRecord(lastModifiedByRecord.user).displayName,
    ) ??
    readOptionalString(
      readGraphToRecord(lastModifiedByRecord.application).displayName,
    ) ??
    readOptionalString(
      readGraphToRecord(lastModifiedByRecord.device).displayName,
    ) ??
    ""
  );
};
