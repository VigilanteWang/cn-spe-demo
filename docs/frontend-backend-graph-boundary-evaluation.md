# 前后端 Graph 动作职责边界评估

## Summary

基于 Microsoft Graph 与 Microsoft identity platform 的官方最佳实践，当前仓库在“哪些动作适合前端直连 Graph，哪些动作应保留后端”这件事上，可以先用下面几条简单规则判断：

1. 前端优先：

   - 用户强交互、即时反馈、单次 Graph 调用为主的动作。
   - 不依赖服务端密钥、服务端固定配置、服务端 allowlist 的动作。
   - 即使失败，前端也能直接理解并处理返回结果，不需要额外编排或稳定化契约的动作。

2. 后端优先：

   - 需要 OBO、需要把用户身份继续传递给下游 API 的动作。
   - 需要隐藏服务端配置、客户端凭据、资源类型限制、allowlist 或 `beta` 细节的动作。
   - 需要多步 Graph 编排、批处理、后台任务、稳定错误模型、统一返回契约的动作。
   - 需要避免把中间层 token、下载直链、复杂权限语义直接暴露给浏览器的动作。

3. 安全与数据保护上的通用建议：
   - 始终坚持最小权限，只申请当前动作真正需要的 delegated permission；交互式应用默认优先 delegated，不要为了省事切成 application permission。
   - SPA 获取 token 时优先走 `acquireTokenSilent`，失败后再走交互式获取；不要在前端引入 client secret，也不要把本该只给中间层使用的 token 再转发回浏览器。
   - 遇到 `429` 时严格遵守 `Retry-After`，不要立即重试；高频轮询型场景优先考虑 change tracking 或 change notifications，而不是不断扫列表。
   - 前端若直连 Graph，应尽量只承接“浏览器本来就最适合做”的轻量动作；只要开始出现统一鉴权、统一错误、批量部分成功、下载地址解析、权限映射这类需求，就更适合收口到后端。

以上判断主要来自以下官方文档：

