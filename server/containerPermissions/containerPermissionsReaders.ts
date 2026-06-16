/**
 * 复用权限核心里的通用 Graph 字段读取器，避免容器权限模块重复维护同一套解析逻辑。
 */
export {
  readGraphToRecord,
  readOptionalString,
  readRequiredString,
  readStringArray,
} from "../permissionsCore/permissionGraphReaders";
