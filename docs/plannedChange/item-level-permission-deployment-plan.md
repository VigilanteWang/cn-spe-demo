# Item-Level Permission 部署计划

## Summary

- 建议不要按 `issue #6` 原始设想继续做“前端直接写 Graph”。基于当前项目现状，推荐统一为：
  - 前端：继续负责目录搜索、Dialog 编排、草稿交互。
  - 后端 OBO：负责 item permission 的真实 `list / get / invite / update-or-recreate / delete`、错误映射、最小 Graph 适配层。
- 这样才能最大化复用现有 `container permission` 的组件、hooks、contracts、error handling，以及当前已经稳定下来的“前端搜索 / 后端权限写回”边界。
- `item permission` 不应复刻 container 的 API 细节，而应抽成“共享核心 + scope-specific adapter”：
  - `container` adapter 继续处理 4 个角色和 container Graph shape。
  - `item` adapter 处理 additive permission、父子权限集合比对、`invite` 请求体和 2 个角色。
- 当前容器对话框真实实现仍是 `Combobox`，不是旧 issue 里的 `TagPicker`。为了满足“风格一致且最大复用”，item dialog 应先复用当前 `Combobox` 风格；不要只给 item 单独上 `TagPicker`。

## Key Changes

### 1. 共享权限核心与双 scope 结构

- 提取共享前端核心，保留两个 scope-specific 对话框：
  - 共享前端核心：`PermissionDialogShell`、`PermissionAccessList`、`usePermissionDraft`、搜索 hook、统一状态区、统一错误展示。
  - 共享后端核心：最小 `IGraphClient`、通用 readers、通用 error code/body、principal normalization。
  - scope-specific 组件：`ContainerPermissionDialog`、`ItemPermissionDialog`。
- 新增一层共享契约，再让 container/item 扩展：
  - 共享基类至少包含：`id`、`permissionId?`、`principalId`、`principalName`、`principalType`、`description`、`isInherited`、`isEditable`、`isRemovable`。
  - `container` 角色保留 `Reader | Writer | Manager | Owner`。
  - `item` 角色单独定义为 `Reader | Writer`，不要硬塞进 container union。
  - item create change 不能沿用“people 用 UPN、groups 用 id”的 container 形状；应改为带 recipient envelope，至少保留 `objectId`，并允许 `email` / `alias` 作为 fallback，因为 `driveRecipient` 官方支持这三种标识。

### 2. Item Dialog UI 复用策略

- item dialog 继续保留 `People / Groups` tabs。
- 顶部增加 item 名称副标题，超出 32 字符优雅截断。
- 增加 additive 说明文案和 `Manage Container Permission` link button。
- 同一张 access list 里按 “explicit / inherited” 两类语义展示；继承行沿用相同行组件，但 role 下拉禁用、删除按钮禁用，并显示只读提示。
- 如果某一行被判定为 inherited permission，则在该行第一列内容区域的右对齐位置显示 `ConvertRangeRegular` 图标，用于明确表达“来自上级传播”。
- 当前 container dialog 实际是 `Combobox` 风格，不是 TagPicker；item dialog 必须与它保持一致，避免权限 UI 分叉。

### 3. Item Permission 的 Graph 与后端策略

- item permission 的真实写操作统一走后端 OBO，不走前端直接写 Graph。
- 截至 `2026-05-20` 的官方文档约束下，新增用户/组 additive permission 采用：
  - `POST /drives/{drive-id}/items/{item-id}/invite`
  - `sendInvitation=false`
- 不使用 `POST /drives/{drive-id}/items/{item-id}/permissions` 作为普通用户/组授权主路径；该接口在 SPE 文档里限制更偏向 `sharePointGroup` 的 app-only 场景。
- `GET /drives/{drive-id}/items/{item-id}/permissions` 返回的是 effective permissions，因此必须显式识别：
  - 显式 additive permission
  - 来自父级传播的 inherited permission
- 不把 `inheritedFrom` 作为正式判别依据。当前 Microsoft 文档与社区答复都说明，针对 OneDrive for Business / SharePoint document libraries，`inheritedFrom` 不可靠；当前实测里它虽然会出现，但常常只是空对象 `{}`，不能提供稳定来源信息。
- 正式判别策略定为“即时父项 effective permission 集合比对”：
  - 先读取当前 item 的 `parentReference`，定位即时父项。
  - 再读取即时父项的 `GET /permissions`。
  - 以 `permissionId` 为主键，把“当前 item 某条 permission 是否也存在于父项 effective permission 集合中”作为 inherited 判定主条件。
  - 正式实现只以 `permissionId` 作为 inherited 判定主键；如果未来真实遇到 `permissionId` 无法覆盖的 payload，再基于实测样本重新设计。
  - 如果 item 没有 `parentReference`，或父项读取失败，则保守降级为“不自动判成 inherited”，避免误禁用本可编辑的显式权限。
