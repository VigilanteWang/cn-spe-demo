# Postman 与 SPE 初始化指南

本文档说明如何使用仓库自带的 Postman Collection 初始化 SharePoint Embedded（SPE）环境，并最终产出本地开发所需的 `.env.development.local` 关键值。

## 这份 Collection 是什么

仓库里有一份已经改造过的 Collection：

- [SharePoint Embedded (Cloud Switch- commercial + 21v).postman_collection.json](../../postman/SharePoint%20Embedded%20%28Cloud%20Switch-%20commercial%20%2B%2021v%29.postman_collection.json)

它在微软官方 Postman Collection 基础上继续补强：

- 保留官方 SharePoint Embedded / Graph 请求结构
- 补了很多官方原版里没有一起打包进来的 SPE / Graph API
- 增加了 `commercial` 和 `21v` 两套云环境切换
- 增加了 cloud switch 脚本：先设置 `CloudName`，再运行任意请求，脚本会自动补齐当前云的 Graph、authority、Azure Portal 等环境变量

如果你想看 Environment 模板，仓库里还提供了：

- [template.cloudswitch.postman_environment.json](../../postman/template.cloudswitch.postman_environment.json)

## 开始前先确认

- 你已经按 [Azure Portal 双应用注册指南](./azure-portal-app-registration-guide.md) 创建好了 `frontend` 和 `backend`
- 你手上至少有这些值：
  - `backend client id`
  - `backend client secret`
  - `tenant id`
  - `frontend client id`
- 你有一个带 SharePoint 的 Microsoft 365 租户
- 你准备用来执行初始化的账号，拥有 `SharePoint Embedded Administrator` 或更高权限

> 如果你没有管理员权限，不建议在 README 入口页里硬跟着做。这里的完整文档就是为了把管理员步骤单独拎出来，普通开发者只需要拿到最终环境值即可。

## 变量映射先看懂

Postman 和本仓库对云环境使用了不同枚举，但表达的是同一件事：

| 场景                | 全球商业云   | 世纪互联 / 21Vianet |
| ------------------- | ------------ | ------------------- |
| Postman `CloudName` | `commercial` | `21v`               |
| repo `CLOUD_ENV`    | `global`     | `china`             |

也就是说：

- 如果 Postman 用 `CloudName=commercial`，本地 `.env` 就填 `CLOUD_ENV=global`
- 如果 Postman 用 `CloudName=21v`，本地 `.env` 就填 `CLOUD_ENV=china`

## 第一步：导入 Collection 和环境模板

### 1. 导入 Collection

在 Postman 中：

1. 点击 `Import`
2. 选择仓库里的：

```text
postman/SharePoint Embedded (Cloud Switch- commercial + 21v).postman_collection.json
```

### 2. 导入环境模板

继续导入：

```text
postman/template.cloudswitch.postman_environment.json
```

你也可以不直接导入模板，而是照着它手动创建 environment；但对第一次配置的人来说，直接导入更省事。

### 3. 先填最少必需值

打开刚导入的 environment，先填这些字段：

- `CloudName`
  - 商业云填 `commercial`
  - 世纪互联填 `21v`
- `ClientID`
  - 填 `backend` 的 `Application (client) ID`
- `ClientSecret`
  - 填 `backend` 的 client secret value
- `ConsumingTenantId`
  - 填当前租户的 tenant id
- `RootSiteUrl`
  - 填当前租户的 SharePoint 根站点 URL，例如：
    - 商业云常见格式：`https://<tenant>.sharepoint.com`
    - 21V 常见格式：按你当前租户实际 SharePoint 根站点填写

先不要着急填 `ContainerTypeId`，它会在后面创建 container type 后拿到。

## 第二步：切云并验证环境脚本

这份 Collection 内置了 cloud switch 脚本：

1. 确认 environment 已选中
2. `CloudName` 已经填好
3. 在 Collection 里随便运行一个请求，报错也没关系

运行后，脚本会自动把当前云对应的这些字段补齐：

- `GraphBaseUrl`
- `GraphHost`
- `AuthorityHost`
- `GraphResource`
- `AzurePortalUrl`
- `UpnSuffix`

如果这一步没跑通，后面的 OAuth 和 Graph 请求通常都会跟着失败，所以建议先确认 environment 里的云端点已自动写入。

## 第三步：先获取 token

在正式创建 container type 之前，先认证后获取 token。

操作入口：

1. 打开 Collection 里的 `Delegate` 文件夹
2. 点击其中的 `Authorization`

### 1. 如果用 `backend` 应用取 token

`backend` 是 confidential client，这里只需要重点确认两个选项：