- [Best practices for working with Microsoft Graph](https://learn.microsoft.com/en-us/graph/best-practices-concept)
- [Microsoft Graph throttling guidance](https://learn.microsoft.com/en-us/graph/throttling)
- [Single-page application: Acquire a token to call an API](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-acquire-token)
- [Microsoft identity platform and OAuth 2.0 On-Behalf-Of flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow)

## Repo-specific evaluation

结合当前 `cn-spe-demo` 的实现，比较合适的边界可以总结为：

- 适合前端直打 Graph：

  - 普通文件浏览
  - 新建文件夹
  - 上传文件 / 上传目录过程中的目录探测与补建
  - 文件预览
  - 将来可考虑前移的普通 `driveItem` 删除
  - 将来可考虑前移的版本只读查询

- 适合后端保留：
  - 所有 `FileStorageContainer` 本体与 container permission 动作
  - 所有 item permission / link permission 的写操作
  - 需要服务端 allowlist、`beta`、身份映射、role 映射的权限链路
  - 需要多步编排的版本恢复、清空历史版本
  - 归档下载这类后台任务、递归展开、manifest 生成、下载地址解析
  - 需要统一错误语义、统一返回契约、隐藏服务端配置细节的动作

如果只看“收敛不必要的后端 OBO”这个目标，当前最值得优先重新评估的仍然是两组能力：

1. `deleteItems`

   - 它本质上更像普通 `driveItem` 操作。
   - 当前保留后端的主要收益不是权限边界，而是“批量部分成功结果模型 + 统一错误形状”。

2. `itemVersions` 的只读部分
   - `versions`、`versions/current`、单版本元数据读取，技术上都能前端直读。
   - 当前保留后端的主要收益是稳定契约、当前版本判定收口、下载地址解析回退逻辑。

## 简化判断清单

可以把后续新动作的归属判断压缩成下面 6 个问题：

| 问题                                                          | 如果答案是“是”                         | 更适合谁 |
| ------------------------------------------------------------- | -------------------------------------- | -------- |
| 这是单次、直接、强交互的 UI 动作吗？                          | 例如列目录、预览、上传                 | 前端     |
| 这一步是否需要隐藏服务端配置或资源策略？                      | 例如 `containerTypeId`、allowlist      | 后端     |
| 这一步是否需要多次 Graph 调用编排？                           | 例如 create 后再 grant、批量删历史版本 | 后端     |
| 这一步是否需要稳定的中间契约或统一错误收口？                  | 例如部分成功、统一下载错误             | 后端     |
| 这一步是否只是普通内容操作而不是权限/治理动作？               | 例如浏览、建文件夹、上传               | 前端     |
| 这一步是否涉及敏感 token 传递、OBO 或不该暴露给浏览器的细节？ | 例如中间层 token、复杂权限语义         | 后端     |

## Inventory Table

| 名称                   | Graph endpoint / 动作                                                             | 当前在谁 | 合理性   | 解释                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 列容器                 | `GET /storage/fileStorage/containers`                                             | 后端     | 合理     | 这是容器本体查询，后端还能强制按 `containerTypeId` 过滤，避免前端直接接触服务端配置。[listContainers.ts: 39](../server/listContainers.ts#L39)                                                                            |
| 创建容器               | `POST /storage/fileStorage/containers`                                            | 后端     | 很合理   | 服务端会强制注入 `containerTypeId`，这是典型“该留后端”的调用，前端不该决定能创建哪类容器。[createContainer.ts: 46](../server/createContainer.ts#L46)                                                                     |
| 读容器权限             | `GET /storage/fileStorage/containers/{containerId}/permissions`                   | 后端     | 合理     | 容器权限属于资源级授权边界，后端统一做映射和错误收口更稳。[containerPermissionsHandlers.ts: 124](../server/containerPermissions/containerPermissionsHandlers.ts#L124)                                                    |
| 删容器权限             | `DELETE /storage/fileStorage/containers/{containerId}/permissions/{permissionId}` | 后端     | 合理     | 这里还带了 `Prefer: onlyRemoveContainerScopedPermission`，放后端更适合集中控制协议细节。[containerPermissionsHandlers.ts: 157](../server/containerPermissions/containerPermissionsHandlers.ts#L157)                      |
| 改容器权限角色         | `PATCH /storage/fileStorage/containers/{containerId}/permissions/{permissionId}`  | 后端     | 合理     | 属于容器级写操作，保留在后端能统一 role 映射与校验。[containerPermissionsHandlers.ts: 175](../server/containerPermissions/containerPermissionsHandlers.ts#L175)                                                          |
| 建容器权限             | `POST /storage/fileStorage/containers/{containerId}/permissions`                  | 后端     | 合理     | 权限创建体和 identity 映射都在后端，符合边界。[containerPermissionsHandlers.ts: 196](../server/containerPermissions/containerPermissionsHandlers.ts#L196)                                                                |
| 列当前目录文件         | `GET /drives/{containerId}/items/{itemId}/children`                               | 前端     | 合理     | 这是最典型的容器内文件浏览，前端已有 `FileStorageContainer.Selected`，直打 Graph 最自然。[useFilesData.tsx: 83](../src/components/files/hooks/useFilesData.tsx#L83)                                                      |
| 新建文件夹             | `POST /drives/{containerId}/items/{folderId}/children`                            | 前端     | 合理     | 纯 UI 驱动、单次调用、无服务端配置依赖，前端直打很好。[useFilesFolderCreation.ts: 72](../src/components/files/hooks/useFilesFolderCreation.ts#L72)                                                                       |
| 上传前检查子目录       | `GET /drives/{containerId}/items/{parentId}/children`                             | 前端     | 合理     | 这是上传流程中的目录探测，前端本地文件树编排本来就发生在浏览器里。[useFilesUpload.ts: 136](../src/components/files/hooks/useFilesUpload.ts#L136)                                                                         |
| 上传时补建中间目录     | `POST /drives/{containerId}/items/{parentId}/children`                            | 前端     | 合理     | 这是前端上传文件夹流程的自然组成部分，没必要绕后端。[useFilesUpload.ts: 148](../src/components/files/hooks/useFilesUpload.ts#L148)                                                                                       |
| 上传文件内容           | `PUT /drives/{containerId}/items/{targetFolderId}:/{fileName}:/content`           | 前端     | 合理     | 浏览器拿本地文件流直接传 Graph，减少后端中转，最合适。[useFilesUpload.ts: 229](../src/components/files/hooks/useFilesUpload.ts#L229)                                                                                     |
| 预览文件               | `POST /drives/{driveId}/items/{fileId}/preview`                                   | 前端     | 合理     | 这是强交互、即时 UI 场景，前端直取预览地址非常合适。[usePreviewUrl.ts: 78](../src/components/preview/hooks/usePreviewUrl.ts#L78)                                                                                         |
| 删除单个/多个文件      | `DELETE /drives/{containerId}/items/{itemId}`                                     | 后端     | 偏不合理 | 这类删除和“建文件夹/上传/列目录”是同层级普通文件操作，当前为了“部分成功列表”放后端可以理解，但从职责边界看，更像应该前端直打 Graph；除非明确要保留统一批量结果模型。[deleteItems.ts: 41](../server/deleteItems.ts#L41)   |
| 读 item 权限           | `GET /drives/{driveId}/items/{itemId}/permissions`                                | 后端     | 合理     | 前端真正消费的不是 Graph 原始权限，而是“当前项 + 父项继承比对”后的 UI 结构，后端做映射更合理。[itemPermissionsHandlers.ts: 127](../server/itemPermissions/itemPermissionsHandlers.ts#L127)                               |
| 读父项引用             | `GET /drives/{driveId}/items/{itemId}?$select=parentReference`                    | 后端     | 合理     | 这是 item 权限继承判断的内部步骤，属于服务端编排的一部分。[itemPermissionsHandlers.ts: 294](../server/itemPermissions/itemPermissionsHandlers.ts#L294)                                                                   |
| 删 item 权限           | `DELETE /drives/{driveId}/items/{itemId}/permissions/{permissionId}`              | 后端     | 合理     | 权限写操作不适合让前端直接拼装细节。[itemPermissionsHandlers.ts: 167](../server/itemPermissions/itemPermissionsHandlers.ts#L167)                                                                                         |
| 改 item 权限           | `PATCH /drives/{driveId}/items/{itemId}/permissions/{permissionId}`               | 后端     | 合理     | 后端统一 role 映射、错误处理、兼容后续替换策略。[itemPermissionsHandlers.ts: 185](../server/itemPermissions/itemPermissionsHandlers.ts#L185)                                                                             |
| 建 item 显式权限       | `POST /drives/{driveId}/items/{itemId}/invite`                                    | 后端     | 合理     | invite 体构造、主体映射、继承语义都更适合后端统一处理。[itemPermissionsHandlers.ts: 238](../server/itemPermissions/itemPermissionsHandlers.ts#L238)                                                                      |
| 读 item link 权限      | `GET /drives/{driveId}/items/{itemId}/permissions`                                | 后端     | 基本合理 | 从纯技术上前端也能读，但当前后端会过滤/映射成 link 视图模型，并与写入流程保持同一边界，保留后端是合理的。[itemLinkPermissionService.ts: 335](../server/itemPermissions/linkPermission/itemLinkPermissionService.ts#L335) |
| 读 link 目标元数据     | `GET /drives/{driveId}/items/{itemId}?$select=name,file,folder`                   | 后端     | 合理     | 这是 link 写入前的服务端 allowlist 校验，应该留后端。[itemLinkPermissionService.ts: 301](../server/itemPermissions/linkPermission/itemLinkPermissionService.ts#L301)                                                     |
| 创建分享 link          | `POST /drives/{driveId}/items/{itemId}/createLink`                                | 后端     | 合理     | 涉及 create 后再 grant 的编排，不宜散在前端。[itemLinkPermissionService.ts: 116](../server/itemPermissions/linkPermission/itemLinkPermissionService.ts#L116)                                                             |
| 删除分享 link          | `DELETE /drives/{driveId}/items/{itemId}/permissions/{permissionId}`              | 后端     | 合理     | 属于 link 权限写操作链路的一部分。[itemLinkPermissionService.ts: 88](../server/itemPermissions/linkPermission/itemLinkPermissionService.ts#L88)                                                                          |
| 对 link 授权收件人     | `POST /shares/{shareId}/permission/grant`                                         | 后端     | 很合理   | 这已经不是简单文件操作，而是共享权限编排，后端保留非常合适。[itemLinkPermissionService.ts: 275](../server/itemPermissions/linkPermission/itemLinkPermissionService.ts#L275)                                              |
| 对 link 撤销收件人     | `POST /shares/{shareId}/permission/revokeGrants`                                  | 后端     | 很合理   | 还用到了 `beta`，更应该藏在后端边界内。[itemLinkPermissionService.ts: 187](../server/itemPermissions/linkPermission/itemLinkPermissionService.ts#L187)                                                                   |
| 读版本列表             | `GET /drives/{driveId}/items/{itemId}/versions`                                   | 后端     | 略偏后端 | 当前后端只是做薄映射，技术上前端完全能直接读；如果目标是尽量简化 demo，这一项可以考虑前移到前端。[itemVersionService.ts: 244](../server/itemVersions/itemVersionService.ts#L244)                                         |
| 读当前版本             | `GET /drives/{driveId}/items/{itemId}/versions/current`                           | 后端     | 基本合理 | 当前后端提供了稳定 `/current` 契约，避免前端自己猜当前版本；保留后端有价值，但如果只追求最薄链路，也能前移。[itemVersionService.ts: 77](../server/itemVersions/itemVersionService.ts#L77)                                |
| 读单个版本元数据       | `GET /drives/{driveId}/items/{itemId}/versions/{versionId}`                       | 后端     | 略偏后端 | 主要是为了后面的下载 URL 解析服务；如果只读展示，前端也能直接做。[itemVersionService.ts: 272](../server/itemVersions/itemVersionService.ts#L272)                                                                         |
| 解析版本下载地址       | `GET /drives/{driveId}/items/{itemId}/versions/{versionId}` 或 `.../content`      | 后端     | 基本合理 | 这里有 `@microsoft.graph.downloadUrl` 回退和 `302 Location` 处理，后端封装后前端更简单。[itemVersionService.ts: 102](../server/itemVersions/itemVersionService.ts#L102)                                                  |
| 恢复版本               | `POST /drives/{driveId}/items/{itemId}/versions/{versionId}/restoreVersion`       | 后端     | 合理     | 写操作且有 `.post(null)` 细节，后端收口更稳。[itemVersionService.ts: 170](../server/itemVersions/itemVersionService.ts#L170)                                                                                             |
| 删除单个版本           | `DELETE /drives/{driveId}/items/{itemId}/versions/{versionId}`                    | 后端     | 基本合理 | 写操作，留后端没问题；但如果整体想减薄后端，这也是可前移项之一。[itemVersionService.ts: 195](../server/itemVersions/itemVersionService.ts#L195)                                                                          |
| 删除全部历史版本       | `GET /versions` + 多次 `DELETE /versions/{id}`                                    | 后端     | 合理     | 这是明显的多步编排，放后端是对的。[itemVersionService.ts: 216](../server/itemVersions/itemVersionService.ts#L216)                                                                                                        |
| 归档下载展开选中项     | `GET /drives/{driveId}/items/{itemId}`                                            | 后端     | 合理     | 这是后台任务预处理，不是单次 UI 请求；后端负责目录展开、大小限制、manifest 很合理。[downloadGraph.ts: 103](../server/download/downloadGraph.ts#L103)                                                                     |
| 归档下载展开文件夹子项 | `GET /drives/{driveId}/items/{folderId}/children`                                 | 后端     | 合理     | 递归分页展开和 ZIP 清单编排明显应在后端。[downloadGraph.ts: 150](../server/download/downloadGraph.ts#L150)                                                                                                               |
| 归档下载解析文件直链   | `GET /drives/{driveId}/items/{itemId}` 或 `.../content`                           | 后端     | 合理     | 这是 manifest 生成的一部分，和后台任务绑定，放后端正确。[downloadGraph.ts: 45](../server/download/downloadGraph.ts#L45)                                                                                                  |

## Conclusion

对当前仓库来说，最清晰也最稳的原则不是“能不能前端调用 Graph”，而是“这个动作是否只是轻量 UI 内容操作”。如果是，就优先前端；如果已经涉及权限语义、服务端策略、多步编排、后台任务、稳定契约或敏感细节隐藏，就继续保留后端。

因此，当前最合理的收敛方向不是大规模把所有 Graph 动作前移，而是有选择地评估：

- 第一优先级：`deleteItems`
- 第二优先级：`itemVersions` 的只读查询

其余与容器本体、权限写操作、link 编排、下载编排相关的能力，继续保留在后端更符合 Microsoft Graph 的安全与数据保护实践，也更符合这个 demo 当前的可维护性目标。
