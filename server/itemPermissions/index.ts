/**
 * 对外暴露 item 权限模块的主流程入口，供 `server/index.ts` 统一注册路由时按职责引入。
 */
export {
  applyItemPermissionChangeSet,
  applyItemPermissionsToGraph,
  fetchMapItemPermissionsFromGraphToResponse,
  listItemPermissionsFromGraph,
} from "./itemPermissionsHandlers";
