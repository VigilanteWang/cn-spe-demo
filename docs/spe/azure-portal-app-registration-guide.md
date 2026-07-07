# Azure Portal 双应用注册指南

本指南默认创建两个应用：

| 应用       | 作用                    | 典型能力                                                                            |
| ---------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `frontend` | 浏览器登录入口          | 用户登录、拿 Graph delegated token、拿 `backend` 的 API token                       |
| `backend`  | 受保护 API + OBO 中转层 | 校验 `Container.AccessAsUser`、代表用户访问 Graph、配置 SPE 环境时配合 Postman 使用 |

## 开始前先准备

- 准备一个可用的 `Microsoft 365` 环境，至少需要具备 `Application Administrator` 和 `SharePoint Embedded Administrator` 权限。
- 如果你当前没有可用环境，可以先注册一个全球版开发环境：[Microsoft 365 Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program)
- 登录 [Azure Portal](https://portal.azure.com/) / [21v Azure Portal](https://portal.azure.cn/) 。
- 进入 `Microsoft Entra ID`。

## 注册 `backend` 应用

建议先建 `backend`，因为 `frontend` 之后需要引用它暴露出来的自定义 delegated scope。

### 1. 新建应用注册

在 `Microsoft Entra ID` 中：

1. 打开 `App registrations`
2. 点击 `New registration`
3. 填写：
   - `Name`: `backend`
   - `Supported account types`: `Accounts in this organizational directory only (Single tenant)`
   - `Redirect URI`: 先留空也可以，后面统一到 `Authentication` 中补
4. 点击 `Register`

注册完成后先记下：

- `Application (client) ID`
- `Directory (tenant) ID`

### 2. Authentication：补 Postman 回调地址

进入 `backend` 应用后：

1. 打开左侧 `Authentication`
2. 点击 `Add a platform` 或 `Add Redirect URI`
3. 选择 `Web`
4. 添加两个 Redirect URI：
   - `https://oauth.pstmn.io/v1/browser-callback`
   - `https://oauth.pstmn.io/v1/callback`
5. 点击 `Configure`

这两个地址是给 Postman OAuth 流程使用的

### 3. Expose an API：暴露给前端调用的 delegated scope

进入左侧 `Expose an API`：

1. 点击 `Set`，设置 `Application ID URI`
2. 直接使用默认值，通常是：

```text
api://<backend-client-id>
```

3. 点击 `Add a scope`
4. 按下面方式填写：

| 字段                         | 值                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Scope name`                 | `Container.AccessAsUser`                                                                             |
| `Who can consent?`           | `admin only`                                                                                         |
| `Admin consent display name` | `Access SharePoint Embedded Containers as a user.`                                                   |
| `Admin consent description`  | `The application can call this app's API to access SharePoint Embedded Storage Containers as a user` |
| `User consent display name`  | `Access SharePoint Embedded Containers as a user.`                                                   |
| `User consent description`   | `The application can call this app's API to access SharePoint Embedded Storage Containers as a user` |
| `State`                      | `Enabled`                                                                                            |

5. 点击 `Add scope`

这个 scope 就是前端后续要申请的 `api://<backend-client-id>/Container.AccessAsUser`。

### 4. Certificates & secrets：创建 client secret

进入左侧 `Certificates & secrets`：

1. 打开 `Client secrets`
2. 点击 `New client secret`
3. 填写：
   - `Description`: 例如 `local-dev`
   - `Expires`: 按你的组织要求选择
4. 点击 `Add`
5. 立刻复制新生成的 secret value

这个值只会显示一次，后面填到：

```text
API_ENTRA_APP_CLIENT_SECRET=<your-api-entra-app-client-secret>
```

### 5. API permissions：添加运行 demo 所需权限

进入左侧 `API permissions`：

1. 点击 `Add a permission`
2. 选择 `Microsoft Graph`
3. 选择 `Delegated permissions`
4. 依次添加下面权限：
   - `FileStorageContainer.Selected`

这是本 demo 后端通过 OBO 代表当前用户访问 SPE 容器所需的基础权限。

### 6. API permissions：添加仅用于初始化 SPE 环境的临时权限

仍在 `API permissions` 页面继续添加：

1. 点击 `Add a permission`
2. 选择 `Microsoft Graph`
3. 选择 `Delegated permissions`
4. 依次添加：
   - `FileStorageContainerType.Manage.All`
   - `FileStorageContainerTypeReg.Manage.All`

这两个权限是为了用 Postman 创建和注册 SharePoint Embedded container type。

> 这两个权限仅用于配置 SPE 环境。进入生产后，如果你的运行链路已经不再需要创建或注册 container type，可以删除它们，避免长期保留多余管理权限。

### 7. Grant admin consent

如果你的租户要求管理员同意：

1. 在 `API permissions` 页面点击 `Grant admin consent for <Tenant>`
2. 确认所有需要的 delegated permissions 都已变成已 Granted 状态

## 注册 `frontend` 应用

### 1. 新建应用注册

在 `Microsoft Entra ID > App registrations`：

1. 点击 `New registration`
2. 填写：
   - `Name`: `frontend`
   - `Supported account types`: `Accounts in this organizational directory only (Single tenant)`
   - `Redirect URI`
     - `Platform`: `Single-page application (SPA)`
     - `URI`: `http://localhost:3000`
3. 点击 `Register`

注册完成后记下 `Application (client) ID`

### 2. Authentication：确认本地开发回调地址

进入 `frontend` 应用左侧 `Authentication`，确认：

- 存在 `Single-page application` 平台
- Redirect URI 为 `http://localhost:3000`

这个地址就是本仓库本地开发登录回调地址。当前 Vite 默认跑在 `http://localhost:3000`，所以这里必须和本地地址一致。

### 2.1 如果前端也想在 Postman 里模拟测试

如果你还想在 Postman 里直接模拟“以前端身份登录并拿 token”，那仅有 `SPA` 回调还不够，还需要额外补一组 `Mobile and desktop applications` 回调地址。

操作方式：

1. 仍在 `frontend` 应用左侧 `Authentication`
2. 点击 `Add a platform` 或 `Add Redirect URI`
3. 选择 `Mobile and desktop applications`
4. 添加这两个 Redirect URI：
   - `https://oauth.pstmn.io/v1/browser-callback`
   - `https://oauth.pstmn.io/v1/callback`
5. 点击 `Configure`

### 3. API permissions：添加 Microsoft Graph delegated permissions

进入左侧 `API permissions`：

1. 点击 `Add a permission`
2. 选择 `Microsoft Graph`
3. 选择 `Delegated permissions`
4. 依次添加：
   - `FileStorageContainer.Selected`
   - `Presence.Read.All`
   - `ProfilePhoto.Read.All`
   - `User.Read`
   - `User.ReadBasic.All`
   - `GroupMember.Read.All`

这些权限分别对应当前仓库里的真实前端行为：

- `FileStorageContainer.Selected`：访问用户已获授权的 SPE 容器
- `Presence.Read.All`：在文件列表中显示人员在线状态
- `ProfilePhoto.Read.All`：显示人员头像
- `User.Read`：基础登录与用户资料读取
- `User.ReadBasic.All`：People 搜索
- `GroupMember.Read.All`：Groups 搜索

### 4. API permissions：添加 `backend` 暴露的自定义 delegated permission

仍在 `API permissions` 页面：

1. 点击 `Add a permission`
2. 选择 `APIs my organization uses`
3. 选择刚才创建的 `backend`
4. 勾选它暴露出的 delegated permission：
   - `Container.AccessAsUser`
5. 点击 `Add permissions`

这样前端登录后，才能请求：

```text
api://<backend-client-id>/Container.AccessAsUser
```

### 5. Grant admin consent

如果你的租户启用了管理员同意要求：

1. 在 `API permissions` 页面点击 `Grant admin consent for <Tenant>`
2. 确认 Graph 权限和 `backend` 自定义权限都已授权

## 要记下的配置值

完成两个应用注册后，你至少要保存这些值，供下一步文档继续使用：

| 来源       | 值                        | 用途                                        |
| ---------- | ------------------------- | ------------------------------------------- |
| `backend`  | `Application (client) ID` | `.env` 的 `API_ENTRA_APP_CLIENT_ID`         |
| `backend`  | `Directory (tenant) ID`   | `.env` 的 `API_ENTRA_APP_TENANT_ID`         |
| `backend`  | `Client secret value`     | `.env` 的 `API_ENTRA_APP_CLIENT_SECRET`     |
| `frontend` | `Application (client) ID` | `.env` 的 `VITE_CLIENT_ENTRA_APP_CLIENT_ID` |

下一步请继续看 [Postman 与 SPE 初始化指南](./postman-spe-setup-guide.md)，用这几个值把 SharePoint Embedded 环境真正建起来，并拿到 `CONTAINER_TYPE_ID`。
