# Issue 1 执行计划（在步骤 2 完成后重整）

## Summary

- 目标仍然是完成 `Container Permission mgmt`，但后续步骤按当前代码状态和 Microsoft Graph 最佳实践重新拆分。
- 当前结论：步骤 1、步骤 2 已完成；后续继续保持 `步骤 3 → 步骤 4 → 步骤 5`。
- 这次重整的重点不是继续沿用旧 prompt，而是把搜索策略、cache 策略、前后端边界和后续实现顺序一次性定清楚。

## Current Scan

### 已完成内容

- 步骤 1 的页面编排与弹窗骨架已经落地：
  - `src/components/containers/index.tsx`
  - `src/components/permissions/ContainerPermissionDialog.tsx`
- 步骤 2 的本地草稿编辑已经落地：
  - `People / Groups` 页签
  - 本地候选项筛选
  - 本地新增、改角色、删除
  - `Close` 放弃草稿
  - `Apply` 仅本地确认
- 状态拆分方向是对的：
  - `usePermissionDraft`
  - `usePermissionTabs`
  - `useContainerPermissionDialogState`
- 当前最小验证通过：
  - `src/components/permissions/ContainerPermissionDialog.test.tsx` 共 6 个测试通过
  - `npx tsc --noEmit` 本次运行无错误输出

### 当前缺口

- 搜索仍是本地 `Combobox` 占位，不是真实目录搜索。
- 还没有 Fluent UI v9 `TagPicker`。
- 还没有真实容器权限初始加载。
- `Apply` 还没有真实 Graph 写回。
- 现在的“搜索入口”“搜索分级策略”“缓存周期”“请求节流”“后端边界”都还没最终落地，继续直接做 UI 容易返工。

## Best-Practice Adjustments

### 1. People / Group search 继续放前端实现

- 按当前决策，`people/group search` 继续放到前端实现，不新增后端目录搜索路由。
- 前端直接使用委托权限调用 Graph：
  - 用户搜索使用 `User.ReadBasic.All`
  - 组搜索使用 `GroupMember.Read.All`
- 这样做的边界是：
  - 搜索分级逻辑、去抖、最小长度门槛、过期请求取消和短周期 cache 都在前端完成
  - 真实容器权限加载与写回仍然走后端 OBO，不和搜索实现绑定在一起

### 2. 搜索 API 形式改为“分级搜索”，而不是单一路径 `$search`

- 这次需求里，最好的性能路径不是“所有输入都走 `$search`”，而是先识别输入形态，再走最省 Graph 成本的路径。
- 推荐顺序如下：
  - 如果 query 是 GUID：
    - `People` 页签调用 `GET /users/{id}`
    - `Groups` 页签调用 `GET /groups/{id}`
  - 如果 query 是完整 UPN / email：
    - `People` 先调用 `GET /users/{userPrincipalName}`，其中 `userPrincipalName` 必须作为 URL path segment 做 `encodeURIComponent`
    - 如果 `People` 直取失败，再调用 `/users?$filter=mail eq '{q}'`
    - `Groups` 调用 `/groups?$filter=mail eq '{q}'`
  - 如果 query 更像 identifier prefix，例如包含 `@`、`.`、`-`、`_`，或明显不是自然语言姓名：
    - `People` 用 `startswith(userPrincipalName,'{q}') or startswith(mail,'{q}')`
    - `Groups` 用 `startswith(mail,'{q}') or startswith(mailNickname,'{q}')`
  - 其他普通词、姓氏片段或 display name 片段：
    - `People` 用 `/users?$search="displayName:{q}"`
    - `Groups` 用 `/groups?$search="displayName:{q}" OR "description:{q}"`
- 这个策略的核心是：
  - 精确值尽量走 direct get
  - identifier 前缀尽量走 `startswith` filter
  - 普通人名 / 词组再走 `$search`

### 3. Graph 官方语义边界要写进实现和 prompt

- Graph 目录对象 `$search` 不支持真正的任意位置 `contains`。
- `displayName` 和 `description` 是 tokenized search。
- `mail`、`userPrincipalName`、`mailNickname` 这类 identifier 更适合作为 exact / prefix 查询，而不是承诺任意位置模糊命中。
- Graph 查询构造必须集中处理特殊字符：
  - URL path segment 用 `encodeURIComponent`，尤其处理 B2B / guest UPN 里的 `#`、空格等字符
  - OData `$filter` 字符串 literal 里的单引号要按 OData 规则转成两个单引号
  - `$search` 的 query text 要转义或拒绝会破坏查询语法的双引号、反斜杠等字符，避免用户输入拼坏 query
  - `normalizedQuery` 只用于 cache key 和输入判定，不直接替代实际发给 Graph 的 escaped query
