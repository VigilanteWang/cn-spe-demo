# SharePoint Embedded Demo 项目说明

本项目基于[微软官方教程](https://learn.microsoft.com/en-us/training/modules/sharepoint-embedded-create-app), 并对 MGT 认证部分做了部分修改。项目包含 Node.js 后端用于 SPE 容器操作，以及 React 前端实现基本的容器和文件增删改查（CRUD）功能。

## 项目结构

- `server/`：Node.js 后端代码，负责与 Microsoft Graph API 交互，实现容器的创建和查询等操作。
- `src/`：React 前端代码，实现 UI 及与后端的交互。
- `public/`：前端静态资源文件夹。
- `.env`：后端环境变量配置文件，包含 API 认证相关的 clientId、clientSecret、authority 及容器类型 ID。
- `package.json`：项目依赖和脚本配置。
- `tsconfig.json`：前端 TypeScript 配置文件。

## 主要文件说明

### 后端（server/）

- `auth.ts`：实现 OBO 流程，使用前端传来的 access token 换取 Microsoft Graph 的访问令牌。
- `createContainer.ts`：实现创建 SPE 容器的 API 逻辑。
- `listContainers.ts`：实现查询 SPE 容器列表的 API 逻辑。
- `index.ts`：后端服务入口，注册 API 路由，处理 CORS，启动 Restify 服务。
- `common/scopes.ts`：后端用到的 Microsoft Graph 权限定义。

### 前端（src/）

- `App.tsx`：主页面组件，负责登录、认证状态判断、主内容渲染。
- `index.tsx`：应用入口，初始化 MGT Provider，配置认证参数。
- `components/containers.tsx`：容器管理组件，负责容器的列表、选择、新建。
- `components/files.tsx`：文件管理组件，负责容器内文件/文件夹的增删查、上传下载。
- `services/spembedded.ts`：前端与后端 API 交互的服务类。
- `common/constants.ts`：前端常量配置。
- `common/scopes.ts`：前端 Microsoft Graph 权限定义。
- `common/IContainer.ts`：容器对象接口定义。

### 配置文件

- `.env.development.local`：**开发环境本地配置文件，不提交到 Git**。复制 `.env.development.local.example` 后填入真实值。
- `.env.production.local`：**本地模拟生产配置文件，不提交到 Git**。复制 `.env.production.local.example` 后填入真实值。
- `.env.example`：通用变量模板，仅含占位符，无真实密钥，可安全提交到 Git。
- `.env.development.local.example`：开发环境模板。
- `.env.production.local.example`：本地生产环境模板。
- `package.json`：依赖和脚本配置。
- `tsconfig.json`、`server/tsconfig.json`：TypeScript 配置。

> **注意**：`REACT_APP_*` 前缀的变量由 `react-scripts` 在构建时打包进浏览器 bundle，**对最终用户可见**，切勿将 secret 或敏感信息放入这些变量。后端私有配置（`API_ENTRA_APP_CLIENT_SECRET` 等）仅在服务端进程中读取，不会打包进前端。

## 运行与调试

### 环境准备

1. 复制 `.env.development.local.example` 为 `.env.development.local` 并填写开发环境参数。
2. 复制 `.env.production.local.example` 为 `.env.production.local` 并填写本地模拟生产参数。

### npm 命令

- `npm run dev`：开发模式并行启动前后端。
- `npm run dev:frontend`：仅启动前端开发服务器（CRA）。
- `npm run dev:backend`：仅启动后端（`nodemon + ts-node`，读取 `.env.development.local`）。
- `npm run start:prod`：本地模拟生产模式（先构建前后端，再以 production 启动后端，读取 `.env.production.local`）。

### VS Code 调试入口

项目已提供 `.vscode/launch.json` 与 `.vscode/tasks.json`：

- `Run Dev`：复合调试配置，一次启动前端 Chrome 调试和后端 Node 附加调试。
- `Start Prod (Local)`：在 VS Code 内执行本地模拟生产启动链路。

如果首次运行 `Run Dev` 较慢，请等待前端编译完成并看到后端 `Debugger listening on` 日志后再访问页面。
