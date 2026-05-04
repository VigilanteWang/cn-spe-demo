# Issue 1 执行计划（在步骤 2 完成后重整）

## Summary

- 目标仍然是完成 `Container Permission mgmt`，但后续步骤按当前代码状态和 Microsoft Graph 最佳实践重新拆分。
- 当前结论：步骤 1、步骤 2 已完成；后续建议改为 `步骤 3 → 步骤 4 → 步骤 5`。
- 这次重整的重点不是“继续沿用原 prompt”，而是先根据已经落地的实现和官方搜索能力修正后续路线。

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
- 现在的“搜索入口”“搜索语义”“请求节流”“后端边界”都还没定型，继续直接做 UI 容易返工。

## Best-Practice Adjustments

### 1. People / Group search 建议改为后端实现

- 结合本项目现状，建议把 `people/group search` 放到后端，而不是前端直接调 Graph。
- 原因不是“前端一定不能调 Graph”，而是这个仓库已经把容器管理主流程放在后端 OBO 链路里，目录搜索继续走后端更一致：
  - 前端不需要额外直接持有目录搜索 Graph 调用细节
  - 后端更容易统一封装 `ConsistencyLevel`、`$count`、`$select`、`$top`
  - 后端更容易集中做最小长度保护、去抖后的请求语义、查询日志和错误映射
  - 后续权限读取与写回如果也走后端，权限模块的数据流会更整齐
- 这仍然符合 Microsoft Graph 的交互式应用最佳实践，因为后端可以继续用 OBO 代表当前登录用户发起委托调用，而不是改成 application permission。

### 2. 搜索 API 形式建议

- People 搜索：
  - 用 `GET /users`
  - 用 `$search`
  - 查询语义建议为：
    - `displayName:{q}`
    - `mail:{q}`
    - `userPrincipalName:{q}`
  - 组合方式：
    - `$search="displayName:{q}" OR "mail:{q}" OR "userPrincipalName:{q}"`
- Group 搜索：
  - 用 `GET /groups`
  - 用 `$search`
  - 查询语义建议为：
    - `displayName:{q}`
    - `description:{q}`
    - `mail:{q}`
  - 组合方式：
    - `$search="displayName:{q}" OR "description:{q}" OR "mail:{q}"`
- 两者都要加：
  - `ConsistencyLevel: eventual`
  - `$count=true`
  - 较小的 `$top`，建议先 `10`
  - 最小化 `$select`

### 3. 搜索能力边界要按 Graph 官方语义设计

- Graph 目录对象 `$search` 不支持真正的 `contains`。
- `displayName` 和 `description` 走 tokenized search。
- `mail`、`userPrincipalName` 这类其他字符串字段在 `$search` 中默认更接近 `startswith` 行为。
- 所以这次需求里：
  - “可以从姓开始搜”是合理目标，只要姓能作为 `displayName` 的 token 被切出来
  - “支持 UPN / email / displayName 搜索”是合理目标
  - 但“UPN / email 任意位置真正 contains”不应该靠大范围拉取后再本地过滤去伪造，这不符合最佳实践，也会明显放大请求和数据量
- 后续实现和 prompt 里应明确写成：
  - `displayName` 支持 tokenized match
  - `mail / userPrincipalName` 按 Graph 官方能力支持搜索，接受其非完全 contains 的限制

### 4. 请求数量保护要前后端双保险

- 前端：
  - 至少 3 个字符才开始请求
  - 去抖，建议 `300ms ~ 400ms`
  - 取消过期请求
  - 相同页签 + 相同 query 去重
- 后端：
  - 长度不足 3 直接拒绝或返回空数组
  - 限制 `$top`
  - 保持返回字段最小化
- 这样比“每次输入都打一次 Graph”更稳，也更接近官方关于最小化数据与节流恢复的建议。

### 5. 权限读写步骤也建议改成后端 OBO 路线

- 原计划步骤 4 写的是“前端直接调用 Graph，不新增后端权限路由”。
- 现在看，后续最好改成：
  - 权限搜索走后端
  - 容器权限 list / create / update / delete 也走后端
- 这样权限功能的数据访问边界一致，前端只保留 UI 与状态编排。
- 对这个功能来说，这样也更平衡安全与服务器性能：
  - 安全上，后端继续走 OBO，只代表当前登录用户使用 delegated permission，不需要为了方便把权限操作暴露成前端直连 Graph 细节
  - 性能上，权限加载与写回本身是低频操作，通常只是“打开 Dialog 读一次”和“点击 Apply 写一次”，多一跳后端带来的成本通常小于统一节流、重试、错误映射带来的收益
  - 后端可以集中处理 `429` / `Retry-After`、最小 `$select`、顺序写入或小批量写入策略，避免前端分散实现

### 6. 权限加载与写回应避免“为了省服务器而前端直连”