- 所以后续实现和 prompt 应明确：
  - “支持 UPN / email / displayName 搜索”是合理目标
  - “支持姓氏 / 词片段命中 displayName token”是合理目标
  - “UPN / email 任意位置真正 contains”不应靠拉大列表后本地过滤去伪造

### 4. 搜索 cache 建议使用内存 LRU + TTL，不默认落浏览器 storage

- 本功能建议增加前端搜索结果 cache，但默认只做：
  - 会话内内存 cache
  - LRU 淘汰
  - 短周期 TTL
- 不建议 v1 默认使用：
  - `localStorage`
  - `sessionStorage`
- 原因：
  - Web Storage 是同步 API，会阻塞主线程
  - 目录搜索结果包含用户 / 组身份信息，不适合默认长期持久化
  - 当前 picker 每次只拿很小结果集，跨刷新持久化带来的收益有限
- 如果未来有明确“跨刷新仍要保留最近搜索”的产品需求，再考虑 `IndexedDB`，但当前版本不需要。
- cache 建议规则：
  - key 至少包含：
    - `tenantId`
    - `accountId`
    - `principalKind`
    - `searchStrategy`
    - `normalizedQuery`
  - successful collection search TTL：`5 分钟`
  - exact id / exact UPN 命中 TTL：`10 分钟`
  - negative result / 404 TTL：`30 秒`
  - 每个 `principalKind` 最多保留 `50` 个 query entry
  - 登出、切换账号、切换 tenant、Graph `401/403` 时清空相关 cache

### 5. 请求数量保护仍然以前端为主

- 前端：
  - 普通 collection search 至少 3 个字符才开始请求
  - 去抖，建议 `300ms ~ 400ms`
  - 取消或忽略过期请求
  - 相同页签 + 相同 query 由 cache 去重
  - GUID / 完整 UPN / 完整 email 可以绕过 3 字符门槛，直接走 exact search
- Graph 请求参数：
  - 限制 `$top`，建议先 `10`
  - 保持返回字段最小化
  - `$search` 请求带 `ConsistencyLevel: eventual` 和 `$count=true`
  - `startswith(...)`、`or` 组合、`$search` 等 advanced directory collection query 再补齐 Graph 要求的 query/header
  - direct get 和简单 exact `eq` 查询不要无差别地加 advanced query 参数，保持请求最小化

### 6. SDK 已覆盖基础 Graph retry，不要重复手写通用 retry loop

- 本项目当前两条 Graph client 路径都已经有 Microsoft Graph JavaScript SDK 的 `RetryHandler`：
  - 前端 MGT `Providers.globalProvider.graph.client` 由 MGT 创建，middleware chain 中包含 `RetryHandler`
  - 后端 `createGraphClient` 使用 `@microsoft/microsoft-graph-client` 的 `Client.init(...)`，会走默认 middleware chain，其中包含 `RetryHandler`
- 当前 SDK 默认会对 `429`、`503`、`504` 做 retry，优先读取 `Retry-After`，否则使用 backoff；默认 `maxRetries` 为 `3`。
- 所以后续实现不要再包一层通用 429 retry，避免一次请求被 SDK retry 后又被业务代码二次 retry，造成更长等待和更多重复调用。
- 应用层仍然需要做的是：
  - 减少请求次数：最小长度、去抖、cache、取消过期请求
  - 降低写入并发：顺序写入或小批量写入
  - 做清晰错误映射：如果 SDK retry 后仍失败，把 `429` / `Retry-After` / request id 等信息转成前端可理解的错误
  - 避免 JSON batch 里假设 SDK 会自动重试每个子请求；如果未来使用 batch，需要单独处理被 throttled 的子请求

### 7. 权限读写继续保持后端 OBO 路线

- 搜索走前端
- 容器权限 list / create / update / delete 继续走后端
- 这样权限功能的数据访问边界更清晰：
  - 前端负责目录搜索、结果缓存和交互
  - 后端负责真实权限读写、Graph 编排、重试和错误映射
