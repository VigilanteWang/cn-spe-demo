# 后端服务文档

## 📋 目录

1. [项目概述](#项目概述)
2. [项目结构](#项目结构)
3. [核心模块详解](#核心模块详解)
4. [API 端点参考](#api-端点参考)
5. [权限验证流程](#权限验证流程)
6. [开发指南](#开发指南)
7. [关键概念速查表](#关键概念速查表)

---

## 项目概述

**SharePoint Embedded Demo 后端**是一个基于 Node.js + Express 的 REST API 服务，负责与 Microsoft Graph API 集成，为前端应用提供容器和文件操作接口。

### 主要职责

✅ **权限验证**：验证前端传来的 Access Token，确保用户有权限操作  
✅ **OBO 流程**：使用 On-Behalf-Of 流程交换 Graph API Token  
✅ **容器操作**：创建、列表、查询 SharePoint Embedded 容器  
✅ **文件操作**：上传、下载、删除、列表文件，通过 Graph API  
✅ **异步任务**：处理长时间的下载/归档操作（Job 队列）  
✅ **错误处理**：捕获并返回有意义的错误信息

### 技术栈

| 技术                       | 用途               |
| -------------------------- | ------------------ |
| **Node.js**                | 运行时环境         |
| **Restify**                | HTTP 服务框架      |
| **TypeScript**             | 类型安全           |
| **MSAL-Node**              | Entr ID 认证       |
| **Microsoft Graph**        | 与 SharePoint 交互 |
| **Express/Restify 中间件** | CORS、认证等       |

---

## 项目结构

```
server/
├── index.ts                         # 服务器主入口
├── auth.ts                          # 权限验证和 Token 处理
├── createContainer.ts               # 创建容器 API
├── listContainers.ts                # 列表容器 API
├── downloadArchive.ts               # 下载归档 API（Job 队列）
├── deleteItems.ts                   # 删除项目 API
├── config.ts                        # 配置和环境变量
├── tsconfig.json                    # TypeScript 配置
├── README.md                        # 本文件
│
└── common/
    └── scopes.ts                    # 权限范围定义
```

### 文件说明

| 文件                   | 职责                         | 关键函数                                                      |
| ---------------------- | ---------------------------- | ------------------------------------------------------------- |
| **index.ts**           | 服务器启动、路由注册、中间件 | n/a (Express 应用设置)                                        |
| **auth.ts**            | Token 验证、权限检查、OBO 流 | `authorizeContainerManageRequest()`                           |
| **createContainer.ts** | 容器创建 API                 | `createContainer()`                                           |
| **listContainers.ts**  | 容器列表 API                 | `listContainers()`                                            |
| **downloadArchive.ts** | 异步下载/归档                | `startDownloadArchive()`, `expandItem()`, `expandFolder()` 等 |
| **deleteItems.ts**     | 删除项目 API                 | `deleteItems()`                                               |
| **config.ts**          | 环境变量加载和验证           | n/a                                                           |

---

## 核心模块详解

### 1. auth.ts - 权限验证和 Token 处理

**文件位置**: `server/auth.ts`

**模块概要**

这是安全核心模块，负责：

- ✅ 验证前端 Access Token 的真实性
- ✅ 提取 Token 中的身份和权限信息
- ✅ 检查用户是否拥有 Container.Manage 权限
- ✅ 使用 OBO 流程获取 Graph API 的 Token
- ✅ 创建用于调用 Graph API 的客户端

**核心概念**

#### JWT (JSON Web Token)

JWT 是标准的身份令牌格式，分三部分用 `.` 分隔：

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwcyI6In0.nV...
|         Header (头)        |  |    Payload (载荷)      |  | Signature (签名) |
```

- **Header**：加密算法（如 RS256 = RSA + SHA256）
- **Payload**：用户身份、权限、过期时间等声明 (Claims)
- **Signature**：服务器私钥签署的数字签名，防止篡改

#### JWKS (JSON Web Key Set)

JWKS 是微软发布的**公钥集合**，用来验证 JWT 签名：

```
获取 JWKS → 查找签署 Token 的公钥 → 验证签名有效
```

#### Scope (权限范围)

Token 中的 `scp` claim 包含用户拥有的权限，示例：

```
scp: "Container.Manage FileStorageContainer.Selected"
```

#### Token 版本

Entra ID 支持两个 Token 版本：

| 版本     | 特点           | Issuer                                                                         |
| -------- | -------------- | ------------------------------------------------------------------------------ |
| **v1.0** | 旧版，向后兼容 | `sts.windows.net` (全球) / `sts.chinacloudapi.cn` (中国)                       |
| **v2.0** | 新版，推荐使用 | `login.microsoftonline.com` (全球) / `login.partner.microsoftonline.cn` (中国) |

**关键函数**

```typescript
/**
 * 验证容器管理权限
 *
 * 流程：
 * 1. 从 Header 提取 Bearer Token
 * 2. 从 Token Header 识别 kid (密钥 ID)
 * 3. 从 JWKS 获取该密钥的公钥
 * 4. 验证 Token 签名
 * 5. 验证 Token 未过期
 * 6. 验证 Token 的 audience（目标用户）
 * 7. 验证 Token 中包含 Container.Manage 权限
 *
 * @param req 请求对象
 * @returns 验证结果（成功或失败）
 */
async function authorizeContainerManageRequest(
  req,
): Promise<AuthorizationResult>;

/**
 * 使用 OBO 流程获取 Graph API Token
 *
 * On-Behalf-Of (代表用户) 流程：
 * 1. 后端接收前端的 Access Token (token A)
 * 2. 后端以应用身份向 Entra ID 请求：
 *    "我想代表用户使用 token A，给我一个 Graph API Token"
 * 3. Entra ID 验证 token A 有效，返回 Graph Token (token B)
 * 4. 后端使用 token B 调用 Graph API
 *
 * 优点：
 * - 保密：前端的敏感信息（如 Token）在后端验证
 * - 一致性：后端代表用户调用 Graph，权限检查一致
 */
async function getGraphToken(refreshToken): Promise<string>;

/**
 * 创建 Graph API 客户端
 *
 * 作用：初始化 Microsoft Graph SDK 客户端，配置认证、基 URL 等
 */
function createGraphClient(graphToken): GraphClient;
```

**工作流程示例**

```
前端用户点击 "创建容器"
  ↓
前端发送 POST /api/createContainer，Header: Authorization: Bearer {token A}
  ↓
后端接收请求
  ↓
调用 authorizeContainerManageRequest()
  ├─ 从 Header 提取 token A
  ├─ 验证签名和过期时间
  ├─ 检查 Container.Manage 权限
  └─ 提取用户身份 (claims)
  ↓
调用 getGraphToken(token A via OBO)
  ├─ 向 Entra ID 使用 OBO 流程
  └─ 获取 Graph API Token (token B)
  ↓
创建 Graph 客户端，使用 token B
  ↓
调用 Graph API 创建容器
  ↓
返回结果给前端
```

### 2. createContainer.ts - 创建容器 API

**模块概要**

提供 POST /api/createContainer API，允许用户创建新容器。

**请求/响应**

```bash
POST /api/createContainer

请求 Header:
  Authorization: Bearer {access_token}
  Content-Type: application/json

请求 Body:
  {
    "displayName": "My Container",
    "description": "A test container"
  }

响应 (201 Created):
  {
    "id": "b!abc123...",
    "displayName": "My Container",
    "containerTypeId": "...-...-...",
    "createdDateTime": "2024-01-01T10:00:00Z"
  }
```

**设计特点**

- ✅ 验证容器名称有效
- ✅ 使用 containerTypeId (从环境变量) 指定容器类型
- ✅ 捕获并返回 Graph API 错误

### 3. listContainers.ts - 容器列表 API

**模块概要**

提供 GET /api/listContainers API，返回用户有权访问的容器列表。

**请求/响应**

```bash
GET /api/listContainers

请求 Header:
  Authorization: Bearer {access_token}

响应 (200 OK):
  {
    "value": [
      {
        "id": "b!abc123...",
        "displayName": "Container 1",
        "containerTypeId": "...",
        "createdDateTime": "2024-01-01T00:00:00Z"
      },
      {
        "id": "b!def456...",
        "displayName": "Container 2",
        "containerTypeId": "...",
        "createdDateTime": "2024-01-02T00:00:00Z"
      }
    ]
  }
```

### 4. downloadArchive.ts - 异步文件下载/归档

**模块概要**

处理长时间操作的异步 API，将多个文件打包成 ZIP。使用工作队列 (Job Queue) 实现：

```
POST /api/downloadArchive/start → 返回 jobId
                ↓
GET /api/downloadArchive/progress/{jobId} → 轮询进度
                ↓
GET /api/downloadArchive/file/{jobId} → 下载 ZIP
```

**API 端点**

```bash
# 启动下载任务
POST /api/downloadArchive/start
  Body: { "containerId": "...", "itemIds": [...] }
  Response: { "jobId": "job-123-..." }

# 查询进度
GET /api/downloadArchive/progress/job-123-...
  Response: {
    "status": "preparing|zipping|ready|failed",
    "processedFiles": 45,
    "totalFiles": 100,
    "currentItem": "document.pdf",
    "errors": []
  }

# 下载 ZIP 文件
GET /api/downloadArchive/file/job-123-...
  Response: Binary ZIP data
```

**关键函数**

```typescript
/**
 * 递归展开项目（获取文件夹内容）
 *
 * 场景：用户选择了一个文件夹，需要下载其所有内容
 *
 * 处理过程：
 * 1. 获取文件夹的 children
 * 2. 对每个 child：
 *    - 如果是文件，记录文件 URL
 *    - 如果是文件夹，递归展开
 * 3. 返回扁平的文件列表
 */
async function expandItem(graphClient, driveId, itemId): Promise<FileInfo[]>

/**
 * 递归获取文件夹所有文件
 *
 * 特点：处理 Graph API 分页（默认返回 200 项）
 * 如果文件夹包含超过 200 个文件，需要尝试获取更多页
 */
async function expandFolder(...)
```

**设计考虑**

- **内存管理**：大量文件不会一次性加载到内存，使用流式处理
- **超时处理**：长时间归档可能超时，通过 Job Queue 处理
- **并发控制**：避免同时开始过多的文件下载
- **错误恢复**：如果某些文件下载失败，记录错误继续

### 5. deleteItems.ts - 删除项目 API

**请求/响应**

```bash
POST /api/deleteItems

请求 Body:
  {
    "containerId": "b!...",
    "itemIds": ["item-1", "item-2", ...]
  }

响应:
  {
    "successful": ["item-1"],
    "failed": [
      { "id": "item-2", "reason": "Access Denied" }
    ]
  }
```

**特点**

- ✅ 逐个删除，收集成功/失败结果
- ✅ 不会因为某个文件删除失败而中断
- ✅ 返回详细的失败原因

---

## API 端点参考

### 容器操作

#### GET /api/listContainers

获取用户有权访问的容器列表。

**权限要求**：Container.Manage

**响应**

```json
{
  "value": [
    {
      "id": "string",
      "displayName": "string",
      "containerTypeId": "string",
      "createdDateTime": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/createContainer

创建新的 SharePoint Embedded 容器。

**权限要求**：Container.Manage

**请求体**

```json
{
  "displayName": "string", // 必需：容器名称
  "description": "string" // 可选：容器描述
}
```

**响应** (IContainer)

```json
{
  "id": "b!...",
  "displayName": "string",
  "containerTypeId": "string",
  "createdDateTime": "2024-01-01T00:00:00Z"
}
```

### 文件操作

#### POST /api/deleteItems

删除一个或多个文件/文件夹。

**权限要求**：FileStorageContainer.Selected

**请求体**

```json
{
  "containerId": "b!...",           // 容器 ID
  "itemIds": ["id1", "id2", ...]   // 要删除的项目 ID
}
```

**响应**

```json
{
  "successful": ["id1"],
  "failed": [
    {
      "id": "id2",
      "reason": "Access Denied"
    }
  ]
}
```

### 下载/归档操作

#### POST /api/downloadArchive/start

启动文件下载/归档任务。

**权限要求**：FileStorageContainer.Selected

**请求体**

```json
{
  "containerId": "b!...",
  "itemIds": ["file1", "folder1", ...]
}
```

**响应**

```json
{
  "jobId": "job-uuid-..."
}
```

#### GET /api/downloadArchive/progress/:jobId

查询下载任务的进度。

**响应**

```json
{
  "status": "queued|preparing|zipping|ready|failed",
  "processedFiles": 0,
  "totalFiles": 5,
  "currentItem": "filename.pdf",
  "errors": []
}
```

#### GET /api/downloadArchive/file/:jobId

下载已完成的 ZIP 文件。

**响应**：Binary ZIP data (Content-Type: application/zip)

---

## 权限验证流程

### 整体流程

```
┌─────────────────────────────────────────────────────┐
│ 前端请求 API                                        │
│ GET /api/listContainers                             │
│ Header: Authorization: Bearer {accessToken}         │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 后端接收请求                                        │
│ 调用 authorizeContainerManageRequest()              │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 步骤1. 解析 Bearer Token                            │
│ const token = req.headers.authorization.split(" ")[1]
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 步骤2. 验证 Token 签名                              │
│ - 获取 Token Header 中的 kid (密钥 ID)              │
│ - 从 JWKS 获取该 kid 对应的公钥                     │
│ - 验证 Token 签名                                  │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 步骤3. 验证 Token 声明 (Claims)                    │
│ - exp: Token 未过期                                │
│ - aud: Audience 是本应用的 Client ID               │
│ - iss: Issuer 是微软 Entra ID                      │
│ - ver: Token 版本（1.0 或 2.0）                    │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 步骤4. 检查权限 (Scopes)                           │
│ 检查 scp claim 是否包含 "Container.Manage"         │
└────────────────────┬────────────────────────────────┘
                     ↓
         验证通过 ✓         验证失败 ✗
            ↓                  ↓
    调用实际 API          返回 401/403 错误
         ↓
    调用 getGraphToken(token) 获取 Graph API Token
         ↓
    创建 Graph Client
         ↓
    调用 Graph API
         ↓
    返回结果给前端
```

### 云环境选择

后端支持全球和中国 Azure 环境：

```typescript
// 全球环境
AAD AUTHORITY: https://login.microsoftonline.com
GRAPH API:     https://graph.microsoft.com

// 中国环境
AAD AUTHORITY: https://login.chinacloudapi.cn
GRAPH API:     https://microsoftgraph.chinacloudapi.cn
```

通过环境变量 `API_CLOUD_ENV` (global|china) 选择。

---

## 开发指南

### 环境变量配置

复制 `.env` 文件，填入您的值：

```bash
# Entra ID 应用配置
API_ENTRA_APP_CLIENT_ID=<your_app_id>
API_ENTRA_APP_CLIENT_SECRET=<your_app_secret>
API_ENTRA_APP_TENANT_ID=<your_tenant_id>

# SharePoint Embedded 配置
API_CONTAINER_TYPE_ID=<your_container_type_id>

# 云环境
API_CLOUD_ENV=global

# 前端地址（CORS）
API_FRONTEND_URL=http://localhost:3000

# 服务器配置
API_PORT=5000
API_BASE_URL=http://localhost:5000
```

### 本地运行

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 运行（调试模式）
npm run dev:backend:debug

# 或生产模式
npm start
```

### 新增 API 端点

1. 在 `index.ts` 中注册路由：

```typescript
server.post("/api/newEndpoint", authenticateAndHandle);
```

2. 创建处理函数，验证权限：

```typescript
async function handleNewEndpoint(req, res) {
  // 验证权限
  const auth = await authorizeContainerManageRequest(req);
  if (!auth.ok) {
    return res.send(auth.status, { message: auth.body.message });
  }

  // 业务逻辑
  const graphToken = await getGraphToken(auth.token);
  const graphClient = createGraphClient(graphToken);

  // 调用 Graph API
  const result = await graphClient.api(...).get();
  res.send(200, result);
}
```

### 测试 API

使用 Postman 或 curl 测试：

```bash
# 获取容器列表
curl -H "Authorization: Bearer {token}" \
     http://localhost:5000/api/listContainers

# 创建容器
curl -X POST http://localhost:5000/api/createContainer \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"displayName":"Test","description":"Test container"}'
```

---

## 关键概念速查表

| 概念              | 说明                                   | 相关文件                  |
| ----------------- | -------------------------------------- | ------------------------- |
| **JWT**           | JSON Web Token，身份令牌格式           | auth.ts                   |
| **JWKS**          | JSON Web Key Set，微软公钥集合         | auth.ts                   |
| **OBO**           | On-Behalf-Of，代表用户交换 token       | auth.ts                   |
| **Scope**         | OAuth 权限范围，如 Container.Manage    | common/scopes.ts, auth.ts |
| **Token Version** | v1.0 (旧) vs v2.0 (新)                 | auth.ts                   |
| **Cloud Env**     | 云环境选择：Global vs China            | config.ts                 |
| **Job Queue**     | 异步任务队列，处理长时间操作           | downloadArchive.ts        |
| **Pagination**    | Graph API 分页（默认 200 + next link） | downloadArchive.ts        |

---

**最后更新**：2024 年 4 月

---

## auth.ts

**文件位置**: `server/auth.ts`

### 模块概要

这是项目的安全核心模块，负责：

- ✅ 验证前端发来的 Access Token 是否有效
- ✅ 提取 Token 中的身份信息（用户ID、租户ID、权限等）
- ✅ 检查用户是否拥有必要的权限（Container.Manage）
- ✅ 用 OBO 流程兑换微软 Graph API Token
- ✅ 创建与 Graph API 通信的客户端

### 关键概念详解

#### 概念1️⃣: 什么是 JWT (JSON Web Token)?

JWT 是一种标准的身份令牌格式，由三部分用 `.` 分隔组成：

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwcyI6Ly9sb2dpbi5taWNyb3NvZnRvbmxpbmUuY29tIn0.nVDXYqH6YqMIKf...
|                Header                |  |           Payload              |  |          Signature              |
```

- **Header** (头): 说明使用的加密算法，如 RS256（RSA + SHA256）
- **Payload** (载荷): 用户身份信息，如用户ID、权限、过期时间等
- **Signature** (签名): 用服务器私钥签署的数字签名，证明 Token 没有被篡改

#### 概念2️⃣: JWKS (JSON Web Key Set) 是什么?

JWKS 是微软发布的**公钥集合**，格式如下：

```json
{
  "keys": [
    { "kty": "RSA", "use": "sig", "kid": "key-id-1", "n": "...", "e": "AQAB", ... },
    { "kty": "RSA", "use": "sig", "kid": "key-id-2", "n": "...", "e": "AQAB", ... }
  ]
}
```

**作用**: 像网站的 SSL 证书一样，用来验证 JWT 签名是否真正来自微软官方。

**工作原理**:

1. Token 的 header 包含 `kid` (Key ID)，指向 JWKS 中的某个公钥
2. 我们用该公钥验证 Token 的签名
3. 如果验证成功 = Token 确实由微软签发

#### 概念3️⃣: Access Token 版本 (v1.0 vs v2.0)

微软有两种 Token 格式，区别在于 **issuer** (发行者) 的格式：

| 特性              | v1.0                                       | v2.0                                                       |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------- |
| **Issuer 格式**   | `https://sts.windows.net/{tenantId}/`      | `https://login.microsoftonline.com/{tenantId}/v2.0`        |
| **中国云 Issuer** | `https://sts.chinacloudapi.cn/{tenantId}/` | `https://login.partner.microsoftonline.cn/{tenantId}/v2.0` |
| **JWKS 端点**     | `/discovery/keys`                          | `/discovery/v2.0/keys`                                     |
| **发行策略**      | 由 API app 的清单配置决定                  | 由 API app 的清单配置决定                                  |

**重要**: Token 版本由 API 应用注册时的配置决定，不是前端能控制的！

#### 概念4️⃣: OBO (On-Behalf-Of) 流程

OBO 是一种安全的权限委托方式：

```
┌──────────┐                ┌──────────┐              ┌──────────────┐
│   前端   │  Token A       │ 后端 API │  Token B     │ Microsoft    │
│  (SPA)   │─────────────>  │  (Node)  │─────────>    │  Graph API   │
└──────────┘                └──────────┘              └──────────────┘
             "我是用户，给你Token"   "我代表用户，请给我Graph Token"   "好的，这是Graph Token"
```

**为什么需要 OBO?**

1. 前端不能直接访问后端系统的私钥
2. 需要后端代表用户去访问 Graph API（本地化数据）
3. OBO 保证只有已授权用户的 Token 才能换到 Graph Token

### 代码路由解析

#### 主函数: `authorizeContainerManageRequest()`

这个函数是 API 的守门员，检查：

```typescript
export const authorizeContainerManageRequest = async (
  req: Request,
): Promise<AuthorizationResult> => {
  // 步骤 1️⃣: 获取 Authorization header
  // 期望格式: "Bearer eyJhbGc..." (必须有 Bearer 前缀)
  const authorizationHeader = req.headers.authorization;

  // 步骤 2️⃣: 严格检查格式
  // 有效: "Bearer <token>"
  // 无效: "bearer <token>" (大小写错)、"<token>" (缺 Bearer)、"Bearer <token> extra" (多余部分)

  // 步骤 3️⃣: 验证 Token 签名 (async)
  // 不仅检查格式，还要确保 Token 确实由微软签名
  // 如果失败 = Token 被篡改或伪造
  const claims = await verifyAccessToken(token);

  // 步骤 4️⃣: 检查权限范围
  // Token 的 scp claim 必须包含 "Container.Manage"
  // 否则即使 Token 有效也拒绝访问 (403 Forbidden)

  return { ok: true, token, claims }; // 全部通过！
};
```

**返回值**:

- ✅ `ok: true` - Token 有效且有权限，可以继续
- ❌ `ok: false, status: 401` - Token 无效或缺失
- ❌ `ok: false, status: 403` - Token 有效但权限不足

#### 核心验证: `verifyAccessToken()`

验证过程分为两部分：

```typescript
const verifyAccessToken = async (token: string): Promise<ApiAccessTokenClaims> => {
  // 第一部分 ⚡️ 快速检查
  const decodedClaims = decodeTokenClaims(token);  // 无验证，只是 base64 解码
  const tokenVersion = decodedClaims.ver === "2.0" ? "2.0" : "1.0";  // 决定 JWKS 版本

  // 租户隔离检查 - 防止其他租户 Token 被接受
  if (decodedClaims.tid !== serverConfig.tenantId) {
    throw new Error("Access token tenant does not match API tenant.");
  }

  // 第二部分 🔐 完整验证 (耗时较长)
  return new Promise((resolve, reject) => {
    verify(token, ...);  // 使用 JWKS 公钥验证签名
  });
}
```

#### OBO 流程: `getGraphToken()`

用户 Token 的转换器：

```typescript
export const getGraphToken = async (userToken: string): Promise<string> => {
  // 构建请求
  const oboRequest = {
    oboAssertion: userToken, // 用户的 Token
    scopes: [
      `${serverConfig.graphBaseUrl}/${SPEMBEDDED_FILESTORAGECONTAINER_SELECTED}`,
      // 这表示：给我一个可以访问 FileStorageContainer.Selected 范围的 Token
    ],
  };

  // 向 Entra ID 请求
  // 微软看到：API 用自己的秘钥说"用户给了我 userToken，我要要求 Graph Token"
  // 微软验证：秘钥是真的？userToken 有效？-> 发行 Graph Token
  const graphToken =
    await confidentialClient.acquireTokenOnBehalfOf(oboRequest);

  return graphToken;
};
```

### 性能优化细节

**JWKS 缓存**:

```typescript
const jwksClients = {
  "1.0": jwksClient({
    jwksUri: "...",
    cache: true, // ✅ 启用本地缓存
    cacheMaxAge: 10 * 60 * 1000, // 📅 10 分钟后自动更新
    rateLimit: true, // 🛡️ 防止缓存失效时的网络洪泛
  }),
};
```

**性能指标**:

- 首次验证：50-100ms（需要网络获取公钥）
- 缓存命中：1-2ms（本地缓存的公钥）
- 99%+ 的请求从缓存命中（10 分钟内）

---

## createContainer.ts

**文件位置**: `server/createContainer.ts`

### 快速概览

```
用户请求
   ↓
[1] 验证身份和权限 (auth.ts)
   ↓
[2] OBO 流程换 Graph Token (auth.ts)
   ↓
[3] 调用微软 Graph API 创建容器
   ↓
返回创建结果
```

### 请求处理流程

```typescript
export const createContainer = async (req: Request, res: Response) => {
  // 【第1步】身份验证
  const authResult = await authorizeContainerManageRequest(req);
  if (!authResult.ok) {
    // ❌ 验证失败：返回 401/403 错误
    res.send(authResult.status, authResult.body);
    return;
  }

  // ✅ 验证成功，authResult.token 是已验证的用户 Token

  // 【第2步】OBO 流程
  const graphToken = await getGraphToken(authResult.token);
  // 现在 graphToken 是我们可以代表用户调用 Graph API 的 Token

  // 【第3步】创建 Graph 客户端
  const graphClient = createGraphClient(graphToken);

  // 【第4步】准备请求数据
  const containerData = {
    displayName: req.body.displayName, // "My Container"
    description: req.body.description || "", // "A test"
    containerTypeId: serverConfig.containerTypeId, // "standard"
  };

  // 【第5步】调用 Graph API
  const result = await graphClient
    .api("/storage/fileStorage/containers") // SharePoint Embedded API
    .version("v1.0") // 使用稳定版本
    .post(containerData); // 发送 POST 请求

  // 【第6步】返回结果
  res.send(200, result); // 200 = 成功创建
};
```

### Graph API 细节

**API 端点**: `/storage/fileStorage/containers`

这是微软 Graph 中专门用于 SharePoint Embedded 容器的端点。

**请求体示例**:

```json
{
  "displayName": "Project Files",
  "description": "Shared project documentation",
  "containerTypeId": "standard"
}
```

**响应示例**:

```json
{
  "id": "b!abc123...",
  "displayName": "Project Files",
  "createdDateTime": "2026-04-01T10:30:00Z",
  "description": "Shared project documentation",
  "containerTypeId": "standard",
  "status": "active"
}
```

---

## listContainers.ts

**文件位置**: `server/listContainers.ts`

### 快速概览

```
用户请求
   ↓
[1] 验证身份和权限
   ↓
[2] OBO 流程换 Graph Token
   ↓
[3] 调用微软 Graph API 查询容器（使用 OData 过滤）
   ↓
返回容器列表
```

### OData 过滤详解

**OData** 是微软的查询语言（不是 SQL！），用于 Graph API：

```typescript
const response = await graphClient
  .api("/storage/fileStorage/containers")
  .filter(`containerTypeId eq ${serverConfig.containerTypeId}`)
  .get();
```

**OData 语法**:

| 表达式 | 含义   | 示例                                            |
| ------ | ------ | ----------------------------------------------- |
| `eq`   | 等于   | `displayName eq 'Project'`                      |
| `ne`   | 不等于 | `status ne 'archived'`                          |
| `gt`   | 大于   | `createdDateTime gt 2026-01-01`                 |
| `lt`   | 小于   | `createdDateTime lt 2026-12-31`                 |
| `and`  | 逻辑与 | `status eq 'active' and displayName eq 'Files'` |

**复杂查询示例**:

```javascript
await graphClient
  .api("/storage/fileStorage/containers")
  .filter(`containerTypeId eq 'standard' and createdDateTime gt 2026-01-01`)
  .orderBy("displayName") // 按名称排序
  .top(10) // 只获取前 10 个
  .get();
```

### 响应格式

```json
{
  "value": [
    {
      "id": "b!xyz123...",
      "displayName": "Project A",
      "createdDateTime": "2026-01-15T09:00:00Z",
      "containerTypeId": "standard"
    },
    {
      "id": "b!abc456...",
      "displayName": "Project B",
      "createdDateTime": "2026-02-20T14:30:00Z",
      "containerTypeId": "standard"
    }
  ]
}
```

**注意**: Graph API 使用 `value` 数组包装列表，这是 OData 标准。

---

## index.ts

**文件位置**: `server/index.ts`

### 服务器架构概览

```
┌─────────────────────────────────────┐
│     HTTP 请求 (localhost:3001)      │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│   CORS 中间件 (跨域请求检查)        │
│   - 验证 Origin
│   - 设置响应头
│   - 处理 OPTIONS 预检
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│   路由匹配 (GET/POST)               │
│   - /api/listContainers
│   - /api/createContainer
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│   业务逻辑处理                      │
│   - 权限验证 (auth.ts)
│   - Graph API 调用
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│   HTTP 响应 (JSON)                  │
└─────────────────────────────────────┘
```

### CORS 详解

CORS (Cross-Origin Resource Sharing) 是浏览器安全机制。

**问题**: 浏览器默认不允许 JavaScript 访问任何不同源的数据（防止钓鱼攻击）。

**解决**: 服务器返回特殊的响应头告诉浏览器"这个跨源请求是被允许的"。

**请求 -> 响应 流程**:

```
📱 浏览器 (http://localhost:3000)
  │
  ├─ 发送 Preflight 请求 (OPTIONS)
  │  ├─ Origin: http://localhost:3000
  │  ├─ Access-Control-Request-Method: POST
  │  └─ Access-Control-Request-Headers: Authorization, Content-Type
  │
  └─ 服务器响应
     ├─ Access-Control-Allow-Origin: http://localhost:3000  ✅
     ├─ Access-Control-Allow-Methods: GET, POST, ...
     ├─ Access-Control-Allow-Headers: Authorization, Content-Type
     └─ HTTP 204 No Content

  ✅ 预检通过，浏览器允许实际请求
```

### 中间件执行顺序

```typescript
// 1️⃣ bodyParser 中间件 (每个请求都经过)
server.use(restify.plugins.bodyParser());
// 作用: req.body = JSON.parse(request body)

// 2️⃣ CORS 中间件 (每个请求都经过，但在路由之前)
server.pre((req, res, next) => { ... });
// 作用: 设置 CORS headers，处理 OPTIONS 请求

// 3️⃣ 路由处理器 (只有匹配的路由才执行)
server.get("/api/...", ...)
server.post("/api/...", ...)
// 作用: 处理具体业务逻辑
```

**执行顺序示例**:

```
请求 (POST /api/createContainer)
  ↓
bodyParser() ✓ 解析 JSON
  ↓
CORS pre() ✓ 检查跨域，设置响应头
  ↓
POST /api/createContainer 路由 ✓ 创建容器
  ↓
try-catch 错误处理 ✓ 返回结果或错误
  ↓
next() 清理资源
  ↓
响应发送给浏览器
```

---

## 关键概念速查表

### 🔐 安全相关

| 概念  | 含义             | 用途                   |
| ----- | ---------------- | ---------------------- |
| JWT   | JSON Web Token   | 身份令牌               |
| RS256 | RSA + SHA256     | Token 签名方式         |
| JWKS  | JSON Web Key Set | 公钥集合，用于验证 JWT |
| OBO   | On-Behalf-Of     | 权限委托流程           |
| Scope | 权限范围         | 控制 Token 能做什么    |

### 🌐 API 相关

| 概念          | 含义     | 示例                      |
| ------------- | -------- | ------------------------- |
| Access Token  | 访问令牌 | 用于 API 请求             |
| Refresh Token | 刷新令牌 | 用于获取新的 Access Token |
| Tenant        | 租户     | 独立的 Azure 实例         |
| OData         | 查询语言 | 用于 Graph API 过滤       |
| Graph API     | 微软 API | 访问 Microsoft 365 数据   |

### 🛠️ Node.js 相关

| 概念        | 含义         | 示例                            |
| ----------- | ------------ | ------------------------------- |
| Restify     | HTTP 框架    | `server.get()`, `server.post()` |
| Middleware  | 中间件       | `bodyParser()`, `pre()`         |
| CORS        | 跨域资源共享 | 处理浏览器跨域请求              |
| Async/Await | 异步处理     | `await getGraphToken()`         |

### 📊 HTTP 状态码

| 状态码 | 含义         | 何时返回                       |
| ------ | ------------ | ------------------------------ |
| 200    | OK           | 请求成功                       |
| 204    | No Content   | 成功但无响应体（OPTIONS 预检） |
| 401    | Unauthorized | Token 无效或缺失               |
| 403    | Forbidden    | Token 有效但权限不足           |
| 500    | Server Error | 服务器内部错误                 |

---

## 💡 常见问题解答

### Q1: 为什么要分离前端和后端？

**A**: 安全性！

- ❌ 危险：前端保存 API 密钥或服务端密钥
- ✅ 安全：前端只有用户 Token，服务端掌控密钥

### Q2: 为什么需要 OBO 流程？

**A**: 权限委托！

- 前端: "我是用户 Alice，给你一个 Token"
- 后端: "用户 Alice 的数据在这里，我代表 Alice 访问 Graph API"
- 这样确保只有 Alice 能访问 Alice 的数据

### Q3: JWKS 缓存为什么需要 10 分钟更新？

**A**: 安全与性能的平衡！

- 如果永久缓存：新密钥更新时，旧密钥的 Token 仍然有效（不安全）
- 如果每次都网络请求：性能太差（100ms+ 每请求）
- 10 分钟：大多数请求走缓存（快速），定期检查新密钥（安全）

### Q4: 为什么要检查 `tid` (租户ID)？

**A**: 租户隔离！

- 防止 Tenant A 的用户 Token 被用来访问 Tenant B 的资源
- 即使 Token 签名有效，租户不匹配也拒绝

---

## 🎓 后续学习建议

### 初级阶段 ✅ (当前)

- [x] 理解 JWT 和 OAuth2 流程
- [x] 理解 OBO (On-Behalf-Of) 流程
- [x] 理解 CORS 和浏览器安全

### 中级阶段 📚

- [ ] 学习 MSAL (Microsoft Authentication Library) 源码
- [ ] 学习 Microsoft Graph SDK 的请求构造方式
- [ ] 理解 Token 缓存机制和 refresh 流程
- [ ] 学习速率限制和重试机制

### 高级阶段 🚀

- [ ] 自己实现 JWT 验证（不用外部库）
- [ ] 实现 Token 缓存管理系统
- [ ] 性能优化：异步验证、批量请求
- [ ] 安全加固：防止 token 回放攻击等

---

## 📚 参考资源

- [Microsoft Entra ID 官方文档](https://learn.microsoft.com/en-us/entra/identity-platform/)
- [JWT.io - JWT 介绍](https://jwt.io/)
- [Microsoft Graph API 文档](https://learn.microsoft.com/en-us/graph/overview)
- [OData 规范](https://www.odata.org/)
- [OAuth2 授权流程](https://auth0.com/docs/get-started/authentication-and-authorization-flow)

---

**文档更新时间**: 2026-04-01  
**适用版本**: Node.js 16+, TypeScript 4.9+
