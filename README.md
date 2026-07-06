# SharePoint Embedded Demo 项目说明

本项目基于[微软官方教程](https://learn.microsoft.com/en-us/training/modules/sharepoint-embedded-create-app)， 原本只想随便vibe一下，但越写内心要求越高，各种细节都想做到符合“最佳实践”。于是拜托 codex 先生，把常用的 SharePoint Emebedded 功能，一个个做出来，对原项目几乎进行了重写，实现了一个完整的 SPE Demo。

SharePoint Emebedded 可以认为是个没有界面的 SharePoint Online。Demo 几乎照着一个SharePoint Online 环境，用 React 重现了一个 Document Library 界面和功能。

阅读本项目之前，建议以下快速入门，了解 SharePoint Embedded 的基本概念。

👉 [SharePoint Embedded 核心概念指南](docs/spe/sharepoint-embedded-guide.md)

## 技术栈

| 层级      | 技术                          | 说明                               |
| --------- | ----------------------------- | ---------------------------------- |
| 前端      | React 18 + TypeScript         | 单页应用 (SPA)，CRA 脚手架         |
| UI 组件   | Fluent UI React v9            | 微软设计系统组件库                 |
| 身份验证  | MGT (Microsoft Graph Toolkit) | Msal2Provider + `<Login />` 组件   |
| 后端      | Node.js + TypeScript          | API 服务器                         |
| HTTP 框架 | Restify                       | 轻量级 REST API 框架               |
| 认证流程  | MSAL Node + OBO               | On-Behalf-Of 流程换取 Graph Token  |
| 云服务    | Microsoft Graph API           | SharePoint Embedded 容器和文件操作 |

## 项目结构

```
spe-demo/
├── .vscode/                             # VS Code 工作区配置
├── build/                               # 前端构建产物输出目录
│   └── assets/                          # 构建后的静态资源文件
├── common/                              # 前后端共享的类型与工具
│   ├── contracts/                       # 共享 HTTP 请求与响应契约
│   └── helper/                          # 跨层复用的小型辅助函数
├── docs/                                # 项目文档与调研记录
│   ├── basis/                           # 基础概念与入门资料
│   ├── fix&refactor/                    # 修复与重构过程文档
│   └── spe/                             # SharePoint Embedded 专题文档
│       └── img/                         # SPE 文档引用图片资源
├── postman/                             # 修改版的官方 Postman Collection 导出文件
├── public/                              # 前端原样拷贝的静态资源
├── server/                              # 后端 API 与 OBO/Graph 集成代码
│   ├── common/                          # 后端通用错误、参数、Graph 读取工具
│   ├── containerPermissions/            # 容器级权限读写模块
│   ├── dist/                            # 后端编译产物目录
│   ├── download/                        # ZIP 下载准备与任务逻辑
│   ├── itemPermissions/                 # 项目级权限读写模块
│   │   └── linkPermission/              # 项目链接分享权限子模块
│   ├── itemVersions/                    # 文件版本历史与恢复相关接口
│   └── permissionsCore/                 # 权限领域共享读取器与适配器
├── src/                                 # 前端 React 应用源码
│   ├── common/                          # 前端共享配置、类型与通用逻辑
│   ├── components/                      # 按功能划分的页面与组件
│   │   ├── app/                         # 应用壳层与整体布局相关组件
│   │   ├── common/                      # 组件层通用 UI 片段
│   │   ├── containers/                  # 容器列表、选择、创建功能
│   │   │   └── components/              # 容器模块内部展示组件
│   │   ├── files/                       # 文件浏览、上传、下载、删除功能
│   │   │   ├── components/              # 文件模块内部展示组件
│   │   │   ├── hooks/                   # 文件模块状态与交互 Hooks
│   │   │   └── services/                # 文件模块前端服务封装
│   │   ├── permissions/                 # 权限对话框、差异计算与主体搜索
│   │   │   ├── components/              # 权限模块内部展示组件
│   │   │   ├── documents/               # 权限模块说明文档与设计记录
│   │   │   ├── hooks/                   # 权限模块状态与行为 Hooks
│   │   │   ├── models/                  # 权限模块本地类型模型
│   │   │   ├── services/                # 权限模块服务层
│   │   │   │   └── directoryPrincipalSearch/ # 目录主体搜索相关实现
│   │   │   └── utils/                   # 权限模块工具函数
│   │   ├── preview/                     # 文件预览与预览态交互功能
│   │   │   ├── components/              # 预览模块内部展示组件
│   │   │   ├── hooks/                   # 预览模块状态与副作用 Hooks
│   │   │   ├── models/                  # 预览模块本地类型模型
│   │   │   └── services/                # 预览模块服务封装
│   │   └── shared/                      # 多个功能模块共用的业务组件
│   ├── services/                        # 全局前端 API 请求与服务封装
│   └── test/                            # 前端测试辅助与共享测试资源
├── .env.development.local.example       # 开发环境配置示例模板
├── .env.example                         # 通用环境变量占位模板
├── .env.production.local.example        # 生产环境配置示例模板
├── .gitattributes                       # Git 文本属性与换行设置
├── .gitignore                           # Git 忽略规则
├── AGENTS.md                            # 仓库级协作与编码约束说明
├── eslint.config.mjs                    # ESLint 平面配置入口
├── index.html                           # Vite 前端页面模板
├── package-lock.json                    # npm 依赖锁定文件
├── package.json                         # 依赖、脚本与项目元数据配置
├── README.md                            # 项目总览与使用说明
├── tsconfig.json                        # 前端 TypeScript 配置
└── vite.config.ts                       # Vite 构建与开发服务器配置
```

## 主要功能

| 功能            | 说明                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| 🔐 用户登录     | 通过 MGT `<Login />` 组件，使用 MSAL 弹窗登录                            |
| 📦 容器管理     | 列出、选择、创建 SharePoint Embedded 存储容器                            |
| 🛡️ 容器权限     | 查看并修改容器级权限，管理容器访问主体与角色                             |
| 📄 文件浏览     | 展示容器内文件/文件夹，支持进入子目录、返回上级和面包屑导航              |
| ⬆️ 上传与建目录 | 支持单文件、多文件、整个文件夹上传，并可在当前目录新建子文件夹           |
| ⬇️ 文件下载     | 支持单文件直链下载，以及多文件/文件夹归档下载并展示进度                  |
| 🗑️ 删除管理     | 支持列表批量删除，也支持在预览态删除当前文件                             |
| 👁️ 文件预览     | 内嵌文件预览，支持在新标签页打开，并提供预览态下载入口                   |
| 👥 项目权限     | 查看并修改文件或文件夹的显式权限，区分直接权限与继承权限                 |
| 🔗 链接分享权限 | 管理 item-level link share，支持创建、删除、授权与撤销接收人             |
| 🕘 版本历史     | 查看文件历史版本，支持下载指定版本、恢复版本、删除单个版本或清理历史版本 |

## 快速配置

注：这里 Owning Tenant 和 Consuming Tenant 都用一个 tenant

1. 注册两个 Microsoft Entra App。这里只放最关键配置，逐点击步骤见 [Azure Portal 双应用注册指南](docs/spe/azure-portal-app-registration-guide.md)。

   | app        | name       | redirect url and platform type                                                                                                                        | API permissions                                                                                                                                                         |
   | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `backend`  | `backend`  | `Web`<br>`https://oauth.pstmn.io/v1/browser-callback`<br>`https://oauth.pstmn.io/v1/callback`                                                         | `Microsoft Graph / Delegated`: `FileStorageContainer.Selected`<br>初始化时临时再加：`FileStorageContainerType.Manage.All`、`FileStorageContainerTypeReg.Manage.All`     |
   | `frontend` | `frontend` | `Single-page application (SPA)`<br>`http://localhost:3000`<br>如需在 Postman 模拟前端登录，再补 `Mobile and desktop applications` 的两个 Postman 回调 | `Microsoft Graph / Delegated`: `FileStorageContainer.Selected`、`User.Read`、`User.ReadBasic.All`、`GroupMember.Read.All`、`ProfilePhoto.Read.All`、`Presence.Read.All` |

   `backend` 还需要：

   - 新建一个 client secret

   - `Expose an API` 使用默认 `Application ID URI`：`api://<backend-client-id>`

     添加一个 `Container.AccessAsUser` scope 配置：

     | field                        | value                                                                                                |
     | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
     | `Scope name`                 | `Container.AccessAsUser`                                                                             |
     | `Who can consent?`           | `Admins only`                                                                                        |
     | `Admin consent display name` | `Access SharePoint Embedded Containers as a user.`                                                   |
     | `Admin consent description`  | `The application can call this app's API to access SharePoint Embedded Storage Containers as a user` |
     | `User consent display name`  | `Access SharePoint Embedded Containers as a user.`                                                   |
     | `User consent description`   | `The application can call this app's API to access SharePoint Embedded Storage Containers as a user` |
     | `State`                      | `Enabled`                                                                                            |

     然后让 `frontend` 在 `API permissions -> APIs my organization uses` 中授权 `backend` 暴露的 `Container.AccessAsUser`。

2. 用 Postman 初始化 SPE。详细说明见 [Postman 与 SPE 初始化指南](docs/spe/postman-spe-setup-guide.md)：

   - 导入 [collection](postman/SharePoint%20Embedded%20%28Cloud%20Switch-%20commercial%20%2B%2021v%29.postman_collection.json) 和 [environment template](postman/template.cloudswitch.postman_environment.json)
   - 先填 environment：`CloudName`、`ClientID=<backend client-id>`、`ClientSecret=<backend secret>`、`ConsumingTenantId`、`RootSiteUrl`
   - 随便运行一次任意请求，让 cloud switch 自动补齐当前云环境变量
   - 运行 `Delegate -> Authorization` 拿 token
   - 创建 container type，记下返回的 `id` 回填 `ContainerTypeId`
   - 注册 container type，把 `backend` 和 `frontend` 都授进去

   创建 container type：

   ```http
   POST /v1.0/storage/fileStorage/containerTypes
   Content-Type: application/json
   ```

   ```json
   {
     "name": "My Trial Container Type",
     "owningAppId": "<backend-client-id>",
     "billingClassification": "trial",
     "settings": {
       "isItemVersioningEnabled": true,
       "isSharingRestricted": false
     }
   }
   ```

   创建 container type registration：

   ```http
   PUT /v1.0/storage/fileStorage/containerTypeRegistrations/<container-type-id>
   Content-Type: application/json
   ```

   ```json
   {
     "applicationPermissionGrants": [
       {
         "appId": "<backend-client-id>",
         "delegatedPermissions": ["full"],
         "applicationPermissions": ["full"]
       },
       {
         "appId": "<frontend-client-id>",
         "delegatedPermissions": ["full"],
         "applicationPermissions": ["full"]
       }
     ]
   }
   ```

3. 复制 `.env.development.local.example` 为 `.env.development.local`，开发时填好这些值：

   | 变量                              | 填什么                                |
   | --------------------------------- | ------------------------------------- |
   | `CLOUD_ENV`                       | 商业云填 `global`，世纪互联填 `china` |
   | `API_ENTRA_APP_CLIENT_ID`         | `backend` 的 client id                |
   | `API_ENTRA_APP_CLIENT_SECRET`     | `backend` 的 client secret            |
   | `API_ENTRA_APP_TENANT_ID`         | 当前租户的 tenant id                  |
   | `CONTAINER_TYPE_ID`               | 刚创建的 container type id            |
   | `VITE_CLIENT_ENTRA_APP_CLIENT_ID` | `frontend` 的 client id               |

   其余变量的说明见 `.env.example`；模板里已经给出的派生项和本地默认值通常无需改动。

   > **注意**：`VITE_*` 前缀的变量会由 Vite 注入浏览器 bundle，**对最终用户可见**，切勿将 secret 或敏感信息放入这些变量。后端私有配置（`API_ENTRA_APP_CLIENT_SECRET` 等）仅在服务端进程中读取，不会打包进前端。

4. 安装依赖并启动开发环境：

```bash
npm install
npm run dev
```

或者 vscode 里直接运行 `Run Dev` 调试配置。

启动后访问 `http://localhost:3000`。

## 如何调试

### npm 命令

| 命令                        | 说明                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`               | 开发模式并行启动前后端。                                                                                                       |
| `npm run dev:frontend`      | 仅启动前端开发服务器（Vite）。                                                                                                 |
| `npm run dev:backend`       | 仅启动后端（`nodemon + ts-node`，读取 `.env.development.local`）。                                                             |
| `npm run dev:backend:debug` | 以后端调试模式启动（`nodemon + node --inspect=9230 + ts-node/register`，读取 `.env.development.local`），供 VS Code 附加调试。 |
| `npm run start:prod`        | 本地模拟生产模式（先构建前后端，再以 production 启动后端，读取 `.env.production.local`）。                                     |

### VS Code 调试入口

项目已提供 `.vscode/launch.json` 与 `.vscode/tasks.json`：

| 配置                        | 说明                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Run Dev`                   | 复合调试配置。启动前会先执行一次 `npm test -- --run`，然后并行启动前端 Chrome 调试和后端 Node 附加调试。 |
| `Run Dev (Frontend Chrome)` | 先执行 `dev:frontend` task，再打开 `http://localhost:3000` 进行前端调试。                                |
| `Run Dev (Backend Attach)`  | 先执行 `dev:backend:debug` task，再附加到 `9230` 端口上的后端进程。                                      |
| `Start Prod (Local)`        | 在 VS Code 内执行本地模拟生产启动链路。                                                                  |
