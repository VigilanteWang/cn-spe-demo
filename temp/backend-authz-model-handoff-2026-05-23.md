# 后端权限模型复核与更新计划（2026-06-05）

## 结论

- 这份 change 仍然有效，不应删除。
- 旧文档里关于 “OBO 没有显式多拿一组 Graph scope” 的判断，到今天仍然成立。
- 真正仍未解决的问题，依旧是“后端 API 入口授权过粗”，不是 Graph OBO scope 爆炸。

## 当前代码证据

### 1. 前端仍然只申请一个后端 API scope

- `src/services/apiClient.ts`
- `getApiAccessToken()` 仍固定请求：
  - `api://{apiClientId}/Container.Manage`

### 2. 后端仍然只有一套 `Container.Manage` 校验入口

- `server/auth.ts`
- 仍只有：
  - `authorizeContainerManageRequest()`
  - `requireContainerManageRequest()`
- `hasRequiredScope()` 仍只检查 `scp` 里是否包含 `Container.Manage`

### 3. 多类不同能力仍然共用同一个入口 scope

以下后端入口今天仍都依赖 `requireContainerManageRequest(...)`：

- `server/listContainers.ts`
- `server/createContainer.ts`
- `server/deleteItems.ts`
- `server/downloadHandlers.ts`
- `server/containerPermissions/containerPermissionsHandlers.ts`
- `server/itemPermissions/itemPermissionsHandlers.ts`

也就是说，当前仍然没有：

- `Container.Read`
- `Container.Write`
- `ContainerPermission.Write`
- `ItemPermission.Write`
- `Download.Read`

这类按动作拆开的 API scope。

### 4. OBO 仍然只申请最小 Graph scope

- `server/auth.ts`
- `getGraphOBOToken()` 仍只请求：
  - `FileStorageContainer.Selected`

当前代码里仍然没有看到：

- `/.default`
- 按动作动态追加多组 Graph delegated permissions
- 第二套 OBO 获取逻辑

### 5. 代码里仍未使用 app role

当前后端授权逻辑只依赖：

- bearer token 有效性
- `scp`

还没有看到：

- `roles` claim 读取
- route 级 allowed roles 配置
- “scope + role” 双层判定

## 相比旧文档，需要修正的地方

### 1. 重点应从“担心 OBO 多拿权限”转成“收口自家 API 授权边界”

旧文档的担忧起点没问题，但现在更清楚了：

- OBO 不是主问题
- 当前真正阻碍演进的是后端内部没有能力级授权模型

### 2. 第一阶段应先抽通用授权策略层，再拆 scope

与其直接在各 handler 里散落新判断，更适合先在 `server/auth.ts` 抽出通用能力：

- 读取 `scp`
- 校验指定 required scope
- 后续可选读取 `roles`

这样后面新增多个 scope 时，不需要继续复制 `requireContainerManageRequest()` 这一类专用函数。

### 3. app role 仍值得做，但应排在 scope 拆分之后

原因：

- scope 拆分是纯仓库代码与 Entra API expose 的直接对应，收益立刻可见
- app role 还依赖 Enterprise Application 分配策略，外部协同成本更高

所以更合理的顺序是：

1. 先把 API scope 从单一 `Container.Manage` 拆开
2. 再决定是否引入业务角色层

## 更新后的建议计划

### Phase 1：抽通用授权策略层

目标：

- 不改变现有行为
- 先把 “只支持 Container.Manage” 的实现形态改成 “可配置目标 scope”

建议动作：

1. 在 `server/auth.ts` 抽出通用 helper
   - 例如 `authorizeRequestForScope(req, requiredScope)`
   - 以及 `requireRequestScope(req, requiredScope)`
2. 保留 `requireContainerManageRequest()` 作为兼容包装
3. 为通用 helper 补测试，锁定：
   - 缺 token
   - 非 bearer token
   - token 无目标 scope
   - token 含目标 scope

### Phase 2：拆 API scope，但保留 `Container.Manage` 兼容期

建议的新 scope：

- `Container.Read`
- `Container.Write`
- `ContainerPermission.Write`
- `ItemPermission.Write`
- `Download.Read`

建议路由映射：

- `GET /api/listContainers`
  - `Container.Read`
- `POST /api/createContainer`
  - `Container.Write`
- `POST /api/deleteItems`
  - `Container.Write`
- `GET/POST /api/containerPermissions/*`
  - `ContainerPermission.Write`
- `GET/POST /api/itemPermissions/*`
  - `ItemPermission.Write`
- `POST /api/download/start`
  - `Download.Read`
- `GET /api/download/progress/:jobId`
  - `Download.Read`
- `GET /api/download/manifest/:jobId`
  - `Download.Read`

兼容策略：

- 过渡期可允许 `requiredScope` 命中“新 scope 或 `Container.Manage`”
- 当前前端仍可继续跑，不需要一次切完

### Phase 3：前端按调用能力申请更窄 scope

目标：

- `src/services/apiClient.ts` 不再固定只要 `Container.Manage`
- 不同服务模块或调用路径可请求更贴近实际能力的 scope

这里可以先做两档而不是一步到位：

1. 第一版先区分：
   - `Container.Read`
   - `Container.Write`
2. 第二版再细化到 permission / download

### Phase 4：再评估是否引入 app role

当 scope 拆完后，再决定是否增加：

- `ContainerAdmin`
- `ContainerOperator`
- `PermissionEditor`
- `ContainerViewer`

这一阶段的代码前提是：

- 在 token 中读取 `roles`
- 在通用授权层支持 `allowedRoles`

## 明确的非目标

本轮不建议优先做这些事：

- 不优先拆 OBO 的 Graph scope
- 不把业务授权逻辑下沉到前端
- 不在 route handler 里直接散落字符串字面量判断

## 建议写入 issue 的任务范围

如果要落 GitHub issue，建议把它定义为：

- 以“后端 API 授权边界细化”为主
- 以“scope 拆分 + 通用授权层”为第一优先级
- app role 作为后续可选第二阶段

这样更贴近当前代码现实，也更容易分步落地。
