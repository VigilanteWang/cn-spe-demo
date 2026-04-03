# SharePoint Embedded Demo 项目说明

本项目基于[微软官方教程](https://learn.microsoft.com/en-us/training/modules/sharepoint-embedded-create-app), 并对 MGT 认证部分做了部分修改。项目包含 Node.js 后端用于 SPE 容器操作，以及 React 前端实现基本的容器和文件增删改查（CRUD）功能。

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

## 项目架构

```
┌────────────────────────────────────────────────────────────────────┐
│                        浏览器 (React SPA)                          │
│                                                                    │
│  ┌──────────┐   ┌────────────────┐   ┌───────────────────────┐    │
│  │ <Login /> │   │  <Containers /> │   │     <Files />         │    │
│  │  MGT 登录 │   │   容器管理      │   │  文件列表/上传/下载   │    │
│  └─────┬─────┘  └───────┬────────┘   └──────────┬────────────┘    │
│        │                │                        │                 │
│        ↓                ↓                        ↓                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐   │
│  │    SpEmbedded 服务层         │  │   Graph Client (MGT)     │   │
│  │  调用后端 API（容器 CRUD、    │  │  直接调用 Graph API       │   │
│  │  删除、ZIP 归档）            │  │  （文件列表/上传/预览）   │   │
│  └──────────────┬───────────────┘  └──────────────┬───────────┘   │
└─────────────────┼──────────────────────────────────┼───────────────┘
                  │ HTTP (Bearer Token)              │ HTTPS
                  ↓                                  ↓
┌─────────────────────────────┐    ┌──────────────────────────────┐
│   后端 API (Restify :3001)  │    │    Microsoft Graph API       │
│                             │    │                              │
│  auth.ts → JWT 验证 + OBO   │───→│  /storage/fileStorage/...    │
│  createContainer.ts         │    │  /drives/{id}/items/...      │
│  listContainers.ts          │    │                              │
│  deleteItems (index.ts)     │    └──────────────────────────────┘
│  downloadArchive.ts         │                ↑
│                             │                │
│  config.ts → 环境变量管理    │    ┌──────────────────────────────┐
└─────────────────────────────┘    │    Microsoft Entra ID        │
                                   │    (Azure AD)                │
                                   │  · 用户认证                   │
                                   │  · Token 签发与验证           │
                                   │  · OBO 流程处理              │
                                   └──────────────────────────────┘
```

## 项目结构

```
spe-demo/
├── server/                    # 后端 API 服务器
│   ├── index.ts               #   主入口，路由注册，CORS 配置
│   ├── auth.ts                #   JWT 验证、OBO 流程、Graph 客户端
│   ├── config.ts              #   环境变量配置管理
│   ├── createContainer.ts     #   创建容器 API
│   ├── listContainers.ts      #   列出容器 API
│   ├── downloadArchive.ts     #   ZIP 归档下载任务
│   ├── common/scopes.ts       #   SPE 权限常量
│   ├── tsconfig.json          #   后端 TypeScript 配置
│   └── README.md              #   后端详细文档（含概念教程）
├── src/                       # 前端 React 应用
│   ├── index.tsx              #   应用入口，初始化 MGT Provider
│   ├── App.tsx                #   主组件，登录状态 + 布局
│   ├── components/
│   │   ├── containers.tsx     #   容器管理（列表、选择、创建）
│   │   ├── files.tsx          #   文件管理（上传、下载、删除、导航）
│   │   └── preview.tsx        #   文件预览（iframe + 导航）
│   ├── services/
│   │   └── spembedded.ts      #   后端 API 服务层
│   ├── common/
│   │   ├── config.ts          #   前端配置管理
│   │   ├── scopes.ts          #   权限常量
│   │   └── types.ts           #   TypeScript 类型定义
│   └── README.md              #   前端详细文档
├── public/                    # 前端静态资源
├── .env.development.local     # 开发环境配置（不提交 Git）
├── .env.production.local      # 生产环境配置（不提交 Git）
├── package.json               # 依赖和脚本配置
└── tsconfig.json              # 前端 TypeScript 配置
```

## 主要功能

| 功能          | 说明                                                  |
| ------------- | ----------------------------------------------------- |
| 🔐 用户登录   | 通过 MGT `<Login />` 组件，使用 MSAL 弹窗登录         |
| 📦 容器管理   | 列出、选择、创建 SharePoint Embedded 存储容器         |
| 📄 文件列表   | 展示容器内文件/文件夹，支持文件夹导航和面包屑         |
| ⬆️ 文件上传   | 支持单文件、多文件、整个文件夹上传（含进度显示）      |
| ⬇️ 文件下载   | 单文件直链下载，多文件/文件夹 ZIP 归档下载            |
| 🗑️ 文件删除   | 批量删除选中的文件和文件夹                            |
| 👁️ 文件预览   | iframe 内嵌 SharePoint 预览，支持 Office 文档在线编辑 |
| 📁 文件夹创建 | 在当前目录下创建子文件夹                              |

## 配置文件

- `.env.development.local`：**开发环境本地配置文件，不提交到 Git**。复制 `.env.development.local.example` 后填入真实值。
- `.env.production.local`：**本地模拟生产配置文件，不提交到 Git**。复制 `.env.production.local.example` 后填入真实值。
- `.env.example`：通用变量模板，仅含占位符，无真实密钥，可安全提交到 Git。

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
