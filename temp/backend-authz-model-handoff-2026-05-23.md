# 后端权限模型交接说明（2026-05-23）

## 1. 这次结论要解决什么问题

本次讨论聚焦的是：

1. 当前前端应用 `SharePointEmbededApp` 与后端应用 `SPETest` 之间的 API scope 设计是否过粗。
2. 当前后端在执行 `OBO` 时，是否会因为 `SPETest` 注册了较多 `Microsoft Graph` delegated permissions，而为普通用户拿到过多下游权限。
3. 如果后续要重构权限模型，是否适合引入新的 scope，例如 `Container.Write`，并结合 Entra app role 区分 `admin` / `user` 等角色。

这份文档的目标，是让下一个助手能够快速接住这次讨论的上下文，而不是重新从头阅读代码和 Azure AD 导出文件。

## 2. 当前代码现状

### 2.1 前端调用后端 API 时，只申请一个后端 scope

前端统一通过 `src/services/apiClient.ts` 获取后端 API token。

当前实现：

- 文件：`src/services/apiClient.ts`
- 关键点：`getApiAccessToken()`
- 请求的 scope：
  - `api://{apiClientId}/Container.Manage`

也就是说，前端只向后端应用 `SPETest` 请求一个 delegated scope：`Container.Manage`。

### 2.2 后端对大部分受保护接口，统一只校验 `Container.Manage`

后端统一通过 `server/auth.ts` 做 bearer token 验证与 scope 校验。

当前实现：

- 文件：`server/auth.ts`
- `hasRequiredScope()` 只检查 `scp` 中是否包含 `Container.Manage`
- `authorizeContainerManageRequest()` / `requireContainerManageRequest()` 是当前共用入口

这意味着当前后端自己的授权边界比较粗：

- `create container`
- `list containers`
- `container permissions`
- `item permissions`
- `download`

这些动作现在都依赖同一个后端 API scope：`Container.Manage`。

### 2.3 `item permission` 这样的低一级能力，也复用了 `Container.Manage`

当前 `item permission` handler 没有单独的 scope 校验。

当前实现：

- 文件：`server/itemPermissions/itemPermissionsHandlers.ts`
- `listItemPermissionsFromGraph()` 先调用 `requireContainerManageRequest(req)`
- `applyItemPermissionsToGraph()` 也先调用 `requireContainerManageRequest(req)`

因此，从“后端 API 入口授权”来看，普通用户如果要改 item-level permission，当前也必须持有与 container 管理入口相同的 `Container.Manage`。

### 2.4 当前 OBO 向 Graph 换票时，没有看到“多拿一堆 Graph scope”的代码

后端 OBO 入口在 `server/auth.ts` 的 `getGraphOBOToken()`。

当前实现：

- 文件：`server/auth.ts`
- OBO 请求只声明一个下游 scope：
  - `${serverConfig.graphBaseUrl}/FileStorageContainer.Selected`

这点非常关键：

- 当前代码没有使用 `/.default`
- 当前代码没有按动作动态追加一组 Graph delegated permissions
- 当前代码里也没有找到第二个 `acquireTokenOnBehalfOf()` 调用点

因此，虽然 `SPETest` 的应用注册里声明了多项 `Microsoft Graph` delegated permissions，但**从当前代码实现看，OBO 这一跳没有显式把这些权限一起申请进 token**。

### 2.5 `CreateContainer` 当前也复用同一个 OBO scope

`create container` 当前并没有单独申请更高的 Graph scope。

当前实现：

- 文件：`server/createContainer.ts`
- `createContainer()` 先做 `requireContainerManageRequest(req)`
- 然后调用 `getGraphOBOToken(authorizationResult.token)`
- 该函数内部仍只请求 `FileStorageContainer.Selected`

所以当前模型是：

1. 调后端 API：需要 `Container.Manage`
2. 后端代表用户调 Graph：当前统一只换 `FileStorageContainer.Selected`

## 3. 这次讨论得出的核心判断

### 3.1 关于“会不会 OBO 多拿权限”

当前代码里**没有看到**普通用户在 OBO 时被显式授予过多 Graph scope 的实现。

原因：

1. OBO 请求写死为单个 scope：`FileStorageContainer.Selected`
2. 没有使用 `/.default`
3. 没有找到额外的 OBO token 获取入口

所以，“后端注册里有很多 Graph delegated permission”这件事，和“当前运行中的这条 OBO 代码会不会全拿到”不是同一件事。

### 3.2 关于“后端自己的授权边界是不是太粗”

答案是：**是的，当前太粗。**

当前真正的问题不在 OBO，而在后端 API 自己的 scope 设计：

- `item permission`、`container permission`、`create container` 共用 `Container.Manage`
- 这导致“低一级动作”没有自己的准入边界
- 普通用户如果只是要改 item 权限，也要拿到与 container 管理类似的后端入口权限

## 4. 推荐的最佳实践模型

本项目更适合采用“细粒度 scope + app role”双层模型，而不是继续把所有动作塞进 `Container.Manage`。

### 4.1 scope 的职责

scope 用来表达“客户端现在想调用哪类 API 能力”。

建议新增并逐步替换现有粗粒度 scope：

- `Container.Read`
  - 列容器、读容器详情
