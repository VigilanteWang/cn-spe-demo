# SharePoint Embedded Demo - 完整项目指南

![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![React](https://img.shields.io/badge/React-18+-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue)

## 📋 目录

1. [项目概述](#项目概述)
2. [快速开始](#快速开始)
3. [项目架构](#项目架构)
4. [目录结构](#目录结构)
5. [技术栈](#技术栈)
6. [功能说明](#功能说明)
7. [开发指南](#开发指南)
8. [配置参考](#配置参考)
9. [常见问题](#常见问题)
10. [贡献指南](#贡献指南)

---

## 项目概述

**SharePoint Embedded Demo** 是一个完整的 Web 应用示例，展示如何使用 **Microsoft SharePoint Embedded** (SPE) API 构建文件存储和管理系统。

### 项目特点

✨ **完整的端到端实现**

- 前端：React + TypeScript + Fluent UI
- 后端：Node.js + Express + MSAL
- 集成：Microsoft Graph API + SharePoint Embedded API

✨ **企业级设计模式**

- 权限验证（OBO 流程）
- 异步任务处理（Job Queue）
- 错误处理和恢复
- TypeScript 类型安全

✨ **开发者友好**

- 详细的代码注释（中文）
- 完整的 API 文档
- 配置管理和多云环境支持

### 目标用例

- 学习 SharePoint Embedded API 集成
- 学习 Microsoft Graph for JavaScript 最佳实践
- 学习 React + TypeScript 企业开发模式
- 作为真实项目的参考实现

---

## 快速开始

### 前置要求

- **Node.js** 18+
- **npm** 或 **yarn**
- **Entra ID (Azure AD)** 应用注册
- SharePoint Embedded 容器类型 ID

### 环境准备

1. **克隆项目**

```bash
git clone <repo-url>
cd spe-demo
npm install
```

2. **配置环境变量**

复制 `.env.example`：

```bash
cp .env.example .env.local
```

编辑 `.env.local` 填入您的配置：

```env
# 后端配置
API_ENTRA_APP_CLIENT_ID=<your_client_id>
API_ENTRA_APP_CLIENT_SECRET=<your_client_secret>
API_ENTRA_APP_TENANT_ID=<your_tenant_id>
API_CONTAINER_TYPE_ID=<your_container_type_id>
API_PORT=5000
API_CLOUD_ENV=global

# 前端配置（.env.local）
REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID=<same_as_api>
REACT_APP_CLIENT_ENTRA_APP_TENANT_ID=<your_tenant_id>
REACT_APP_API_ENTRA_APP_CLIENT_ID=<api_client_id>
REACT_APP_API_SERVER_URL=http://localhost:5000
REACT_APP_CLOUD_ENV=global
```

3. **启动开发服务**

启动后端（终端 1）：

```bash
npm run dev:backend:debug
# 后端运行在 http://localhost:5000
```

启动前端（终端 2）：

```bash
npm run dev:frontend
# 前端运行在 http://localhost:3000
```

4. **访问应用**

打开浏览器访问 `http://localhost:3000`

---

## 项目架构

### 高级架构图

```
┌─────────────────────────────────────┐
│         浏览器                       │
│  ┌─────────────────────────────┐   │
│  │   React Front-End App       │   │
│  │  (Fluent UI Components)     │   │
│  │  - Containers               │   │
│  │  - Files                    │   │
│  │  - Preview                  │   │
│  └──────────────┬──────────────┘   │
└─────────────────┼────────────────────┘
                  │
        ┌─────────▼─────────┐
        │  REST API         │
        │  (HTTP/HTTPS)     │
        └─────────┬─────────┘
                  │
┌─────────────────▼────────────────────┐
│   Node.js Backend Server             │
│  ┌──────────────────────────────┐   │
│  │  Express/Restify Route       │   │
│  │  Handler                     │   │
│  └──────────────┬───────────────┘   │
│                 ↓                    │
│  ┌──────────────────────────────┐   │
│  │  1. Validate Token (auth.ts) │   │
│  │     - Verify JWT signature   │   │
│  │     - Check scopes/claims    │   │
│  └──────────────┬───────────────┘   │
│                 ↓                    │
│  ┌──────────────────────────────┐   │
│  │  2. Exchange Token (OBO)     │   │
│  │     - Get Graph API token    │   │
│  └──────────────┬───────────────┘   │
│                 ↓                    │
│  ┌──────────────────────────────┐   │
│  │  3. Call Graph API           │   │
│  │     /storage/fileStorage/... │   │
│  └──────────────┬───────────────┘   │
│                 ↓                    │
│  ┌──────────────────────────────┐   │
│  │  4. Return Response          │   │
│  │     (JSON or Binary Data)    │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │ Microsoft Entra ID │
        │ (身份认证)         │
        └────────────────────┘
                  │
        ┌─────────▼──────────────────┐
        │  Microsoft Graph API        │
        │  SharePoint Embedded API    │
        │  Files & Storage Services   │
        └─────────────────────────────┘
```

### 请求流程（示例：创建容器）

```
用户界面
  ↓
点击 "创建容器" 按钮
  ↓
React 组件调用 SpEmbedded.createContainer(name)
  ↓
SpEmbedded 获取 token（从全局 MGT Provider）
  ↓
POST http://localhost:5000/api/createContainer
Authorization: Bearer {accessToken}
Body: { displayName, description }
  ↓
┌─────────────────────────────────────┐
│ 后端处理请求                        │
├─────────────────────────────────────┤
│ 1. 从 Header 提取 token             │
│ 2. 验证 token 签名（使用 JWKS）     │
│ 3. 检查 Container.Manage 权限       │
│ 4. 用 OBO 流程交换 Graph token      │
│ 5. 调用 Graph API 创建容器          │
│ 6. 返回容器信息给前端               │
└─────────────────────────────────────┘
  ↓
React 组件接收响应
  ↓
更新 UI 显示新容器
```

---

## 目录结构

```
spe-demo/
├── README.md                        # 本文件
├── package.json                     # 项目依赖和脚本
├── tsconfig.json                    # TypeScript 配置
├── eslint.config.mjs                # ESLint 配置
│
├── .env.example                     # 环境变量模板
├── .env.local                       # 本地配置（git 忽略）
│
├── public/                          # 前端静态资源
│   ├── index.html
│   ├── manifest.json
│   └── robots.txt
│
├── src/                    ⭐ 前端应用
│   ├── README.md          # 前端详细文档
│   ├── App.tsx           # 主应用组件
│   ├── index.tsx         # 应用入口
│   ├── index.css         # 全局样式
│   │
│   ├── components/       # React 组件
│   │   ├── containers.tsx   # 容器管理
│   │   ├── files.tsx        # 文件管理
│   │   └── preview.tsx      # 文件预览
│   │
│   ├── services/         # API 客户端
│   │   └── spembedded.ts    # SharePoint Embedded 服务
│   │
│   └── common/           # 通用代码
│       ├── config.ts        # 配置管理
│       ├── scopes.ts        # 权限范围定义
│       └── types.ts         # TypeScript 类型
│
├── server/               ⭐ 后端服务
│   ├── README.md        # 后端详细文档
│   ├── index.ts        # 服务器主入口
│   ├── auth.ts         # 权限验证和 OBO
│   ├── config.ts       # 配置管理
│   ├── createContainer.ts
│   ├── listContainers.ts
│   ├── deleteItems.ts
│   ├── downloadArchive.ts
│   │
│   ├── common/
│   │   └── scopes.ts
│   │
│   └── tsconfig.json
│
├── build/              # 前端构建输出（git 忽略）
│   └── ...
│
└── postman/
    ├── SharePoint Embedded.cloudswitch.postman_collection.json
    └── template.cloudswitch.postman_environment.json
```

---

## 技术栈

### 前端

| 技术           | 版本 | 用途                 |
| -------------- | ---- | -------------------- |
| **React**      | 18+  | UI 框架              |
| **TypeScript** | 4.9+ | 类型系统             |
| **Fluent UI**  | 9+   | UI 组件库            |
| **MGT**        | 3+   | Microsoft Graph 集成 |
| **MSAL**       | 2+   | 身份认证             |

### 后端

| 技术                | 版本  | 用途           |
| ------------------- | ----- | -------------- |
| **Node.js**         | 18+   | 运行时         |
| **TypeScript**      | 4.9+  | 类型系统       |
| **Express**         | 4+    | HTTP 框架      |
| **MSAL-Node**       | 1.12+ | Entra ID 认证  |
| **Microsoft Graph** | 4+    | 调用 Graph API |

### 外部服务

- **Microsoft Entra ID** - 身份验证和授权
- **Microsoft Graph API** - 文件和存储操作
- **SharePoint Embedded** - 核心数据存储

---

## 功能说明

### 用户功能

#### 1. 身份验证（Authentication）

- ✅ 通过 Microsoft Entra ID 登录
- ✅ 安全的 token 管理
- ✅ 自动 token 刷新

#### 2. 容器管理（Container Management）

- ✅ 查看已有容器列表
- ✅ 创建新容器
- ✅ 查看容器信息

#### 3. 文件浏览（File Browsing）

- ✅ 浏览容器中的文件和文件夹
- ✅ 文件夹导航（面包屑）
- ✅ 快速返回父文件夹

#### 4. 文件操作（File Operations）

- ✅ 上传单个文件
- ✅ 上传整个文件夹（保留文件夹结构）
- ✅ 下载单个文件
- ✅ 批量下载多个文件（ZIP 归档）
- ✅ 删除文件和文件夹
- ✅ 创建新文件夹

#### 5. 文件预览（File Preview）

- ✅ 在线预览 Office 文档（Word, Excel, PowerPoint）
- ✅ 预览其他支持的文件格式
- ✅ 在新标签页打开
- ✅ 下载预览文件

#### 6. 进度反馈（Progress Feedback）

- ✅ 上传进度显示
- ✅ 下载进度显示（对于大型 ZIP）
- ✅ 实时文件计数和大小显示

### 技术功能

#### 后端

- ✅ JWT 签名验证（JWKS）
- ✅ OBO (On-Behalf-Of) token 交换
- ✅ 权限范围 (Scope) 检查
- ✅ 异步任务处理 (Job Queue)
- ✅ 分页处理（Graph API 返回超过 200 项时）
- ✅ CORS 跨域资源共享
- ✅ 多云环境支持（全球/中国）

#### 前端

- ✅ MGT Provider 管理
- ✅ React Hooks（状态管理）
- ✅ TypeScript 类型检查
- ✅ 响应式设计（Fluent UI）
- ✅ Fluent Design System 主题

---

## 开发指南

### 调试后端

```bash
# 运行调试模式
npm run dev:backend:debug

# 或手动编译和运行
npm run build:server
node server/index.js
```

### 查看调试信息

后端会输出详细的日志，包括：

- 接收到的请求
- Token 验证过程
- Graph API 调用
- 错误和异常

例如：

```
[2024-01-01 10:00:00] POST /api/createContainer
[2024-01-01 10:00:01] Token verified: user@example.com
[2024-01-01 10:00:02] Graph API: POST /storage/fileStorage/containers
[2024-01-01 10:00:03] Container created: b!abc123
```

### 使用 Postman 测试 API

1. 打开 `postman/SharePoint Embedded.cloudswitch.postman_collection.json`
2. 在 Postman 中导入 Collection
3. 配置环境变量（tenant, clientId, etc.）
4. 执行 API 请求

### 常见开发任务

#### 添加新 API 端点

**后端 (server/index.ts)**

```typescript
server.post("/api/newEndpoint", async (req, res) => {
  // 验证权限
  const auth = await authorizeContainerManageRequest(req);
  if (!auth.ok) {
    return res.send(auth.status, { message: auth.body.message });
  }

  // 获取 Graph token
  const graphToken = await getGraphToken(auth.token);
  const graphClient = createGraphClient(graphToken);

  // 处理请求
  // ...
});
```

**前端 (src/services/spembedded.ts)**

```typescript
async newMethod(...): Promise<T> {
  const token = await this.getApiAccessToken();
  const response = await fetch(`${clientConfig.apiServerUrl}/api/newEndpoint`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(...),
  });

  if (response.ok) {
    return await response.json();
  }
  throw new Error('API call failed');
}
```

#### 修改 UI 样式

所有组件使用 `makeStyles` hook，可以在 Fluent UI 的设计令牌中修改：

```typescript
const useStyles = makeStyles({
  myComponent: {
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "10px",
  },
});
```

---

## 配置参考

### 后端环境变量 (.env)

```env
# Entra ID
API_ENTRA_APP_CLIENT_ID=<应用 ID>
API_ENTRA_APP_CLIENT_SECRET=<客户端机密>
API_ENTRA_APP_TENANT_ID=<租户 ID>

# SharePoint Embedded
API_CONTAINER_TYPE_ID=<容器类型 ID>

# 云环境
API_CLOUD_ENV=global              # 或 china

# 服务器
API_PORT=5000
API_BASE_URL=http://localhost:5000
API_FRONTEND_URL=http://localhost:3000

# 日志
API_LOG_LEVEL=info                # debug, info, warn, error
```

### 前端环境变量 (.env.local)

```env
# Entra ID 应用配置
REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID=<前端应用 ID>
REACT_APP_CLIENT_ENTRA_APP_TENANT_ID=<租户 ID>

# 后端 API 配置
REACT_APP_API_ENTRA_APP_CLIENT_ID=<后端应用 ID>
REACT_APP_API_SERVER_URL=http://localhost:5000

# 云环境
REACT_APP_CLOUD_ENV=global

# 图表 API 基础 URL（可选）
REACT_APP_GRAPH_BASE_URL=https://graph.microsoft.com
```

---

## 常见问题

### Q: 我的 Token 不被接受？

**A:** 检查以下几点：

1. Token 未过期
2. Entra ID 应用的 clientId 配置正确
3. 前端和后端应用 ID 不同（这是正确的）
4. 用户被授予了 Container.Manage 权限

### Q: 如何在中国 Azure 上运行？

**A:** 设置环境变量：

```env
API_CLOUD_ENV=china
REACT_APP_CLOUD_ENV=china
```

### Q: 大文件上传会超时吗？

**A:** 对于超大文件，考虑：

1. 使用 Graph API 的可恢复上传
2. 分块上传
3. 增加超时时间

### Q: 如何批量导入文件？

**A:** 前端支持文件夹上传：

1. 点击 "上传文件夹"
2. 选择整个文件夹
3. 应用自动保留文件夹结构

### Q: 运行出现内存溢出？

**A:** 可能是：

1. 一次性下载过多大文件
2. 容器中有数千个文件
3. 内存泄漏（检查代码）

解决办法：

- 减少一次性下载的文件数
- 增加 Node.js 堆大小：`node --max-old-space-size=4096`
- 使用流式处理而非一次性加载

---

## 贡献指南

### 代码风格

- 使用 TypeScript（类型安全）
- 使用 ESLint（代码检查）
- 使用2空格缩进
- 在重要逻辑处添加注释（中文）

### 提交变更

1. Fork 项目
2. 创建特性分支（`git checkout -b feature/amazing-feature`）
3. 提交变更（`git commit -m 'Add some amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 创建 Pull Request

### 代码审查检查表

- [ ] 代码可以编译（`npm run build`）
- [ ] 没有 TypeScript 错误
- [ ] 添加了有意义的注释
- [ ] 遵循现有代码风格
- [ ] 测试了新功能
- [ ] 更新了相关文档

---

## 相关资源

### 官方文档

- [Microsoft Graph 文档](https://learn.microsoft.com/zh-cn/graph/)
- [SharePoint Embedded API](https://learn.microsoft.com/zh-cn/graph/api/resources/filestoragecontainer)
- [MGT React 组件](https://learn.microsoft.com/zh-cn/graph/toolkit/overview)
- [MSAL.js 文档](https://github.com/AzureAD/microsoft-authentication-library-for-js)

### 学习资源

- [Microsoft Graph 教程](https://learn.microsoft.com/zh-cn/training/modules/sharepoint-embedded-create-app)
- [Fluent UI 组件库](https://react.fluentui.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### 工具

- [Graph Explorer](https://developer.microsoft.com/zh-cn/graph/graph-explorer)
- [JWT Debugger](https://jwt.ms)
- [Postman](https://www.postman.com/)

---

## 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

## 支持

- 📖 查看 [前端文档](./src/README.md)
- 📖 查看 [后端文档](./server/README.md)
- 🐛 提交 Issue 报告问题
- 💬 在讨论区提问

---

**最后更新**：2024 年 4 月

**项目状态**：✅ 活跃开发中

**维护者**：SharePoint Embedded Demo 团队

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