- `Grant type`: `Authorization Code`
- `Client Authentication`: `Send as Basic Auth header`

补充说明：

- 其余字段在这份 Collection 里都已经预先配好，通常不用手改
- `Authorize using browser` 可按你习惯开启或关闭

### 2. 如果用 `frontend` 应用取 token

如果你想在 Postman 中模拟“以前端 app 身份登录”，则需要先确保 `frontend` 应用已经额外配置了 `Mobile and desktop applications` 平台，并包含：

- `https://oauth.pstmn.io/v1/browser-callback`
- `https://oauth.pstmn.io/v1/callback`

同时别忘了切换 Postman environment 里的应用信息：

- `ClientID` 改成 `frontend` 的 app id
- `ClientSecret` 清空，不要继续沿用 `backend` 的 secret

为了避免来回改值，建议直接复制两份 environment：一份专门给 `backend`， 一份专门给 `frontend`

然后在 `Delegate -> Authorization` 中按下面方式配置：

- `Grant type`: `Authorization Code (With PKCE)`
- `Client Authentication`: `Send client credentials in body`

当 token 成功拿到后，再继续下面的 container type 创建和 registration 步骤。

## 第四步：创建 container type

### 1. 为什么由 `backend` 来创建

根据微软文档，container type 与 owning application 是强绑定关系。谁创建它，谁就是 owning app；而本仓库实际运行时后端负责 OBO 和 Graph 访问，所以这里直接让 `backend` 成为 owning app 最顺。

也就是说：

- `backend` 默认就是 owning app
- 后面注册 container type 时，再把 `frontend` 和 `backend` 一起授权进去

### 2. 用 Collection 中的 `Create container type`

在 Collection 中找到 `Container Types` -> `ContianerType` 下的：

- `Create container type`

请求体里核心字段通常会包含：

- `name`：起个名字
- `owningAppId`: 用 `backend` 的 client id，变量已填好
- `billingClassification`: 测试 / demo 阶段 `billingClassification` 使用 `trial` 即可
- `settings`: 可默认，也可参考 [fileStorageContainerTypeSettings](https://learn.microsoft.com/en-us/graph/api/resources/filestoragecontainertypesettings?view=graph-rest-1.0)

填好后，点击 `Send`，如果成功，会返回一个 JSON，其中包含新创建的 container type id。

微软文档参考：

- [Create new SharePoint Embedded container types](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/containertypes)
- [Create fileStorageContainerType](https://learn.microsoft.com/en-us/graph/api/filestorage-post-containertypes?view=graph-rest-1.0&tabs=http)

### 3. 记录创建结果

创建成功后，记下返回里的 `id`，并回填到 Postman environment：

```text
ContainerTypeId=<new-container-type-id>
```

这个值稍后还会写回本地：

```text
CONTAINER_TYPE_ID=<your-container-type-id>
```

## 第五步：注册 container type

只有创建还不够。要让 consuming tenant 真正能使用该 container type，还要继续做 registration。

在 Collection `Container Types` -> `Registrations` 中找到：

- `Create container type registration`

测试阶段为了减少“到底差哪一条权限”的排查成本，建议先把两个 app 都授到 `full`：

```json
{
  "applicationPermissionGrants": [
    {
      "appId": "{{your-backend-client-id}}",
      "delegatedPermissions": ["full"],
      "applicationPermissions": ["full"]
    },

    {
      "appId": "{{your-frontend-client-id}}",
      "delegatedPermissions": ["full"],
      "applicationPermissions": ["full"]
    }
  ]
}
```

> 注意：delegatedPermissions 和 applicationPermissions 分别对应 AAD 中的 delegated 权限和 app-only 权限。SPE 会根据请求的 token 类型，去读取对应的权限设置，决定 app 是否有权限执行特定操作。
>
> 所以，即使 applicationPermissions 设为了 `full`，如果在 AAD 中没有授予 app-only 权限，App 也无法真正执行 app-only 场景的操作。

## 第六步：把结果整理回本地 `.env`

当你完成 app 注册、Postman 初始化、container type 创建与 registration 后，本地开发真正需要手填回 `.env.development.local` 的关键值只有这些：

- `CLOUD_ENV`
  - 商业云填 `global`
  - 世纪互联填 `china`
- `API_ENTRA_APP_CLIENT_ID`
  - 填 `backend` client id
- `API_ENTRA_APP_CLIENT_SECRET`
  - 填 `backend` client secret
- `API_ENTRA_APP_TENANT_ID`
  - 填租户 tenant id
- `CONTAINER_TYPE_ID`
  - 填刚创建的 container type id
- `VITE_CLIENT_ENTRA_APP_CLIENT_ID`
  - 填 `frontend` client id