- 在这个场景里，“把真实权限加载与写入放前端”并不能明显节省真正昂贵的成本，因为真正的外部调用仍然是 Graph。
- 反而如果前端直连：
  - Graph 请求构造、重试、节流、审计信息会分散到 UI 层
  - 更难统一约束最小字段、最小调用次数和错误处理
  - 后续如果再加权限校验、审计日志或故障排查，改造成本更高
- 所以后续计划应坚持：
  - 前端做展示、草稿和交互
  - 后端做真实数据访问、Graph 编排和稳定性处理

## Revised Step Prompts

### 步骤 3：后端目录搜索 API（People / Groups）

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的下一步。本步只做后端目录搜索能力，不做前端 TagPicker 接入，不做真实权限写回。

背景：
- 步骤 1、2 已完成，当前权限 Dialog 已有本地草稿编辑能力。
- 本项目已有后端 OBO 架构，容器管理主流程已经通过后端代表用户调用 Graph。
- 这一步要把 People / Groups 搜索放到后端，作为后续前端选择器的真实数据源。

要求：
1. 先阅读当前 `server/`、`src/services/spembedded.ts`、权限模块和现有 OBO 代码，再直接实现。
2. 遵守仓库 `AGENTS.md`：新增注释和 JSDoc 必须是简体中文；TypeScript 严格，不允许 `any`。
3. 本步新增后端目录搜索 API，建议形态：
   - 一个统一路由，例如按 `type=people|groups`
   - 或两个独立路由
   - 但都必须走现有后端 OBO → Graph 链路
4. People 搜索必须调用 Microsoft Graph `GET /users`，使用 `$search`，并按官方能力组合：
   - `displayName:{q}`
   - `mail:{q}`
   - `userPrincipalName:{q}`
5. Groups 搜索必须调用 Microsoft Graph `GET /groups`，使用 `$search`，并按官方能力组合：
   - `displayName:{q}`
   - `description:{q}`
   - `mail:{q}`
6. 所有目录搜索请求都必须正确带上：
   - `ConsistencyLevel: eventual`
   - `$count=true`
   - 较小的 `$top`，建议先 `10`
   - 最小必要 `$select`
7. 必须前后端双保险地保护请求量：
   - query 长度不足 3 时，后端直接返回空结果或明确的 400
   - 不允许为了“contains”效果去拉大列表后本地过滤
8. 请把 Graph 查询构造、响应映射、错误处理拆到独立模块，不要把逻辑堆到 `server/index.ts`。
9. 返回给前端的视图模型要统一，至少包含：
   - `id`
   - `displayName`
   - `secondaryText`
   - `principalType`
   - 对 user 返回 `mail` / `userPrincipalName`
10. 请在代码中明确说明 Graph 搜索语义限制：
   - `displayName` / `description` 是 tokenized search
   - `mail` / `userPrincipalName` 不应承诺“任意位置 contains”
11. 本步不要实现：
   - 前端 `TagPicker`
   - 权限初始加载
   - `Apply` 写回
12. 请补测试，至少覆盖：
   - People 搜索 query 构造
   - Groups 搜索 query 构造
   - 3 个字符门槛
   - Graph 响应到前端模型的映射
   - Graph 失败时的错误映射
13. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、API 设计、Graph 查询语义说明和测试结果。
```

### 步骤 4：前端 TagPicker 接入真实搜索，并控制请求频率

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的下一步。假设后端目录搜索 API 已完成。本步只做前端搜索体验与真实选择器接入，不做真实权限写回。

背景：
- 当前 Dialog 已有本地草稿编辑。
- 后端已提供真实 People / Groups 搜索 API。
- 本步要把本地 `Combobox` 占位替换成 Fluent UI v9 `TagPicker`，并把请求频率保护做好。

要求：
1. 先阅读当前权限模块、现有本地搜索占位逻辑和新增的后端搜索 API，再直接实现。
2. 遵守仓库 `AGENTS.md`：新增注释和 JSDoc 必须是简体中文；新增 UI 用 Fluent UI；TypeScript 严格，不允许 `any`。
3. 必须把当前占位输入替换为 Fluent UI v9 `TagPicker`。
4. 搜索源切换规则：
   - `People` 页签只调用 people 搜索 API
   - `Groups` 页签只调用 groups 搜索 API
5. 请求量保护必须落实到前端交互：
   - 少于 3 个字符不发请求
   - 去抖，建议 `300ms ~ 400ms`
   - 输入变化时取消过期请求
   - 相同 query + 相同 tab 不重复请求
6. 候选项显示要求：
   - 主文本显示 `displayName`
   - 次文本优先显示 `mail` / `userPrincipalName` / group description
   - user 显示头像占位或合理图标
   - group 显示组图标
7. 选择与新增规则：
   - 当前 access list 已存在的对象不可重复新增
   - 如果对象已存在于当前 access list，禁用 `Add`，并把 access list 过滤到匹配项
   - 无结果时禁用 `Add`，显示明确空态
   - 只有选择了一个真实候选对象且该对象尚未存在于当前 access list 时，`Add` 才可用
8. 搜索语义要与后端 Graph 能力一致，不要在前端文案里暗示“任意位置 contains”。
9. 本步不要实现：
   - 真实权限初始加载
   - `Apply` 写回
10. 请把异步搜索状态拆到独立 Hook，例如：
   - query
   - debounce 后的请求时机
   - loading
   - empty
   - error
   - request cancellation
11. 请补测试，至少覆盖：
   - 少于 3 个字符不请求
   - 去抖后才请求
   - 页签切换时搜索源切换
   - 重复对象导致 `Add` 禁用
   - 无结果空态
   - 过期请求不会覆盖新结果
12. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、前端请求控制策略、TagPicker 交互说明和测试结果。
```

