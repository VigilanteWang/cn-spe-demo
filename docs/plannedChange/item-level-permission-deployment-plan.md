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
  - 如果 `parentReference.path` 已经指向 `.../root:`，则把它视为 drive root / container 边界，不再继续读取“父项权限”。
  - 再读取即时父项的 `GET /permissions`。
  - 以 `permissionId` 为主键，把“当前 item 某条 permission 是否也存在于父项 effective permission 集合中”作为 inherited 判定主条件。
  - 正式实现只以 `permissionId` 作为 inherited 判定主键；如果未来真实遇到 `permissionId` 无法覆盖的 payload，再基于实测样本重新设计。
  - 如果 item 没有 `parentReference`，或父项读取失败，则保守降级为“不自动判成 inherited”，避免误禁用本可编辑的显式权限。
- 之所以只比对即时父项，而不是回溯整条祖先链，是因为父项返回的也是 effective permissions；祖先继承下来的权限应已出现在即时父项集合中，因此即时父项比对已经足够覆盖常见继承场景，同时请求数更可控。
- 删除只允许显式权限；继承权限不可删。
- 共享 identity 解析当前进一步收窄为：只接受 `grantedToV2` 里的 AAD `user` / `group`。
  - `siteUser` / `siteGroup` 不纳入正式管理模型。
  - 只出现在 deprecated `grantedTo`、而不在 `grantedToV2` 中出现的 identity，当前也不作为正式支持面。
  - 这类未纳管 permission 不要在当前主流程里扩成新的只读 row model；如果后续产品确实需要提示，再单独加最小提示位。
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
  - 顶层 item 的 `parentReference.path` 指向 `/root:` 时，不会误触发父项权限读取，也不会被误判成 inherited。
  - 父项读取失败时，分类逻辑保守降级，不误把显式权限判成 inherited。
  - 只有 `grantedToV2.user/group` 会进入正式可编辑模型；`siteUser` / `siteGroup` 与 `grantedTo`-only permission 会被排除在当前支持面之外。
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

## Current Status

- `Step 0` 已完成：当前租户/OBO 路径下，`invite / list / get / delete / PATCH` 都已做过验证，当前默认结论仍是 item 显式 permission 可以直接 `PATCH`。
- `Step 1` 已完成：共享权限核心、共享 contracts、共享 draft hook、共享错误模型已经抽出，container 现有行为保持不变。
- `Step 2` 已完成，并且在 `d945ce06e7f65928beb91b93d0d387e5d9d184d3` 之后又继续收窄：
  - item backend route / handler / parser / error mapper 已落地。
  - item 前端 API client 与 diff 逻辑已落地。
  - inherited 判定现在只依赖“当前项与即时父项的 `permissionId` 比对”，不再保留 fingerprint fallback。
  - 顶层 item 如果 `parentReference.path` 指向 `/root:`，不会再把 drive root 误当成可比较父项。
  - 共享 identity 解析当前只认 `grantedToV2` 中的 AAD `user` / `group`；`siteUser` / `siteGroup` 以及 `grantedTo`-only identity 继续留在未纳管边界之外。
- 因此，当前真正剩下的主路径已经不是“继续实现 Step 2 后端”，而是把现有 Step 2 产物稳定接到前端 UI，并把 `200 + []` 的歧义处理清楚。
- 当前已确认的产品取向是：
  - 先允许打开 item permission dialog，不额外做前置 eligibility gate。
  - 但如果当前 caller 读到的是空列表，UI 不能直接把它解释成“该文件没有 item-level permission”。
  - 该场景要显示明确提示文案，并附上 Microsoft Graph 与 SharePoint Embedded 的说明链接。

## Step Prompts

### Step 0（已完成）：先做租户验证和 payload 取证

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

### Step 1（已完成）：抽共享权限核心，并让 container 先迁移到新核心

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

### Step 2（已完成）：实现 item backend/OBO adapter 与 item contracts

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
5. 仅把 `grantedToV2` 中可解析出的 AAD `user` / `group` 这类 identity permission 纳入此对话框模型；
   `siteUser` / `siteGroup`、link / application、以及 `grantedTo`-only 这类非当前正式支持面的对象，不要做可编辑行，也不要在这一步扩成新的只读模型。
6. item create 使用 invite；recipient 默认优先 objectId，验证不通过时再按 Step 0 结论切到 email 或 alias。
7. item role update 策略：
   - Step 0 结论确认 PATCH 稳定可用：直接 PATCH
   - 否则：remove old explicit permission + create new explicit permission
8. 继承权限行必须标记为只读，不允许 update/remove。
9. 最后补 adapter/parser/diff 测试。
```

### Step 3：实现 ItemPermissionDialog 与 Files/Containers 编排接线

目标：在不重开 Step 2 范围的前提下，把当前已经存在的 item permission 后端、API client、diff 逻辑真正接到 UI，并完成 item <-> container dialog 的切换链路。

```text
@github 请实现 item-level permission 的前端对话框和页面接线，严格复用现有 container permission 风格与逻辑，并以当前已经完成的 Step 2 代码为前提继续推进。

