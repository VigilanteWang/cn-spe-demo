# 前端应用文档

## 📋 目录

1. [项目概述](#项目概述)
2. [项目结构](#项目结构)
3. [核心概念](#核心概念)
4. [功能说明](#功能说明)
5. [主要组件详解](#主要组件详解)
6. [开发指南](#开发指南)
7. [与后端集成](#与后端集成)

---

## 项目概述

**SharePoint Embedded Demo 前端**是一个基于 React 和 TypeScript 的 Web 应用，为用户提供了一个直观的界面来管理 SharePoint Embedded 容器和文件。

### 主要功能

✅ **用户身份验证**：通过 Microsoft Entra ID 登录  
✅ **容器管理**：查看、创建 SharePoint Embedded 容器  
✅ **文件浏览**：在容器中浏览文件和文件夹（支持文件夹导航）  
✅ **文件操作**：上传、下载、删除、预览文件  
✅ **文件夹操作**：创建新文件夹，保留文件夹结构上传  
✅ **批量操作**：多选文件、批量删除、批量下载（ZIP 归档）  
✅ **文件预览**：在线预览支持的文件格式

### 技术栈

| 技术                              | 用途                 | 版本 |
| --------------------------------- | -------------------- | ---- |
| **React**                         | UI 框架              | 18+  |
| **TypeScript**                    | 类型安全             | 4.9+ |
| **Fluent UI**                     | UI 组件库            | 9+   |
| **MGT** (Microsoft Graph Toolkit) | 身份认证、Graph 集成 | 3+   |
| **Microsoft Graph**               | 后端 API             | 1.0  |

---

## 项目结构

```
src/
├── App.tsx                          # 应用主组件
├── index.tsx                        # 应用入口
├── customTheme.tsx                  # Fluent Design 主题
├── index.css                        # 全局样式
│
├── components/                      # React 组件
│   ├── containers.tsx              # 容器管理组件
│   ├── files.tsx                   # 文件管理组件
│   └── preview.tsx                 # 文件预览组件
│
├── services/                        # 业务逻辑服务
│   └── spembedded.ts               # SharePoint Embedded API 客户端
│
├── common/                          # 通用定义
│   ├── config.ts                   # 应用配置（环境变量）
│   ├── scopes.ts                   # OAuth 权限范围定义
│   └── types.ts                    # TypeScript 类型定义
│
└── (其他文件)
    ├── react-app-env.d.ts          # React 类型定义
    └── global.d.ts                 # 全局类型定义
```

### 文件说明

| 文件                | 职责                                        |
| ------------------- | ------------------------------------------- |
| **App.tsx**         | 主应用组件，管理登录状态，条件性渲染 UI     |
| **index.tsx**       | 入口文件，初始化 MGT Provider，注册身份验证 |
| **customTheme.tsx** | 定义应用的 Fluent Design 主题               |
| **containers.tsx**  | 容器选择/创建界面                           |
| **files.tsx**       | 文件浏览、上传、下载、删除界面              |
| **preview.tsx**     | 文件预览对话框                              |
| **spembedded.ts**   | 与后端 API 通信的服务类                     |
| **config.ts**       | 从环境变量读取并验证配置                    |
| **scopes.ts**       | OAuth 权限范围常量定义                      |
| **types.ts**        | 应用级 TypeScript 接口                      |

---

## 核心概念

### 1. 身份验证流程

```
用户点击 Login → MGT 处理 Entra ID 登录 → 全局 Provider 获得 token
     ↓
用户可访问应用 → SpEmbedded 服务获取 token 从 Provider
     ↓
使用 token 调用后端 API → 后端验证权限并调用 Graph API
```

**关键点**：

- **MGT (Microsoft Graph Toolkit)** 使用 MSAL 处理身份验证
- **全局 Provider** (`Providers.globalProvider`) 存储用户的 token
- **SpEmbedded 服务** 复用全局 provider 的 token，避免重复登录

### 2. 权限范围 (Scopes)

应用使用两个关键权限范围：

```typescript
// 容器管理权限
"Container.Manage"
  ├─ 创建容器
  ├─ 删除容器
  └─ 获取容器列表

// 文件存储权限
"FileStorageContainer.Selected"
  ├─ 上传文件
  ├─ 下载文件
  ├─ 删除文件
  └─ 创建文件夹
```

### 3. API 调用模式

所有对后端的 API 调用都遵循以下模式：

```typescript
// 1. 获取 token
const token = await this.getApiAccessToken();

// 2. 构造请求配置
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

// 3. 发送请求
const response = await fetch(apiUrl, {
  method: "GET|POST|DELETE",
  headers,
  body: JSON.stringify(data),
});

// 4. 处理响应
if (response.ok) {
  return await response.json();
} else {
  console.error("API 请求失败");
  return undefined;
}
```

### 4. 异步任务模式 (工作队列)

对于长时间操作（如下载多个文件），应用使用后端工作队列：

```
用户点击下载 → SpEmbedded.startDownloadArchive(items)
                        ↓
           后端生成 job，返回 jobId
                        ↓
     前端轮询 getDownloadProgress(jobId)
       每 800ms 检查一次进度
                        ↓
         当 status === "ready" 时
           triggerArchiveFileDownload(jobId)
                        ↓
         ZIP 文件下载到本地
```

---

## 功能说明

### 1. 容器管理 (Containers Component)

#### 功能

- 从列表中选择一个容器
- 创建新容器（提供名称和描述）
- 选中容器后显示文件管理界面

#### 工作流程

```
加载容器列表 → 用户选择 → 显示文件界面
    ↓                           ↓
从后端获取      或      创建新容器 → 自动选中
已有容器                  → 刷新列表
```

#### 主要状态

```typescript
containers: IContainer[]           // 容器列表
selectedContainer: IContainer      // 选中的容器
dialogOpen: boolean                // 创建对话框是否打开
name: string                       // 新容器名称
description: string                // 新容器描述
creatingContainer: boolean         // 是否在创建中
```

### 2. 文件管理 (Files Component)

#### 功能

- **浏览**：显示文件和文件夹列表，支持进入/返回子文件夹
- **上传**：支持单文件或整个文件夹上传，保留文件夹结构
- **下载**：单文件直接下载，多文件打包为 ZIP
- **删除**：删除单个或多个文件/文件夹
- **创建**：创建新文件夹
- **预览**：在线预览文件内容

#### 核心概念

**面包屑导航** (Breadcrumb)

```
Root > Folder1 > Folder2
 ↓       ↓        ↓
 快速返回到任意路径
```

**文件夹上传** (Preserve Structure)

```
用户上传 MyFolder/
  ├─ file1.txt
  └─ subfolder/
      └─ file2.txt

前端保留结构：
  ├─ 创建 subfolder (如不存在)
  ├─ 上传 file1.txt
  └─ 上传 file2.txt
```

**多文件下载** (ZIP Archive)

```
用户选择多个文件 → 后端生成 ZIP job
                    ↓
            轮询进度（每 800ms）
                    ↓
         当完成时 → 下载 ZIP 文件
```

#### 主要状态

```typescript
driveItems: IDriveItemExtended[]   // 当前文件夹内容
selectedRows: Set<string>          // 选中的文件 ID
folderId: string                   // 当前文件夹 ID
breadcrumbPath: IBreadcrumbItem[]  // 导航路径

uploadProgress: IUploadProgress    // 上传进度
downloadProgress: IDownloadProgress// 下载进度

newFolderDialogOpen: boolean       // 创建文件夹对话框
deleteDialogOpen: boolean          // 删除确认对话框
previewOpen: boolean               // 文件预览对话框
```

### 3. 文件预览 (Preview Component)

#### 支持的格式

- **Office 文档**：Word, Excel, PowerPoint, Visio (`.docx`, `.xlsx`, `.pptx`, `.vsdx` 等)
- **其他格式**：PDF, 图片, 文本文件等

#### 实现方式

```typescript
const fileExtension = getExtension(currentFile.name);

if (OFFICE_EXTENSIONS.includes(fileExtension)) {
  // Office 文档：用出色的 online 编辑体验
  openInBrowser(currentFile.webUrl);
} else {
  // 其他文件：使用 Graph API 预览 URL
  loadPreviewUrl();
}
```

#### 导航

- 上一个/下一个按钮：在文件列表中导航
- 在新标签页打开：编辑或查看完整内容
- 下载：将文件下载到本地

---

## 主要组件详解

### App.tsx

**职责**：应用主入口，管理登录状态

```typescript
function useIsSignedIn() {
  // Hook：监听全局 provider 状态变化
  // 返回：boolean （已登录 = true）
}

function App() {
  // 上部横幅：标题 + 登录按钮
  // 条件渲染：isSignedIn ? <Containers /> : null
}
```

**工作流程**

```
初始化
  ↓
订阅 provider 状态变化
  ↓
用户登录 → 显示 Containers 组件
  ↓
用户登出 → 隐藏 Containers 组件
```

### Containers.tsx

**职责**：容器选择和创建

**UI 结构**

```
┌─────────────────────────────┐
│ 容器选择下拉菜单             │
├─────────────────────────────┤
│ [创建新容器] 按钮            │
├─────────────────────────────┤
│                             │
│ <Files> 组件（如果选中了容器）│
│                             │
└─────────────────────────────┘
```

### Files.tsx

**职责**：文件浏览和操作（应用的核心）

**UI 结构**

```
┌─────────────────────────────┐
│ 面包屑导航                  │
├─────────────────────────────┤
│ 工具栏：上传、下载、删除    │
├─────────────────────────────┤
│ 进度显示：上传/下载进度     │
├─────────────────────────────┤
│ 文件列表 (DataGrid)          │
│ ☑ 文件名    修改人  大小     │
├─────────────────────────────┤
│ 隐藏的 <input> 和 <dialog>  │
└─────────────────────────────┘
```

**关键函数**

| 函数                        | 用途                        |
| --------------------------- | --------------------------- |
| `loadItems(itemId)`         | 加载文件夹内容              |
| `uploadFiles(files)`        | 上传文件，创建文件夹结构    |
| `onToolbarDownloadClick()`  | 下载文件（直接或 ZIP）      |
| `startZipDownload(itemIds)` | 启动后端 ZIP 任务，轮询进度 |
| `onDeleteItemClick()`       | 删除选中的项目              |
| `onFolderCreateClick()`     | 创建新文件夹                |

### Preview.tsx

**职责**：文件预览

**支持的操作**

- 前一个/后一个文件导航
- 在新标签页打开（编辑）
- 下载
- 关闭预览

---

## 开发指南

### 环境变量配置

复制 `.env.example` 并填入您的值：

```bash
# Entra ID 应用配置
REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID=<your_client_id>
REACT_APP_CLIENT_ENTRA_APP_TENANT_ID=<your_tenant_id>
REACT_APP_API_ENTRA_APP_CLIENT_ID=<your_api_client_id>

# API 服务器
REACT_APP_API_SERVER_URL=http://localhost:5000

# 云环境 (global or china)
REACT_APP_CLOUD_ENV=global
```

### 本地开发运行

```bash
# 1. 安装依赖
npm install

# 2. 启动前端开发服务器
npm run dev:frontend
# 前端在 http://localhost:3000

# 3. (另一个终端) 启动后端服务
npm run dev:backend:debug
# 后端在 http://localhost:5000
```

### 代码结构建议

#### 添加新页面

1. 在 `src/pages/` 下创建新组件
2. 在 `App.tsx` 中添加路由
3. 使用 `useStyles` 定义样式

#### 添加新 API 调用

1. 在 `SpEmbedded` 类中添加新方法
2. 遵循现有的 token + 请求 + 处理模式
3. 为返回值定义 TypeScript 接口

#### 添加新组件

1. 使用 `makeStyles` 定义样式
2. 使用 `useId()` 生成唯一 HTML id
3. 为 props 定义接口

### 调试技巧

#### 查看 API 调用

```typescript
// 在浏览器开发者工具 → Network 标签中查看
// 或在 SpEmbedded 服务中添加 console.log
console.log("API 请求", apiUrl, options);
console.log("API 响应", response);
```

#### 查看 Token 内容

```typescript
// 在浏览器 console 中
const token = await Providers.globalProvider.getAccessToken({...});
// 在 https://jwt.ms 中粘贴 token 查看内容
```

#### 查看 Graph API 文档

- [Microsoft Graph API 文档](https://docs.microsoft.com/zh-cn/graph/api/overview)
- 使用 [Graph Explorer](https://developer.microsoft.com/zh-cn/graph/graph-explorer) 测试 API

---

## 与后端集成

### API 端点

前端调用的后端 API：

| API                                     | 方法 | 说明             |
| --------------------------------------- | ---- | ---------------- |
| `/api/listContainers`                   | GET  | 获取容器列表     |
| `/api/createContainer`                  | POST | 创建新容器       |
| `/api/deleteItems`                      | POST | 删除文件/文件夹  |
| `/api/downloadArchive/start`            | POST | 启动下载归档任务 |
| `/api/downloadArchive/progress/{jobId}` | GET  | 查询归档进度     |
| `/api/downloadArchive/file/{jobId}`     | GET  | 下载 ZIP 文件    |

### 请求/响应示例

#### 创建容器

**请求**

```bash
POST /api/createContainer
Authorization: Bearer {token}
Content-Type: application/json

{
  "displayName": "My Container",
  "description": "A test container"
}
```

**响应**

```json
{
  "id": "b!xyz123...",
  "displayName": "My Container",
  "containerTypeId": "...",
  "createdDateTime": "2024-01-01T00:00:00Z"
}
```

#### 删除文件

**请求**

```bash
POST /api/deleteItems
Authorization: Bearer {token}
Content-Type: application/json

{
  "containerId": "b!xyz123...",
  "itemIds": ["file-id-1", "file-id-2"]
}
```

**响应**

```json
{
  "successful": ["file-id-1"],
  "failed": [
    {
      "id": "file-id-2",
      "reason": "Access Denied"
    }
  ]
}
```

### 错误处理

前端采用以下错误处理策略：

```typescript
try {
  const result = await spEmbedded.createContainer(name, description);
  if (result) {
    // 成功
    setContainers([...containers, result]);
  } else {
    // API 返回失败
    console.error("创建容器失败");
  }
} catch (error) {
  // 网络错误或异常
  console.error("请求异常:", error.message);
}
```

---

## 常见问题

### Q: 为什么在移动浏览器上功能不完整？

A: 文件夹上传 (webkitdirectory) 在某些移动浏览器上不支持。建议在桌面浏览器中使用。

### Q: 如何支持更多文件格式的预览？

A: 在 `preview.tsx` 中扩展 `OFFICE_EXTENSIONS` 列表，或添加第三方预览库。

### Q: 为什么删除大量文件很慢？

A: 文件删除是逐个执行的，大量删除会占用时间。考虑添加异步进度反馈。

### Q: Token 过期了怎么办？

A: MGT Provider 会自动刷新 token。如果刷新失败，用户需要重新登录。

---

## 相关资源

- [Microsoft Graph Toolkit 文档](https://learn.microsoft.com/zh-cn/graph/toolkit/overview)
- [Fluent UI React 组件库](https://react.fluentui.dev/)
- [SharePoint Embedded API 文档](https://learn.microsoft.com/zh-cn/graph/api/resources/filestoragecontainer)
- [Microsoft Graph API 参考](https://learn.microsoft.com/zh-cn/graph/api/overview)

---

**最后更新**：2024 年 4 月