### 步骤 5：真实容器权限加载、差异计算与 Apply 写回

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的收尾步骤。假设前 4 步已经完成。本步只做真实容器权限加载、差异计算和 `Apply` 写回。

背景：
- 现在的搜索能力已经通过后端 OBO 提供。
- 本步也请保持同一架构方向：容器权限 API 同样通过后端代表用户调用 Graph。
- 这一步的目标不是“尽量减少服务器参与”，而是在低频权限操作场景下平衡安全与性能：前端保留 UI 状态，后端承接真实 Graph 读写、节流、重试和错误映射。

要求：
1. 先探索当前权限模块、后端目录搜索、容器页面的最新状态，再直接实现。
2. 遵守仓库 `AGENTS.md`：新增注释和 JSDoc 必须是简体中文；TypeScript 严格，不允许 `any`。
3. 本步接入真实容器权限 API，且继续走后端 OBO 路线；不要改成前端直接调用 Graph：
   - `list fileStorageContainer permissions`
   - `create fileStorageContainer permission`
   - `update fileStorageContainer permission`
   - `delete fileStorageContainer permission`
4. 请按最小权限和最小数据原则实现：
   - 委托权限保持为当前场景所需的最小集合，不要因为实现方便扩大到更高权限
   - 读取时使用最小必要字段和合理的查询参数
   - 不要为了减少后端参与而把 Graph 读写改成前端直连
5. 不要把权限逻辑塞回现有 `src/services/spembedded.ts`；请保持权限功能自己的前后端模块边界。
6. 后端必须统一处理 Graph 稳定性问题：
   - `429` / `Retry-After`
   - 必要的退避重试
   - 面向前端的明确错误映射
   - 关键请求日志字段（至少保留可排查 request 级别问题的结构）
7. 实现真实初始加载：
   - 打开 Dialog 时读取当前容器权限
   - 映射到本地 access list 视图模型
   - loading / error 状态完整
8. 实现 `Apply`：
   - 对比初始权限和当前草稿
   - 正确拆分新增、更新、删除
   - 默认优先顺序调用或小批量调用，避免为追求表面速度而制造更高 Graph 节流风险
   - 成功后刷新当前列表并清空脏状态
   - 失败时给出明确错误提示，不吞错
9. 保留 `Close` 放弃未提交草稿的保护。
10. 如果 Graph 权限模型里存在当前 UI 角色名与后端 API 角色名的映射，请把映射收敛到单独模块并写清楚中文注释。
11. 请补测试，至少覆盖：
   - 初始权限加载成功后的列表显示
   - 差异拆分逻辑
   - `Apply` 成功
   - `Apply` 失败
   - `429` 或可重试失败的处理
   - 成功后重置脏状态
12. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、为什么此处采用后端 OBO 而不是前端直连、权限 API 映射说明、差异计算说明和测试结果。
```

## Notes

- 官方搜索依据：
  - 交互式场景优先使用委托权限，不建议为这类 UI 搜索切到 application permission。
  - `/people` 已处于 maintenance mode，且它解决的是“相关人”问题，不适合作为本功能唯一的目录搜索基础。
  - 当前权限管理场景需要同时支持 users 与 groups，因此后续主路径应以目录对象搜索为主。
- 因为 Graph 目录搜索语义本身有限制，后续 prompt 应该避免再写“任意位置 contains UPN / email”这类超出官方能力边界的目标。
- 官方权限与架构依据：
  - 交互式应用优先使用 delegated permission，而不是为方便而切到 application permission
  - OBO 适合“前端有用户、后端代用户继续调用 Graph”的链路
  - `fileStorageContainer permissions` 相关 API 本身支持 delegated `FileStorageContainer.Selected`，因此没有必要为了这个功能改成 app-only 或前端直连优先
- 性能判断依据：
  - 权限加载与写回是低频操作，通常不是这个页面的主要吞吐瓶颈
  - 真正需要严控的是 Graph 请求次数、字段量、重试和节流策略，而这些更适合统一放在后端
- 如果后续验证发现 `TagPicker` 与现有测试环境的可访问性或交互模型有特殊兼容问题，再把前端步骤纵向细拆，不要把问题强塞进权限写回步骤里。