- 对这个功能来说，这样也更平衡安全与服务器性能：
  - 安全上，后端继续走 OBO，只代表当前登录用户使用 delegated permission
  - 性能上，权限加载与写回本身是低频操作，通常只是“打开 Dialog 读一次”和“点击 Apply 写一次”
  - 后端可以集中处理最小 `$select`、顺序写入或小批量写入、SDK retry 后仍失败时的错误映射

## Revised Step Prompts

### 步骤 3：前端目录搜索服务、分级策略与短周期缓存

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的下一步。本步只做前端目录搜索服务，不做最终 TagPicker 交互收尾，不做真实权限写回。

背景：
- 步骤 1、2 已完成，当前权限 Dialog 已有本地草稿编辑能力。
- People / Groups 搜索放在前端直接调用 Microsoft Graph。
- 真实容器权限加载与写回仍保留在后端 OBO。
- 本步要把目录搜索从单纯 `$search` 升级为分级搜索策略，并加入短周期内存缓存。

要求：
1. 先阅读当前权限模块、`src/common/scopes.ts`、前端 Graph 调用方式、现有认证结构和 `AGENTS.md`。
2. 遵守仓库 `AGENTS.md`：新增注释和 JSDoc 必须是简体中文；TypeScript 严格，不允许 `any`。
3. 在前端登录 scopes 中补充并正确使用：
   - `User.ReadBasic.All`
   - `GroupMember.Read.All`
4. 新增独立的前端目录搜索模块或 Hook，不要把 Graph 查询构造、缓存、错误映射堆在 Dialog 组件里。
5. 搜索策略必须按输入类型分级：
   - 如果 query 是 GUID：
     - People tab 调 `GET /users/{id}`
     - Groups tab 调 `GET /groups/{id}`
   - 如果 query 是完整 UPN / email：
     - People 优先调 `GET /users/{userPrincipalName}`，其中 path segment 必须用 `encodeURIComponent`
     - People 若 404，再用 `/users?$filter=mail eq '{q}'`
     - Groups 用 `/groups?$filter=mail eq '{q}'`
   - 如果 query 像 identifier prefix，例如包含 `@`、`.`、`-`、`_` 或明显不是自然语言姓名：
     - People 用 `startswith(userPrincipalName,'{q}') or startswith(mail,'{q}')`
     - Groups 用 `startswith(mail,'{q}') or startswith(mailNickname,'{q}')`
   - 其他普通词或 display name 片段：
     - People 用 `/users?$search="displayName:{q}"`
     - Groups 用 `/groups?$search="displayName:{q}" OR "description:{q}"`
6. 所有 collection 查询都必须使用较小 `$top`，建议 `10`，并使用最小 `$select`。
7. `$search` 请求必须带：
   - `ConsistencyLevel: eventual`
   - `$count=true`
8. 需要 advanced query 的 `$filter` 请求按 Microsoft Graph 规则补齐必要 header / `$count=true`；不需要 advanced query 的 direct get 或 exact `eq` 不额外加复杂参数。
9. 必须实现集中 query builder，不允许在组件里手写拼接 Graph query：
   - URL path segment 用 `encodeURIComponent`
   - OData `$filter` 字符串 literal 中的单引号转成两个单引号
   - `$search` query text 要转义或拒绝会破坏语法的双引号、反斜杠等字符
   - query 参数必须通过 Graph SDK 的 query/select/top/search/filter 等 API 或 `URLSearchParams` 等结构化方式构造，避免裸字符串散落在 UI 组件中
   - `normalizedQuery` 只用于 cache key 和输入判定，实际请求必须使用 escaped query
10. 不允许为了模拟任意位置 contains 而拉大列表后前端过滤。
11. 实现内存 LRU + TTL cache：
   - cache key 包含 `tenantId`、`accountId`、`principalKind`、`searchStrategy`、`normalizedQuery`
   - 成功搜索结果 TTL 为 5 分钟
   - exact id / exact UPN 命中 TTL 为 10 分钟
   - 404 / 空结果 TTL 为 30 秒
   - 每个 `principalKind` 最多保留 50 个 query entry，超过后淘汰最旧 entry
   - 登出、切换账号、切换 tenant、401/403 时清空相关 cache
