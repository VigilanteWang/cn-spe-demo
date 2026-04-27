# 前端应用文档

> React + TypeScript + Fluent UI 实现的 SharePoint Embedded 文件管理前端

---

## 目录结构

```
src/
├── index.tsx                  # 应用入口，初始化 MGT Provider
├── App.tsx                    # 主组件，登录状态管理 + 布局
├── customTheme.tsx            # Fluent UI 自定义主题配置
├── index.css                  # 全局样式
├── common/
│   ├── config.ts              # 环境变量配置管理（云环境、API 地址等）
│   ├── scopes.ts              # Microsoft Graph 和 SPE 权限常量
│   └── types.ts               # TypeScript 类型定义（IContainer、IDriveItemExtended）
├── components/
│   ├── containers.tsx         # 容器管理组件（列表、选择、创建）
│   ├── files.tsx              # 文件管理组件（列表、上传、下载、删除、导航）
│   └── preview.tsx            # 文件预览组件（iframe 预览、导航、操作）
└── services/
    └── spembedded.ts          # 后端 API 服务层（封装所有后端调用）
```

## 核心概念

### 身份验证流程

```
用户点击 <Login /> → Msal2Provider 弹窗登录 → 获取 ID Token + Access Token
                                                        ↓
                                             globalProvider.state = SignedIn
                                                        ↓
                              组件通过 provider.getAccessToken() 获取 API Token
                                                        ↓
                                    前端发送 API Token 给后端 → 后端 OBO 换取 Graph Token
```

1. **index.tsx** 初始化 `Msal2Provider`，配置 clientId、authority、scopes
2. **App.tsx** 中的 `<Login />` 组件提供登录 UI，使用全局 Provider 完成登录
3. **spembedded.ts** 的 `getApiAccessToken()` 从全局 Provider 获取 API 专用 Token
4. Token 的 scope 格式为 `api://{apiClientId}/Container.Manage`
5. 后端收到 Token 后通过 OBO（On-Behalf-Of）流程换取 Graph API Token

### MGT (Microsoft Graph Toolkit)

- `Providers.globalProvider`：全局唯一的身份验证提供者（Msal2Provider 实例）
- `ProviderState.SignedIn`：表示用户已成功登录
- `<Login />`：预置的登录/登出按钮组件
- `Providers.globalProvider.graph.client`：已认证的 Graph 客户端，文件操作直接使用

### 组件树

```
<FluentProvider theme={customTheme}>     ← 提供 Fluent UI 主题
  <App>
    <Login />                            ← 登录按钮（来自 MGT）
    <Containers>                         ← 容器选择 + 创建
      <Files container={selected}>       ← 文件列表 + 工具栏
        <Preview file={current} />       ← 文件预览对话框
      </Files>
    </Containers>
  </App>
</FluentProvider>
```

### 数据流

| 操作       | 调用路径                                                     | API 类型       |
| ---------- | ------------------------------------------------------------ | -------------- |
| 列出容器   | `SpEmbedded.listContainers()` → 后端 `/api/listContainers`   | 后端 API       |
| 创建容器   | `SpEmbedded.createContainer()` → 后端 `/api/createContainer` | 后端 API       |
| 列出文件   | `graph.client.api(/drives/.../children)`                     | Graph API 直接 |
| 上传文件   | `graph.client.api(/drives/.../content).putStream()`          | Graph API 直接 |
| 创建文件夹 | `graph.client.api(/drives/.../children).post()`              | Graph API 直接 |
| 删除文件   | `SpEmbedded.deleteItems()` → 后端 `/api/deleteItems`         | 后端 API       |
| 下载文件   | `@microsoft.graph.downloadUrl` 直链                          | Graph 直链     |
| 下载归档   | `SpEmbedded.startDownloadArchive()` → 后端 ZIP 任务          | 后端 API       |
| 预览文件   | `graph.client.api(/drives/.../preview).post()`               | Graph API 直接 |

## 主要功能流程

### 1. 登录 → 容器列表

```
用户打开页面 → 点击 Login → globalProvider 登录
                                    ↓
                         App.tsx 检测到 isSignedIn=true
                                    ↓
                         渲染 <Containers />
                                    ↓
                         useEffect 调用 spe.listContainers()
                                    ↓
                         下拉框显示容器列表
```

### 2. 文件上传（支持文件夹）

```
用户点击 Upload File/Folder → 触发隐藏的 <input type="file">
                                    ↓
                         解析文件列表 + 相对路径
                                    ↓
                         逐文件处理：创建中间文件夹（如不存在）
                                    ↓
                         PUT /drives/{id}/items/{parent}:/{name}:/content
                                    ↓
                         刷新文件列表
```

### 3. ZIP 归档下载

```
用户选中多个文件/文件夹 → 点击 Download
                                    ↓
                         spEmbedded.startDownloadArchive() → 获取 jobId
                                    ↓
                         每 800ms 轮询 getArchivePreparationProgress()
                                    ↓
                         状态: queued → preparing → zipping → ready
                                    ↓
                         triggerArchiveFileDownload() → 浏览器下载 ZIP
```

### 4. 文件预览

```
用户点击文件名 → 打开 Preview 对话框
                                    ↓
                         Graph API POST /preview → 获取 previewUrl
                                    ↓
                         iframe 加载 previewUrl（附 &nb=true 去横幅）
                                    ↓
                         支持前/后导航、下载、新标签页打开、删除
```

## 开发指南

### 环境要求

- Node.js 18+
- npm 9+

### 启动前端开发服务器

```bash
npm run dev:frontend
```

前端运行在 `http://localhost:3000`，通过 CRA (Create React App) 的 proxy 或直接跨域调用后端 `http://localhost:3001`。

### 环境变量

前端环境变量配置在 `.env.development.local`（不提交到 Git）：

| 变量名                                 | 说明                                        |
| -------------------------------------- | ------------------------------------------- |
| `REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID` | 前端 Entra App 的客户端 ID                  |
| `REACT_APP_CLIENT_ENTRA_APP_TENANT_ID` | Azure AD 租户 ID                            |
| `REACT_APP_API_ENTRA_APP_CLIENT_ID`    | 后端 API 的 Entra App 客户端 ID             |
| `REACT_APP_API_SERVER_URL`             | 后端 API 地址（如 `http://localhost:3001`） |
| `REACT_APP_CLOUD_ENV`                  | 云环境：`global`（默认）或 `china`          |
| `REACT_APP_GRAPH_BASE_URL`             | （可选）自定义 Graph API 基础 URL           |

> **安全注意**：`REACT_APP_*` 前缀变量会打包进浏览器 bundle，对最终用户可见，不能放入 secret！

### 与后端集成

前端通过两种方式与 Microsoft 服务交互：

1. **通过后端 API**（需要后端密钥的操作）：

   - 容器的 CRUD 操作（需要 OBO 流程）
   - 文件删除（需要后端权限验证）
   - ZIP 归档生成（需要后端逐文件下载打包）

2. **直接调用 Graph API**（使用前端 Token）：
   - 文件列表查询
   - 文件上传
   - 文件夹创建
   - 文件预览 URL 获取

这种混合架构兼顾了安全性（密钥不暴露给前端）和性能（文件操作直接走 Graph API）。
