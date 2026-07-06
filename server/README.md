# 后端 API 服务器文档

> 当前后端结构速览与 API 路由总览。本文档以仓库里的 live code 为准，重点帮助你快速定位模块边界、关键入口和实际暴露的接口。
> 之后补充OpenAPI文档

## 模块概览

| 模块 / 路径       | 关键文件或文件夹                                 | 当前职责                                                                                                                       |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 服务入口          | `server/index.ts`                                | 创建 Restify 服务、配置 body parser 和 CORS、统一注册所有 API 路由，并通过 `withErrorHandling()` 收口后端错误响应。            |
| 认证与 Graph 访问 | `server/auth.ts`                                 | 校验前端传来的 Bearer token，检查 `Container.AccessAsUser`，通过 OBO 流程换取 Microsoft Graph token，并创建后端 Graph client。 |
| 配置读取          | `server/config.ts`                               | 读取后端运行所需环境变量，收口 Entra app、租户、容器类型和云环境配置。                                                         |
| 后端通用能力      | `server/common/`                                 | 放置统一错误响应、后端错误 helper、Graph 读取辅助和 scope 常量，避免这些基础能力散落在各业务模块。                             |
| 容器列表          | `server/listContainers.ts`                       | 处理 `GET /api/listContainers`，读取当前用户可访问的容器列表。                                                                 |
| 容器创建          | `server/createContainer.ts`                      | 处理 `POST /api/createContainer`，创建新的 SharePoint Embedded container。                                                     |
| 批量删除项目      | `server/deleteItems.ts`                          | 处理 `POST /api/deleteItems`，对指定 container 中的多个 item 执行批量删除，并返回逐项结果。                                    |
| 容器权限          | `server/containerPermissions/`                   | 负责容器级权限的读取、请求解析、角色映射和 Graph 写入编排，对应容器权限对话框的后端能力。                                      |
| Item 权限         | `server/itemPermissions/`                        | 负责 item 显式权限的读取与写入，同时包含 item link permission 的独立读写流程。                                                 |
| Item 版本         | `server/itemVersions/`                           | 负责版本历史列表、当前版本、单个版本详情、下载链接、恢复和删除等版本相关能力。                                                 |
| 归档下载          | `server/download/`、`server/downloadHandlers.ts` | 负责下载任务的启动、进度查询和 manifest 读取；后端只编排任务和文件清单，不直接生成 ZIP。                                       |
| 跨层合同          | `common/contracts/`                              | 前后端共享请求/响应 contract 的 source of truth，避免在 UI 和后端各自维护一套 shape。                                          |

## API 端点总览

| 方法     | 路径                                                     | 说明                                         | 认证                                    |
| -------- | -------------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| `GET`    | `/api/listContainers`                                    | 列出当前用户可访问的容器。                   | `Bearer Token + Container.AccessAsUser` |
| `POST`   | `/api/createContainer`                                   | 创建新的容器。                               | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/containerPermissions/:containerId`                 | 读取指定容器当前的容器级权限。               | `Bearer Token + Container.AccessAsUser` |
| `POST`   | `/api/containerPermissions/:containerId/apply`           | 应用指定容器的权限变更。                     | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/itemPermissions/:driveId/:itemId`                  | 读取指定 item 的显式权限与继承权限视图。     | `Bearer Token + Container.AccessAsUser` |
| `POST`   | `/api/itemPermissions/:driveId/:itemId/apply`            | 应用指定 item 的显式权限变更。               | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/itemPermissions/:driveId/:itemId/links`            | 读取指定 item 的 link permissions。          | `Bearer Token + Container.AccessAsUser` |
| `POST`   | `/api/itemPermissions/:driveId/:itemId/links/apply`      | 应用指定 item 的 link permission 变更。      | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/itemVersions/:driveId/:itemId`                     | 列出指定文件的版本历史。                     | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/itemVersions/:driveId/:itemId/current`             | 读取指定文件的当前版本元数据。               | `Bearer Token + Container.AccessAsUser` |
| `DELETE` | `/api/itemVersions/:driveId/:itemId/history`             | 删除指定文件的历史版本，并跳过当前最新版本。 | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/itemVersions/:driveId/:itemId/:versionId/download` | 获取指定版本的下载直链。                     | `Bearer Token + Container.AccessAsUser` |
| `POST`   | `/api/itemVersions/:driveId/:itemId/:versionId/restore`  | 将指定历史版本恢复为当前版本。               | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/itemVersions/:driveId/:itemId/:versionId`          | 读取指定版本的单条元数据。                   | `Bearer Token + Container.AccessAsUser` |
| `DELETE` | `/api/itemVersions/:driveId/:itemId/:versionId`          | 删除指定的单个历史版本。                     | `Bearer Token + Container.AccessAsUser` |
| `POST`   | `/api/deleteItems`                                       | 批量删除指定 container 下的文件或文件夹。    | `Bearer Token + Container.AccessAsUser` |
| `POST`   | `/api/download/start`                                    | 启动归档下载准备任务，返回 `jobId`。         | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/download/progress/:jobId`                          | 查询归档下载准备任务的当前进度。             | `Bearer Token + Container.AccessAsUser` |
| `GET`    | `/api/download/manifest/:jobId`                          | 读取归档下载任务准备完成后的 manifest。      | `Bearer Token + Container.AccessAsUser` |
