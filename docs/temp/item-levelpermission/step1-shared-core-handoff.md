# Item-Level Permission Step 1 交接说明

本文档总结当前 step 1 实际完成的重构、明确保留的边界，以及后续继续做 item-level 时需要特别注意的事项。

关联文档：

- 计划：[item-level-permission-deployment-plan.md](/Users/vigilante/Documents/code/cn-spe-demo/docs/plannedChange/item-level-permission-deployment-plan.md)
- Step 0 取证结论：[item-level-permission-validation-findings.md](/Users/vigilante/Documents/code/cn-spe-demo/docs/plannedChange/item-level-permission-validation-findings.md)

## 1. 这一步实际做了什么

目标是先把 `container permission` 中真正可复用的共享核心抽出来，但不提前实现 item Graph 写回，也不改变当前 container dialog 的视觉与交互行为。

### 1.1 抽出了共享前端/共同契约基础层

新增：

- [common/contracts/permissionCommonContracts.ts](/Users/vigilante/Documents/code/cn-spe-demo/common/contracts/permissionCommonContracts.ts)
- [src/components/permissions/models/permissionSharedModels.ts](/Users/vigilante/Documents/code/cn-spe-demo/src/components/permissions/models/permissionSharedModels.ts)

当前共享内容包括：

- `PermissionTabValue`
- `PermissionInheritanceSource`
- `IPermissionEntryBaseForUI`
- `IPermissionApiErrorBody`
- 泛型版 `PermissionEntriesByTab`
- 共享 `IPermissionPrincipalCandidate`

其中 `IPermissionEntryBaseForUI` 已经预留了 item-only 只读状态字段：

- `isInherited`
- `isEditable`
- `isRemovable`
- `inheritanceSource?`

这里特意没有把 `inheritedFrom` 直接做成正式前端语义。

### 1.2 让 container 契约继续保留自己的 scope-specific 部分

[common/contracts/containerPermissionCommonContracts.ts](/Users/vigilante/Documents/code/cn-spe-demo/common/contracts/containerPermissionCommonContracts.ts) 现在只保留 container 自己的内容：

- `ContainerPermissionRoleForUI`
- container create/update/remove change contracts
- `IContainerPermissionsResponseFromApi`
- `IContainerPermissionsApiErrorBody`

也就是说：

- 共享 base 已上提
- container role union / request / response 仍然是 container 自己的

这正好对应计划里“共享核心 + scope-specific adapter / contract”的边界。

### 1.3 把共享 draft hook 做成了可复用基础设施

[src/components/permissions/hooks/usePermissionDraft.ts](/Users/vigilante/Documents/code/cn-spe-demo/src/components/permissions/hooks/usePermissionDraft.ts) 已改为基于 `IPermissionEntryBaseForUI` 的泛型实现。

当前意义：

- container 继续复用它，现有行为不变
- item 后续可以直接复用同一套“baseline / draft / replace / reset / hasUnsavedChanges”机制

这一步没有新建 item dialog state hook，但共享草稿底座已经到位。

### 1.4 把前端 API 错误名做了通用化，但保留旧名字兼容

[src/services/containerPermissionApi.ts](/Users/vigilante/Documents/code/cn-spe-demo/src/services/containerPermissionApi.ts) 现在以 `PermissionApiError` 为主，并保留：

- `export { PermissionApiError as ContainerPermissionApiError }`

当前效果：

- 新的共享语义已经建立
- 现有 container 测试语义没有被破坏

### 1.5 把后端 minimal Graph contracts 上提为共享边界

新增：

- [server/permissionsCore/permissionGraphContracts.ts](/Users/vigilante/Documents/code/cn-spe-demo/server/permissionsCore/permissionGraphContracts.ts)

`server/containerPermissions/containerPermissionsInternalContracts.ts` 现在只是兼容层，继续保留旧导出名：

- `IGraphClient`
- `IGraphRequest`
- `IGraphIdentityInPermission`

但真实共享定义已经上提到 `permissionsCore`。

这意味着后续 item backend adapter 可以直接复用同一套最小 Graph 边界，而不需要再重新定义一份相似接口。

### 1.6 为 item future reuse 保留了必要 principal 信息

当前共享层保留的 principal 扩展字段只有这几个：

- `principalObjectId?`
- `principalMail?`
- `principalUserPrincipalName?`

说明：

- `principalObjectId`：为 item invite 优先走 `objectId` 做准备
- `principalMail`：为必要时的 mail fallback 做准备
- `principalUserPrincipalName`：container people create 现有就需要，item user 侧后续也仍然有用

`principalAlias` 已移除，因为它在 step 1 并不是必须共享字段。

### 1.7 container 当前行状态被显式化，但行为不变

在 container adapter 和本地 candidate -> entry 转换里，当前都统一写死为：

- `isInherited: false`
- `isEditable: true`
- `isRemovable: true`

这只是把未来 item 需要的只读语义提前挂到共享 base 上，container 当前 UI 逻辑没有因此变化。

## 2. 这一步明确没有做什么

下面这些事情这一步都没有做：