- 之所以只比对即时父项，而不是回溯整条祖先链，是因为父项返回的也是 effective permissions；祖先继承下来的权限应已出现在即时父项集合中，因此即时父项比对已经足够覆盖常见继承场景，同时请求数更可控。
- 删除只允许显式权限；继承权限不可删。
- 角色修改策略必须先做租户验证：
  - 如果当前租户对显式 invite permission 的 `PATCH /permissions/{id}` 可用，则直接 PATCH。
  - 如果不可用，则统一走“删除旧显式权限，再按新角色重建显式权限”的策略。

### 4. 对现有 Container Permission 的必要重构

- 把 `ContainerPermissionApiError` 上提为更通用的 `PermissionApiError`。
- 把 `permissionModels` 与 `containerPermissionCommonContracts` 里的共通字段拆到共享层。
- 保留 container 现有行为，不顺手改成新的 container upsert 语义；container 改造只做“为了共享核心必须做的部分”。
- 目录搜索仍保持当前最佳实践边界：
  - 前端负责 People / Groups 搜索
  - 后端 OBO 负责真实 permission 读写

## Test Plan

- 契约与适配层：
  - item permission payload 中 explicit / inherited 的区分。
  - `inheritedFrom` 出现、缺失或为空对象 `{}` 时，都不会被当作正式判别依据。
  - 当前 item 与即时父项存在相同 `permissionId` 时，会稳定判定为 inherited。
  - 父项读取失败时，分类逻辑保守降级，不误把显式权限判成 inherited。
  - `driveRecipient` body 的 `objectId / email / alias` 选择规则。
  - role update 的 `PATCH` 与 `delete + recreate` 分流。
  - 非 identity permission 的忽略或提示行为。
- 共享前端状态层：
  - 共享 draft hook 对 container/item 都能正常工作。
  - inherited 行不会进入可编辑 diff。
  - candidate 到 row 的字段保留完整。
- UI 编排：
  - 行级 `Permissions` 按钮打开 item dialog。
  - item name 32 字符截断。
  - additive 文案与 container link button。
  - dirty 状态下从 item 切到 container 的放弃确认。
  - inherited 行显示 `ConvertRangeRegular` 图标，且不可改、不可删。
  - explicit 行可增删改。
- 最小验证命令：
  - `npm test -- --run src/components/permissions`
  - `npm test -- --run src/components/files`
  - `npm test -- --run server`
  - `npx tsc --noEmit`

## Step Prompts

### Step 0：先做租户验证和 payload 取证

目标：在当前租户、当前 app registration、当前 OBO 路径下确认 item permission 的真实可用性和返回 shape。

```text
@github 请在当前 `cn-spe-demo` 仓库先做 item permission 验证性工作，不做最终 UI 实现。

要求：
1. 阅读 issue #5、issue #6、当前 `src/components/permissions`、`server/containerPermissions`、`server/auth.ts`。
2. 设计并执行最小验证，覆盖：
   - GET /drives/{driveId}/items/{itemId}/permissions
   - GET /drives/{driveId}/items/{itemId}/permissions/{permissionId}
   - POST /drives/{driveId}/items/{itemId}/invite (sendInvitation=false, roles=read/write)
   - DELETE /drives/{driveId}/items/{itemId}/permissions/{permissionId}
   - PATCH /drives/{driveId}/items/{itemId}/permissions/{permissionId}（仅对显式权限做验证）
3. 输出一份验证结论文档，明确：
   - 当前租户是否真的需要额外 Graph delegated permission（尤其 Files.Read / Files.ReadWrite）
   - `inheritedFrom` 在当前 SPE payload 中是否稳定返回
   - invite 创建出来的 permission 是否可 PATCH
   - group 邀请是否更适合用 objectId、email 还是 alias
   - 发现的真实 payload 样例和风险点
4. 不改正式功能代码，只允许新增验证文档和必要的临时验证脚本/说明。
5. 最后给出结论摘要和后续正式实现建议。
```

### Step 1：抽共享权限核心，并让 container 先迁移到新核心

目标：先把复用边界做对，再接 item，避免 item 落地后再返工 container。

```text
@github 请先重构权限模块的共享核心，再接入 item-level。当前阶段不要实现 item Graph 写回。

要求：
1. 从现有 container permission 中提取共享前端/后端核心：
   - 共享 entry base、共享 draft hook、共享错误类型、共享 principal candidate 模型、共享 Graph adapter 边界
   - container/item 各自保留自己的 role union、request/response contract、adapter
2. 当前 container dialog 的视觉和交互行为必须保持不变。
3. 把 `ContainerPermissionApiError`、前端 permission models、后端 minimal Graph contracts 做通用化命名，但不要破坏现有测试语义。
4. 把 principal candidate 扩充为可支持 item invite：
   - 保留 objectId
   - 保留 user 的 UPN / mail
   - 保留 group 的 mail / alias 候选信息
5. 共享 entry base 需要从一开始就预留 item-only 只读状态字段：
   - `isInherited`
   - `isEditable`
   - `isRemovable`
   - 可选的 `inheritanceSource` 或等价内部分类字段，但不要把 `inheritedFrom` 原样暴露成前端正式语义
6. 最后只验证 container 现有测试仍通过，并总结共享层边界。
```

