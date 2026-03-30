# 环境变量重构计划

## 目标

把可变配置从硬编码常量中剥离，采用前后端分层配置：

- **前端**：只消费公开环境变量（`REACT_APP_*`，构建时注入）
- **后端**：只消费私有环境变量（`.env` + `process.env`，运行时注入）
- 补齐 `.gitignore` 忽略规则与 `.env.example` 模板，避免密钥泄露与环境漂移

---

## 决策记录

| 决策点                             | 结论                                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| `CONTAINER_TYPE_ID` 是否暴露给前端 | **否**，后端独占                                               |
| 配置校验方式                       | **手写校验**，不引入 schema 校验依赖（如 zod）                 |
| 前后端配置文件是否合并             | **否**，各自独立配置模块                                       |
| 常量文件策略                       | 保留 truly static 常量（scopes/type defs），删除环境相关硬编码 |

---

## 配置项分类

### 前端公开配置（`.env` → `REACT_APP_*`，打包进 bundle，浏览器可见）

| 变量名                                 | 作用                                                     | 当前位置                         |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------- |
| `REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID` | 前端 AAD App 的 Client ID，用于 MGT Msal2Provider 初始化 | `src/common/constants.ts` 硬编码 |
| `REACT_APP_CLIENT_ENTRA_APP_TENANT_ID` | Tenant ID                                                | `src/common/constants.ts` 硬编码 |
| `REACT_APP_API_ENTRA_APP_CLIENT_ID`    | API AAD App 的 Client ID，用于构造 token audience scope  | `src/common/constants.ts` 硬编码 |
| `REACT_APP_API_SERVER_URL`             | 后端 API base URL                                        | `src/common/constants.ts` 硬编码 |

> `CLIENT_ENTRA_APP_AUTHORITY` 可由 `TENANT_ID` 在配置模块中动态拼接，无需单独变量。

### 后端私有配置（`.env`，仅服务端进程，**不打包进前端**）

| 变量名                        | 作用                            | 当前位置                           |
| ----------------------------- | ------------------------------- | ---------------------------------- |
| `API_ENTRA_APP_CLIENT_ID`     | API AAD App 的 Client ID        | `.env` ✓                           |
| `API_ENTRA_APP_CLIENT_SECRET` | **敏感**：API AAD App 密钥      | `.env` ✓                           |
| `API_ENTRA_APP_AUTHORITY`     | AAD 授权端点 URL                | `.env` ✓                           |
| `CONTAINER_TYPE_ID`           | SPE 容器类型 ID                 | `.env` ✓，但未被 `.gitignore` 忽略 |
| `PORT`                        | 服务监听端口（可选，默认 3001） | `server/index.ts` 内联             |

---

## 重构步骤

### Step 1 — 前端配置模块（新增 `src/common/config.ts`）

```typescript
// src/common/config.ts
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`[config] Missing required env var: ${key}`);
  return value;
};

export const clientConfig = {
  clientEntraAppClientId: required("REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID"),
  tenantId: required("REACT_APP_CLIENT_ENTRA_APP_TENANT_ID"),
  apiEntraAppClientId: required("REACT_APP_API_ENTRA_APP_CLIENT_ID"),
  apiServerUrl: required("REACT_APP_API_SERVER_URL"),
  // 由 tenantId 动态拼接，不单独设变量
  get authority() {
    return `https://login.microsoftonline.com/${this.tenantId}`;
  },
};
```

**消费点改动：**

- `src/index.tsx`：`Constants.CLIENT_ENTRA_APP_CLIENT_ID` → `clientConfig.clientEntraAppClientId`
- `src/index.tsx`：`Constants.CLIENT_ENTRA_APP_AUTHORITY` → `clientConfig.authority`
- `src/services/spembedded.ts`：`Constants.API_ENTRA_APP_CLIENT_ID` → `clientConfig.apiEntraAppClientId`
- `src/services/spembedded.ts`：`Constants.API_SERVER_URL` → `clientConfig.apiServerUrl`

**前端 `.env` 补充（供 `react-scripts` 读取）：**

```
REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID=<your-client-app-id>
REACT_APP_CLIENT_ENTRA_APP_TENANT_ID=<your-tenant-id>
REACT_APP_API_ENTRA_APP_CLIENT_ID=<your-api-app-id>
REACT_APP_API_SERVER_URL=http://localhost:3001
```

---

### Step 2 — 后端配置模块（新增 `server/config.ts`）

```typescript
// server/config.ts
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`[config] Missing required env var: ${key}`);
  return value;
};

