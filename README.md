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
- `.env`：后端环境变量，包含 API 认证相关配置（clientId、clientSecret、authority、containerTypeId）。
- `package.json`：依赖和脚本配置。
- `tsconfig.json`、`server/tsconfig.json`：TypeScript 配置。

## SharePoint Embedded 概念指南

如果你想快速了解 SharePoint Embedded 的核心概念（架构、权限、计费、实施路径等），请参阅：

👉 [SharePoint Embedded 核心概念指南](docs/spe/sharepoint-embedded-guide.md)