### Step 2：实现 item backend/OBO adapter 与 item contracts

目标：让 item 也走“前端草稿 + 后端 OBO apply”的稳定路径。

```text
@github 请基于已抽出的共享权限核心，实现 item-level permission 的后端和共同契约，不做最终 UI 接线。

要求：
1. 新增 item permission 的共同 contracts、前端 API client、后端 route/handler/adapter/parser/error mapper。
2. 后端 Graph 调用统一走 OBO，不走前端直接写 Graph。
3. item list 要把 effective permissions 映射为两类：
   - explicit additive permissions
   - inherited permissions
4. inherited permission 判别不能依赖 `inheritedFrom`。请按以下固定方案实现：
   - 读取当前 item metadata，拿到 `parentReference`
   - 若存在父项，则额外读取父项 `GET /permissions`
   - 以 `permissionId` 比对父子 effective permission 集合；同一 `permissionId` 同时出现在父项与当前项时，当前项该行标记为 inherited
   - 不再额外保留 `principal identity + facet kind + sorted roles` 这一类只读 fallback；当前实现只信任 `permissionId`
   - 父项读取失败、无父项、或分类存在不确定性时，宁可不判 inherited，也不要误禁用显式权限
   - 该规则写进代码注释和测试，说明原因是 Microsoft 文档与社区答复都表明 `inheritedFrom` 在 SharePoint / OneDrive for Business 中不可靠
5. 仅把 AAD `user` / `group` 这类 identity permission 纳入此对话框模型；
   link / application 等非本对话框管理对象不要做可编辑行，必要时返回一个“存在未纳入管理的权限类型”的提示标记。
6. item create 使用 invite；recipient 默认优先 objectId，验证不通过时再按 Step 0 结论切到 email 或 alias。
7. item role update 策略：
   - Step 0 结论确认 PATCH 稳定可用：直接 PATCH
   - 否则：remove old explicit permission + create new explicit permission
8. 继承权限行必须标记为只读，不允许 update/remove。
9. 最后补 adapter/parser/diff 测试。
```

### Step 3：实现 ItemPermissionDialog 与 Files/Containers 编排接线

目标：把 UI 落地，并完成 item <-> container dialog 的切换链路。

```text
@github 请实现 item-level permission 的前端对话框和页面接线，严格复用现有 container permission 风格与逻辑。

要求：
1. 新增 `ItemPermissionDialog`，复用共享 Dialog shell、tabs、picker、status area、apply/close 交互。
2. item dialog 的顶部差异仅限：
   - 标题 `Manage Item Permission`
   - item name 副标题（32 字符截断）
   - additive 说明文案
   - `Manage Container Permission` link button
3. 当前 container dialog 实际是 Combobox，不是 TagPicker；item dialog 必须先保持同样风格，避免 UI 分叉。
4. `FilesDataGrid` 只负责抛出 `onManagePermissions(item)`，不要在表格里塞权限逻辑。
5. `Files` 持有 item dialog 开关和当前 item；`Containers` 继续持有 container dialog 开关。
6. 从 item dialog 跳转到 container dialog 的流程：
   - 若无未保存改动：关闭 item dialog，再通知父层打开 container dialog
   - 若有未保存改动：先弹放弃确认，再执行切换
7. inherited rows 的视觉与交互要求：
   - 第一列右对齐位置显示 `ConvertRangeRegular` 图标
   - role dropdown 禁用
   - delete 按钮禁用
   - 需要有清晰的只读提示文案，但不要把表格挤得过重
8. 测试至少覆盖：
   - inherited rows 显示 `ConvertRangeRegular`
   - inherited rows 的 role 和 delete 都不可点击
   - explicit rows 不受影响
9. 最后补 UI 测试和交互测试。
```

## Assumptions

- 默认采用“分步实施”，并把 Step 0 作为必须前置，而不是边写 UI 边猜 Graph 行为。
- 默认保持当前“前端搜索、后端 OBO 读写”的权限边界，不回退到 `issue #6` 原始的前端直写 Graph。
- 如果 Step 0 发现 item permission API 需要额外 Graph delegated scopes，则优先只补到后端 OBO 下游权限，不默认把 `Files.ReadWrite` 加到前端登录 scopes。
- 如果微软文档与真实 SPE payload 继续冲突，以 Step 0 的租户实测为准；尤其是 `inheritedFrom` 与 item permission `PATCH` 能力。
- 当前默认结论是：
  - `PATCH /permissions/{id}` 在本租户可用，应优先直接 PATCH
  - `inheritedFrom` 不能作为正式判别依据
  - inherited 判别默认采用“即时父项 effective permission 集合比对”，主键为 `permissionId`
- 截至 `2026-05-21`，规划依据的官方文档是：
  - `Sharing and Permissions`
  - `driveItem invite`
  - `driveItem list permissions`
  - `permission delete`
  - `driveRecipient`
  - `fileStorageContainer list permissions`
