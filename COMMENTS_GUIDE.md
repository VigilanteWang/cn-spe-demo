# 代码注释指南 - 初级开发者学习文档

> 本文档为改动的所有后端服务器文件详细讲解了代码含义和实现原理，适合初级开发者快速理解项目架构。

---

## 📋 目录

1. [auth.ts - 权限验证核心模块](#authtx)
2. [createContainer.ts - 创建容器API](#createcontainertx)
3. [listContainers.ts - 列表容器API](#listcontainertx)
4. [index.ts - 服务器主入口](#indextx)
5. [关键概念速查表](#关键概念速查表)

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