要求：
1. 先复用现有 Step 2 产物，不要重复建设新的接口层或前端差异计算：
   - `src/services/itemPermissionApi.ts`
   - `src/components/permissions/services/itemPermissionDiff.ts`
   - 共享 `usePermissionDraft`、tabs、picker、status area、apply/close 交互
   - 当前 `common/contracts/` 里的 item/common permission 契约
2. 新增 `ItemPermissionDialog`，但不要在前端重新推导 inherited：
   - 前端只信任后端返回的 `isInherited`、`isEditable`、`isRemovable`、`inheritanceSource`
   - 不在 UI 层再做父子 permission 比对
   - 顶层 item 是否可编辑，继续以服务端已经处理过的 `/root:` 边界结果为准
3. item dialog 的顶部差异仅限：
   - 标题 `Manage Item Permission`
   - item name 副标题（32 字符截断）
   - additive 说明文案
   - `Manage Container Permission` link button
4. 当前 container dialog 实际是 Combobox，不是 TagPicker；item dialog 必须先保持同样风格，避免 UI 分叉。
5. `FilesDataGrid` 只负责抛出 `onManagePermissions(item)`，不要在表格里塞权限逻辑。
6. `Files` 持有 item dialog 开关和当前 item；`Containers` 继续持有 container dialog 开关。
7. 从 item dialog 跳转到 container dialog 的流程：
   - 若无未保存改动：关闭 item dialog，再通知父层打开 container dialog
   - 若有未保存改动：先弹放弃确认，再执行切换
8. inherited rows 的视觉与交互要求：
   - 第一列右对齐位置显示 `ConvertRangeRegular` 图标
   - role dropdown 禁用
   - delete 按钮禁用
   - 需要有清晰的只读提示文案，但不要把表格挤得过重
9. 当前版本先不要额外实现“打开前 eligibility gate”：
   - 先允许用户进入 dialog
   - 如果后端返回 `entries=[]`，不要自动解释成“没有 item-level permission”
   - 需要显示下面这条 disclaimer，作为当前 demo app 的明确说明：
     `This list may appear empty even when item-level permissions exist. If you only have **read access** to this file, Microsoft Graph **might not** return existing item-level permissions. Learn more [here](https://learn.microsoft.com/en-us/graph/api/driveitem-list-permissions?view=graph-rest-1.0&tabs=http#access-to-sharing-permissions) and [here](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm#role-based-sharing-setting).`
   - 这条提示只用于“空列表但 caller 可能受 Graph 可见性限制”的场景；不要在已有 permission rows 时抢占主界面注意力
10. 不要在这一步悄悄放大 Step 2 已经收窄的支持面：
   - 当前仅纳管 AAD `user/group`
   - `siteUser` / `siteGroup`、link、application、以及 `grantedTo`-only permission 继续留在未纳管/忽略边界
   - 不要为这些对象临时补一套只读行模型
11. 测试至少覆盖：
   - inherited rows 显示 `ConvertRangeRegular`
   - inherited rows 的 role 和 delete 都不可点击
   - explicit rows 不受影响
   - item dialog 读取/提交时复用现有 `itemPermissionApi` 与 `itemPermissionDiff`
   - item -> container 切换时的 dirty confirm
   - 空列表时会显示上述 disclaimer 和两个 learn-more links
12. 如果 `src/components/files/index.tsx` 里仍保留当前已知的两个 `implicit any` 报错，而本步又需要改这个文件，则应在同一轮里一并修掉，避免 `npx tsc --noEmit` 继续被旧报错卡住。
13. 最后补 UI 测试和交互测试，并跑最小相关验证。
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
  - `parentReference.path` 指向 `/root:` 的顶层 item，不再继续做父项权限比对
  - 当前正式支持面只包括 `grantedToV2` 中可解析出的 AAD `user/group`
- 当前 demo app 对 `entries=[]` 的处理策略不是“判定没有 item-level permission”，而是显示免责声明：
  - 空列表可能是真的没有 item-level permission
  - 也可能是 caller 只有 **read access**，因此 Microsoft Graph **might not** 返回既有条目
- 因此当前阶段不再把“reader 打不开 dialog”当成前置约束，而是把歧义通过 UI 文案显式告知用户。
- 如果未来产品真的要求提示“存在未纳管权限”，应另开新步骤处理；不要在当前 Step 3 里顺手扩展新的提示模型或只读 row model。
- 截至 `2026-05-21`，规划依据的官方文档是：
  - `Sharing and Permissions`
  - `driveItem invite`
  - `driveItem list permissions`
  - `permission delete`
  - `driveRecipient`
  - `fileStorageContainer list permissions`