- 没有新增 item-level HTTP contract
- 没有新增 item-level API client
- 没有新增 item-level backend route / handler / adapter / parser
- 没有实现 item permission 的 list / invite / patch / delete 流程
- 没有实现 inherited / explicit 分类逻辑
- 没有实现 item dialog
- 没有实现 files / containers 编排接线
- 没有改变 current container dialog 的视觉、交互、Combobox 行为

## 3. 当前已经确认可直接复用的共享边界

后续 step 2 / step 3 可以直接复用这些层，不需要再返工 container：

### 3.1 前端共享基础

- `usePermissionDraft`
- `PermissionEntriesByTab`
- `IPermissionPrincipalCandidate`
- `IPermissionEntryBaseForUI`

### 3.2 后端共享基础

- `IPermissionGraphClient`
- `IPermissionGraphRequest`
- `IGraphPermissionIdentity`

### 3.3 共享错误基础

- `PermissionApiError`
- `IPermissionApiErrorBody`

## 4. 后续步骤需要特别注意的点

### 4.1 不要把 container 的“稳定现状”再次打散

step 1 已经完成了“先抽共享核心，再保持 container 不变”的目标。后续做 item 时要继续遵守：

- 不顺手重做 container dialog UI
- 不顺手改 container API shape
- 不顺手把 container diff 逻辑改成 item 风格

后续任何 scope-specific 复杂度，优先落在 item 自己的 contract / adapter / dialog，而不是回头污染 container 现状。

### 4.2 共享 base 已经预留只读状态，但 container 还没消费这些状态

当前 container 行虽然已经带有：

- `isInherited`
- `isEditable`
- `isRemovable`

但 container UI 还没有基于这些字段渲染只读逻辑。这是刻意保持“不改变现有 container 行为”的结果。

后续 item dialog 需要自己消费这些字段，实现：

- inherited 行 role dropdown 禁用
- inherited 行 delete 禁用
- inherited 行只读提示
- inherited 行图标展示

不要为了 item 先去改 container 的显示逻辑。

### 4.3 Step 0 的 inherited 结论必须继续作为正式实现依据

后续实现 item backend adapter 时，要继续遵守 Step 0 已确认的规则：

- 不能把 `inheritedFrom` 当正式判别依据
- 主路径应为“当前 item 与即时父项 effective permission 集合比对”
- 主键优先用 `permissionId`
- 只有在必要时才用规范化后的 identity + role set 做只读分类 fallback
- 如果父项读取失败或无法确定，宁可不判 inherited，也不要误禁用显式权限

### 4.4 共享 principal 信息只保留必要字段，不要再次超前扩字段

这一步已经回收了 `principalAlias`，原因是它还不属于当前必须共享的正式语义。

后续继续做 item 时建议遵守：

- 先证明某字段在实际 request / response / diff / UI 中确实必需
- 再把它升级为共享 contract 字段
- 不要只因为“未来可能会用到”就先塞进正式共享 entry base

### 4.5 item create / update 的正式语义不要沿用 container create contract

当前 container create contract 还是：

- people 走 `userPrincipalName`
- groups 走 `principalId`

这只适用于当前 container Graph shape。

后续 item create 需要单独定义自己的 contract，至少要能表达：

- `objectId`
- `email`
- 未来若被证明确有必要，再讨论 alias

不要把 item invite body 硬塞回 container create change shape。

### 4.6 item backend 需要自己定义 scope-specific adapter，不要复用 container adapter 语义

当前 container adapter 的职责仍然是：

- container permission Graph <-> common contract 映射
- container role mapper
- container create body translator

后续 item backend 必须有自己的 adapter，负责：

- effective permissions -> explicit/inherited rows
- invite request body
- patch 或 delete+recreate 策略
- 非 identity permission 的过滤/提示

共享的应该是边界，不是把 container adapter 直接复制过去。

### 4.7 后续测试建议保持“先 adapter / parser，再 UI 编排”

比较稳的推进顺序仍然应该是：

1. item contracts
2. item backend adapter / parser / error mapper
3. explicit / inherited 分类测试
4. item frontend API client
5. item dialog
6. files / containers 接线

这样可以最大限度避免 UI 已经接上，但后端语义还在摇摆。

## 5. 本步验证结果

本步只验证 container 现有相关测试仍通过，没有提前做 item-level 测试：

```bash
npm test -- --run src/components/permissions/ContainerPermissionDialog.test.tsx src/components/permissions/services/containerPermissionDiff.test.ts server/containerPermissions
```

以及后续删除 `principalAlias` 后的最小回归：

```bash
npm test -- --run src/components/permissions/ContainerPermissionDialog.test.tsx src/components/permissions/services/containerPermissionDiff.test.ts server/containerPermissions/containerPermissionsCommonAdapters.test.ts
```

## 6. 给后续步骤的简短执行建议

如果直接进入 step 2，建议以这条原则为主：

- 共享层已经够用，下一步重点应放在 item 的后端共同契约、effective permission 分类、以及 invite/update/remove 的 scope-specific adapter
- 不要再回头扩大 step 1 的共享范围，除非新字段已经被 item 实际实现证明是必需的