12. 不要为前端目录搜索手写通用 429 retry loop；MGT / Graph SDK 的默认 client 已包含 RetryHandler。本步只需要把 SDK retry 后仍失败的错误映射清楚。
13. 本步不要使用 `localStorage` 或 `sessionStorage` 持久化目录搜索结果；代码注释中说明原因：同步 API 会阻塞主线程，且目录身份信息不应长期保留。
14. 返回给前端选择器的统一视图模型至少包含：
   - `id`
   - `displayName`
   - `secondaryText`
   - `principalType`
   - user 的 `mail` / `userPrincipalName`
   - group 的 `mail` / `groupTypes` / `mailEnabled` / `securityEnabled`
15. 明确 group 类型映射：
   - `groupTypes` 包含 `Unified` 为 Microsoft 365 group
   - `mailEnabled=true` 且 `securityEnabled=false` 为 DL
   - `mailEnabled=false` 且 `securityEnabled=true` 为 security group
   - `mailEnabled=true` 且 `securityEnabled=true` 为 mail-enabled security group
16. 请补测试，至少覆盖：
   - GUID 输入走 direct get
   - 完整 UPN / email 输入走 exact path
   - identifier prefix 输入走 `startswith` filter
   - 普通 display name 输入走 `$search`
   - UPN / email 中 `#`、空格、单引号等特殊字符的 URL encoding / OData escaping
   - `$search` 输入中双引号、反斜杠等特殊字符不会拼坏 query
   - `$search` header / `$count=true`
   - advanced query 和 simple query 的 header / `$count=true` 差异
   - 最小 `$select` / `$top=10`
   - cache hit 不重复请求 Graph
   - TTL 过期后重新请求
   - 401/403 清空 cache
   - SDK retry 后仍失败时的错误映射
   - Graph 失败时的错误映射
17. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、分级搜索策略、cache 策略、Graph 查询语义限制、所新增 scopes 和测试结果。
```

### 步骤 4：TagPicker 接入真实搜索服务，并控制交互请求频率

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的下一步。假设步骤 3 的前端目录搜索服务、分级策略和内存 cache 已完成。本步只做前端搜索体验与 Fluent UI v9 TagPicker 接入，不做真实权限写回。

要求：
1. 先阅读当前权限模块、现有本地搜索占位逻辑和步骤 3 新增的目录搜索服务。
2. 遵守仓库 `AGENTS.md`：新增注释和 JSDoc 必须是简体中文；新增 UI 用 Fluent UI；TypeScript 严格，不允许 `any`。
3. 把当前本地 `Combobox` 占位替换为 Fluent UI v9 `TagPicker`。
4. TagPicker 不直接构造 Graph query，只调用步骤 3 的统一搜索接口。
5. 请求频率保护落实在 UI 层：
   - 少于 3 个字符不触发 collection search
   - GUID / 完整 UPN / email 可以绕过 3 字符门槛走 exact search
   - 去抖 `300ms ~ 400ms`
   - 输入变化时取消或忽略过期请求
   - 相同 query + same tab 由搜索服务 cache 去重
6. People tab 只返回 user；Groups tab 只返回 group。
7. 候选项显示：
   - 主文本显示 `displayName`
   - 次文本优先显示 `mail` / `userPrincipalName` / group description
   - user 显示头像占位或合理图标
   - group 显示组图标，并可区分 Microsoft 365 group / DL / security group
8. 选择与新增规则：
   - 当前 access list 已存在的对象不可重复新增
   - 已存在对象禁用 `Add` 或显示为不可选
   - 无结果时显示明确空态
   - 只有选择真实候选对象且未重复时，`Add` 才可用
9. UI 文案不要暗示支持任意位置 contains；保持与 Graph tokenized search / startswith 限制一致。
10. 本步不要实现：
   - 真实权限初始加载
   - `Apply` 写回
11. 请补测试，至少覆盖：
   - 少于 3 个字符不触发普通搜索
   - GUID / 完整 UPN / email 可触发 exact search
   - 去抖后才请求
   - 页签切换时搜索源切换
   - 重复对象导致 `Add` 禁用
   - 无结果空态
   - 过期请求不会覆盖新结果
12. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、TagPicker 交互说明、请求频率控制、如何复用步骤 3 cache，以及测试结果。
```

### 步骤 5：真实容器权限加载、差异计算与 Apply 写回

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的收尾步骤。假设前端目录搜索服务和 TagPicker 接入已完成。本步只做真实容器权限加载、差异计算和 `Apply` 写回。