- `Container.Write`
  - 创建容器、修改容器元数据、删除容器
- `ContainerPermission.Write`
  - 修改 container-level permission
- `ItemPermission.Write`
  - 修改 item-level permission
- `Download.Read`
  - 生成下载任务、获取下载链接

注意：

- `Container.Manage` 可以作为过渡期兼容 scope 保留一段时间
- 长期应逐步下线，避免它继续成为“大杂烩入口”

### 4.2 app role 的职责

app role 用来表达“当前登录用户在本系统中的业务角色是什么”。

比起简单的 `admin` / `user`，更推荐使用业务语义明确的角色名：

- `ContainerAdmin`
  - 容器与权限全管理
- `ContainerOperator`
  - 可创建/管理容器，但不能修改权限策略
- `PermissionEditor`
  - 可修改 container/item permission，但不负责创建或删除容器
- `ContainerViewer`
  - 只读

如果一开始只想先落两档，也可以先做简化版：

- `Admin`
- `User`

但这只是短期过渡方案。长期看，`User` 语义太宽，不利于演进。

### 4.3 后端接口应同时校验 scope 与 role

推荐规则：

1. 先校验 bearer token 是否有效
2. 再校验当前 action 所需的 scope
3. 再校验当前用户是否具备允许的 app role

也就是：

- scope 解决“客户端申请的是不是这类 API 能力”
- role 解决“这个用户在业务上有没有资格做这件事”

建议的接口映射示例：

- `POST /api/createContainer`
  - 需要 `Container.Write`
  - 允许 role：`ContainerAdmin`、`ContainerOperator`

- `GET /api/itemPermissions/:driveId/:itemId`
  - 至少需要 `ItemPermission.Write` 或未来单独拆出的 `ItemPermission.Read`
  - 允许 role：`ContainerAdmin`、`PermissionEditor`

- `POST /api/itemPermissions/:driveId/:itemId/apply`
  - 需要 `ItemPermission.Write`
  - 允许 role：`ContainerAdmin`、`PermissionEditor`

- `POST /api/containerPermissions/...`
  - 需要 `ContainerPermission.Write`
  - 允许 role：`ContainerAdmin`、`PermissionEditor`

## 5. 对 OBO 的建议边界

OBO 不应该承担“你系统里谁是管理员、谁是普通用户”的业务授权职责。

推荐原则：

1. 上游调你自己的后端 API
   - 用你自己的 API scopes + app roles 控制
2. 下游调 `Microsoft Graph`
   - 只申请该动作真正需要的最小 delegated permission
3. 不要把“后端 API 高权限”直接等同于“Graph 高权限”

因此，即使未来把后端 scope 拆成：

- `Container.Write`
- `ItemPermission.Write`
- `ContainerPermission.Write`

也不代表 OBO 一定要拆成多个更高的 Graph scope。

如果多个动作在 Graph 侧都只需要 `FileStorageContainer.Selected`，那 OBO 仍然可以继续最小化地只申请它。  
真正的细粒度控制，放在你自己的后端授权层完成。

## 6. 推荐落地顺序

为了降低改动风险，建议分两阶段推进。

### 第一阶段：先拆后端 API scopes

目标：

- 先把 `Container.Manage` 的粗粒度入口拆掉
- 让不同 handler 开始校验不同 scope

建议动作：

1. 在 `SPETest` 应用注册中新增 delegated scopes：
   - `Container.Read`
   - `Container.Write`
   - `ContainerPermission.Write`
   - `ItemPermission.Write`
   - `Download.Read`
2. 前端按实际 API 调用改为请求更窄的 scope
3. 后端在 `server/auth.ts` 中把“只认 `Container.Manage`”改为“按接口校验目标 scope”
4. 保留 `Container.Manage` 作为短期兼容，待前后端都切完后再下线

### 第二阶段：再补 app roles

目标：

- 把“谁能做什么”从单纯 scope 检查升级为“scope + role”

建议动作：

1. 在 `SPETest` 暴露 app roles：
   - `ContainerAdmin`
   - `ContainerOperator`
   - `PermissionEditor`
   - `ContainerViewer`
2. 在 Enterprise Application 中把用户或组分配到这些角色
3. 后端从 access token 中读取 `roles` claim
4. 在 handler 或统一授权层增加 role 校验

## 7. 给下一位助手的直接建议

如果下一步要开始实现，不建议一口气把所有接口都改掉。  
更稳妥的起点是：

1. 先从 `itemPermissions` 和 `createContainer` 两块入手
2. 先把 `Container.Manage` 拆成：
   - `Container.Write`
   - `ItemPermission.Write`
3. 在 `server/auth.ts` 里抽出通用的“按目标 scope 校验”函数
4. 暂时先不改 OBO scope，继续只申请 `FileStorageContainer.Selected`
5. 等第一阶段跑通后，再引入 `roles` claim 校验

## 8. 一句话总结

当前代码的问题，不是 OBO 明显多拿了 Graph scope；  
真正的问题是后端 API 自己的授权边界过粗，`Container.Manage` 把 `create container`、`container permission`、`item permission` 等不同级别动作混在了一起。  
推荐改造成“细粒度 API scope + 业务 app role”的双层模型，而 OBO 继续保持最小 delegated permission。