export const serverConfig = {
  clientId: required("API_ENTRA_APP_CLIENT_ID"),
  clientSecret: required("API_ENTRA_APP_CLIENT_SECRET"),
  authority: required("API_ENTRA_APP_AUTHORITY"),
  containerTypeId: required("CONTAINER_TYPE_ID"),
  port: process.env.PORT ?? "3001",
};
```

**消费点改动：**

- `server/createContainer.ts`：`msalConfig.auth.*` 和 `containerTypeId` 改从 `serverConfig` 取值
- `server/listContainers.ts`：`msalConfig.auth.*` 和 Graph API filter 改从 `serverConfig` 取值
- `server/index.ts`：在 `server.listen(...)` 前 `import "./config"` 以触发启动期校验（缺失变量立即 throw）

---

### Step 3 — 下线前端 `constants.ts` 中的环境相关硬编码

`src/common/constants.ts` **删除**以下导出（改由 `config.ts` 提供）：

- `CLIENT_ENTRA_APP_CLIENT_ID`
- `API_ENTRA_APP_CLIENT_ID`
- `CLIENT_ENTRA_APP_TENANT_ID`
- `CLIENT_ENTRA_APP_AUTHORITY`
- `API_SERVER_URL`
- `CONTAINER_TYPE_ID`

保留：truly static 常量（若有）。文件可能为空后可直接删除。

---

### Step 4 — 仓库安全治理

**更新 `.gitignore`**，在已有规则后追加：

```
# environment variables
.env
.env.*
!.env.example
```

**新增 `.env.example`**（无真实值，仅占位符）：

```dotenv
# === 后端 API 配置（私有，仅服务端使用）===
API_ENTRA_APP_CLIENT_ID=<your-api-entra-app-client-id>
API_ENTRA_APP_CLIENT_SECRET=<your-api-entra-app-client-secret>
API_ENTRA_APP_AUTHORITY=https://login.microsoftonline.com/<your-tenant-id>/

CONTAINER_TYPE_ID=<your-container-type-id>

# === 前端配置（通过 react-scripts 构建时注入）===
REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID=<your-client-entra-app-client-id>
REACT_APP_CLIENT_ENTRA_APP_TENANT_ID=<your-tenant-id>
REACT_APP_API_ENTRA_APP_CLIENT_ID=<your-api-entra-app-client-id>
REACT_APP_API_SERVER_URL=http://localhost:3001
```

---

### Step 5 — 文档对齐（更新 `README.md`）

在"配置文件"章节说明：

- 复制 `.env.example` 为 `.env` 并填入真实值
- 区分前后端变量的作用与可见性边界
- 说明 `REACT_APP_*` 变量会被打包进浏览器 bundle，不要放敏感信息

---

## 验证清单

- [ ] 前端代码中不再出现硬编码 tenant/clientId/apiUrl
- [ ] 后端业务文件不再散落 `process.env[...]`，统一来自 `serverConfig`
- [ ] `.env` 已被 `.gitignore` 忽略，`git status` 不显示 `.env`
- [ ] `.env.example` 无真实密钥
- [ ] `npm run start`：前端登录正常，容器查询/创建正常
- [ ] 删除一个必填变量后，启动期抛出清晰错误并终止

---

## 受影响文件

| 文件                         | 操作                               |
| ---------------------------- | ---------------------------------- |
| `src/common/config.ts`       | **新增**，前端配置模块             |
| `src/common/constants.ts`    | **修改**，删除环境相关导出         |
| `src/index.tsx`              | **修改**，改用 `clientConfig`      |
| `src/services/spembedded.ts` | **修改**，改用 `clientConfig`      |
| `server/config.ts`           | **新增**，后端配置模块             |
| `server/createContainer.ts`  | **修改**，改用 `serverConfig`      |
| `server/listContainers.ts`   | **修改**，改用 `serverConfig`      |
| `server/index.ts`            | **修改**，导入配置模块触发启动校验 |
| `.env`                       | **修改**，补充 `REACT_APP_*` 变量  |
| `.env.example`               | **新增**                           |
| `.gitignore`                 | **修改**，忽略 `.env`              |
| `README.md`                  | **修改**，更新配置说明             |