要求：
1. 先探索当前权限模块、前端目录搜索、TagPicker 接入、容器页面和后端 OBO 结构。
2. 遵守仓库 `AGENTS.md`：新增注释和 JSDoc 必须是简体中文；TypeScript 严格，不允许 `any`。
3. 容器权限 list / create / update / delete 继续走后端 OBO，不改成前端直连 Graph。
4. 前端搜索得到的 principal 必须用稳定 `id` 参与权限写回；UPN / email / displayName 只作为展示和搜索辅助字段。
5. 后端权限 API 需要集中处理：
   - 依赖 Graph SDK 默认 RetryHandler 处理基础 `429` / `503` / `504` retry，不重复手写通用 retry loop
   - SDK retry 后仍失败时，提取 `429` / `Retry-After` / request id 等信息并映射给前端
   - 最小字段
   - 顺序写入或小批量写入
   - 面向前端的明确错误映射
6. 实现打开 Dialog 时真实加载当前容器权限，并映射为本地 access list 视图模型。
7. 实现 `Apply`：
   - 对比初始权限和当前草稿
   - 拆分新增、更新、删除
   - 成功后刷新当前列表并清空脏状态
   - 失败时保留草稿并提示明确错误
8. 保留 `Close` 放弃未提交草稿的保护。
9. 如果 UI 角色名与 Graph 权限角色名不同，把映射收敛到单独模块并写中文注释。
10. 请补测试，至少覆盖：
   - 初始权限加载成功后的列表显示
   - 差异拆分逻辑
   - `Apply` 成功
   - `Apply` 失败
   - SDK retry 后仍返回 `429` 时的错误映射
   - 成功后重置脏状态
11. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、为什么权限读写继续采用后端 OBO、权限 API 映射说明、差异计算说明和测试结果。
```

## Notes

- 官方搜索依据：
  - 搜索逻辑当前决定放前端，使用委托权限直接调用 Graph。
  - 前端将补充 `User.ReadBasic.All` 与 `GroupMember.Read.All`。
  - `/people` 已处于 maintenance mode，且它解决的是“相关人”问题，不适合作为本功能唯一的目录搜索基础。
  - 当前权限管理场景需要同时支持 users 与 groups，因此主路径仍以目录对象搜索为主。
- 官方性能与缓存依据：
  - Microsoft Graph best practices 建议仅在明确场景下本地存储 Graph 数据，并为保留与删除设计策略。
  - Graph throttling guidance 建议减少请求次数和调用频率，并按 `Retry-After` 处理 `429`。
  - Microsoft Graph SDK 已内置基于 `Retry-After` 或 backoff 的 retry handler；本项目当前 MGT client 和后端 `Client.init(...)` 路径都会使用 `RetryHandler`。
  - 因此计划中不再要求业务代码重复实现通用 429 retry；业务代码只负责请求量控制、写入并发控制、SDK retry 后仍失败的错误映射。
  - Web Storage 的 `localStorage` / `sessionStorage` 是同步 API，会阻塞主线程，因此不适合作为默认目录搜索 cache 方案。
  - `IndexedDB` 虽然更适合结构化异步缓存，但对当前小结果集 picker 来说属于过度设计。
- Graph 查询依据：
  - `GET /users/{id}` 与 `GET /users/{userPrincipalName}` 适合 exact user lookup。
  - `GET /users/{userPrincipalName}` 的 UPN 必须作为 URL path segment 编码，避免 `#`、空格等字符被浏览器或 HTTP 层误解析。
  - `GET /groups/{id}` 适合 exact group lookup。
  - `/users`、`/groups` 的 `$filter` 适合 exact mail 或 prefix filter。
  - `/users`、`/groups` 的 `$search` 适合 display name / description tokenized search。
  - 需要 advanced query 的目录对象 collection query 要按 Graph 官方要求补齐相关 header / query 参数。
  - 所有 `$filter` / `$search` 都必须通过集中 query builder 做 OData escaping 和 search text escaping，不允许在 UI 组件中散落字符串拼接。
- 架构与边界依据：
  - 搜索使用前端 delegated permission。
  - 容器权限读写继续使用后端 OBO。
  - `fileStorageContainer permissions` 相关 API 本身支持 delegated `FileStorageContainer.Selected`。
- 当前三步拆分仍然合理：
  - 步骤 3 是可单测的数据能力与 cache 能力
  - 步骤 4 是 UI / 交互能力
  - 步骤 5 是后端 OBO 权限读写能力
  - 如果把步骤 3 和 4 合并，会让 Graph 策略、cache、TagPicker 可访问性交互混在一起，review 和测试都会更重
