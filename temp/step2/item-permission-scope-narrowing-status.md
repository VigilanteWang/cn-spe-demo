# Step 2 当前需求与状态说明

## 1. 这次需求调整了什么

这次不是继续扩大 `item permission` 的兼容范围，而是反过来把实现边界收窄，目标是只保留当前项目已经验证过、并且业务上真正需要的最小集合。

当前确认后的需求如下：

1. `item permission` 的 inherited 判定只信任 `permissionId`
   - 不再保留 `principal identity + facet kind + sorted roles` 的只读 fallback。
   - 如果未来真的遇到 `permissionId` 不够用的真实 payload，再根据实测样本重新设计，不提前为“理论风险”保留复杂度。

2. 共享 identity 解析只正式支持 AAD `user` / `group`
   - 不再把 `siteUser` / `siteGroup` 视为当前项目的正式可管理主体。
   - 这里的原则是：当前项目权限编辑只以 AAD 身份为准，不以 SharePoint site identity 为准。

3. 只暴露 `siteUser` / `siteGroup` 的 permission 统一视为未纳管权限
   - 不进入可编辑 entry。
   - 不额外为它们展开一套只读模型。
   - 后续如果 UI 需要提示“存在未纳管权限”，可以沿用已有思路补一个最小提示位，但本次不扩展新的管理模型。

4. 继续兼容 Graph 返回里的多路径 identity 形状
   - 仍然同时读取 `grantedToV2` 与 `grantedTo`。
   - 但只接受其中的 AAD `user` / `group` 分支。
   - `siteUser` / `siteGroup` 只作为“已观察到的返回现象”存在，不再作为正式纳管对象。

## 2. 为什么会这样调整

这次调整不是拍脑袋简化，而是基于当前项目自己的验证结论：

1. 当前验证没有发现 `permissionId` 缺失
   - 已有验证文档记录了多次 `invite`、`GET permission`、`list permissions` 的样本。
   - 从当前租户实测看，`permissionId` 是稳定存在的，而且同一条权限在后续读取里保持稳定。

2. 当前验证确实看到了 `siteUser`
   - 尤其是在用户授权创建成功后，后续 `GET permission` / `list permissions` 里可能补出 `grantedToV2.siteUser`。
   - 但这不代表项目必须把 `siteUser` 也纳入正式管理模型。

3. 当前项目的管理目标更偏向 AAD 身份
   - 我们真正要编辑、删除、展示的主体，仍然是 AAD `user` / `group`。
   - `siteUser` / `siteGroup` 更像 Graph 为 SharePoint 兼容暴露出来的附加视角，不是当前业务要围绕其建模的核心对象。

4. 当前实现应优先减少冗余和不必要复杂度
   - 既然 `permissionId` 已经足够支撑 inherited 判定，就不继续保留额外 fallback 逻辑。
   - 既然项目不打算围绕 SharePoint site identity 做管理能力，就不继续把 `siteUser` / `siteGroup` 当成一等公民。

## 3. 当前代码已经做到的状态

截至当前，核心代码已经收窄到新的需求边界。

### 3.1 inherited 判定

已完成：

- `server/itemPermissions/itemPermissionsCommonAdapters.ts`
  - 删除了 `facetKind`
  - 删除了 `fallbackFingerprint`
  - 删除了 `countByFingerprint()`
  - 删除了 `createPermissionFingerprint()`
  - 删除了基于 fingerprint 的 inherited fallback
- 现在 `mapGraphItemPermissionsToResponse()` 只做一件事：
  - 先把当前项与父项都映射成可管理 candidate
  - 再只用父项 `permissionId` 集合判断当前行是否 inherited

当前行为：

- 父项里存在相同 `permissionId` -> 当前行标记为 inherited
- 父项读不到、没有父项、或某条权限无法映射成可管理 identity -> 保守地不自动判 inherited

### 3.2 identity 解析

已完成：

- `server/permissionsCore/permissionIdentityAdapters.ts`
  - `IResolvedGraphPermissionIdentity` 不再返回 `facetKind`
  - `resolveGraphPermissionIdentity()` 只尝试四个入口：
    - `grantedToV2.group`
    - `grantedTo.group`
    - `grantedToV2.user`
    - `grantedTo.user`
  - 不再读取：
    - `grantedToV2.siteUser`
    - `grantedTo.siteUser`
    - `grantedToV2.siteGroup`
    - `grantedTo.siteGroup`

当前行为：

- AAD `user` / `group` 能被正常解析
- 只有 `siteUser` / `siteGroup` 时，会返回 `null`
- 同时存在 AAD identity 和 site identity 时，只采用 AAD identity

### 3.3 container 侧连带影响

因为 `containerPermissions` 也依赖同一个共享解析器，所以现在它也同步收窄成：

- 只接受 AAD `user` / `group`
- site-only permission 会被视为 unsupported identity

这符合这次需求的默认前提：项目层面统一只认 AAD 身份，不再把 `siteUser` / `siteGroup` 作为正式纳管对象。

## 4. 当前测试与验证状态

已经补上的测试：

1. `server/permissionsCore/permissionIdentityAdapters.test.ts`
   - AAD `user` / `group` 仍能解析
   - `siteUser` / `siteGroup` 单独出现时返回 `null`
   - 同时存在 AAD identity 与 site identity 时，只取 AAD identity

2. `server/itemPermissions/itemPermissionsCommonAdapters.test.ts`
   - 父子同 `permissionId` 时会判 inherited
   - 仅 principal 相同但 `permissionId` 不同，不再 inherited
   - site-only permission 会被跳过

3. `server/containerPermissions/containerPermissionsCommonAdapters.test.ts`
   - 删除了过去把 `siteUser` / `siteGroup` 当成可映射 identity 的用例
   - 新增了“site-only identity 会抛 unsupported”这一预期

本轮运行结果：

- `npm test -- --run server/itemPermissions/itemPermissionsCommonAdapters.test.ts server/containerPermissions/containerPermissionsCommonAdapters.test.ts server/permissionsCore/permissionIdentityAdapters.test.ts`
  - 通过
- `npm test -- --run server`
  - 通过
- `npx tsc --noEmit`
  - 未通过，但当前报错落在 `src/components/files/index.tsx`
  - 现有报错是两个隐式 `any` 参数，和本次权限收窄改动无关

## 5. 文档同步状态

已经同步更新：

- `docs/plannedChange/item-level-permission-deployment-plan.md`
  - inherited 判定改为“正式实现只依赖 `permissionId`”
  - 不再写 `principal identity + facet kind + sorted roles` fallback
  - 不再写 `user/group/siteUser/siteGroup` 都纳入模型，改成只纳入 AAD `user/group`

- `docs/plannedChange/item-level-permission-validation-findings.md`
  - 保留“实测会看到 `siteUser`”这件事实
  - 但结论改成“项目实现可以只采纳 AAD `user`”

## 6. 当前剩余注意点

1. 现在工作区里本来就有不少和 `item permission` 相关的未提交改动
   - 包括 `server/index.ts`、`server/itemPermissions/`、`src/services/itemPermissionApi.ts` 等
   - 本文档只说明这次“收窄 inherited 与 identity 边界”的变化，不代表整个 `item permission` 功能已经全部完工

2. 这次没有新增新的 UI 提示模型
   - 也就是说，site-only permission 现在的策略是“不纳入可编辑 entry”
   - 如果后面产品需要明确提示“存在未纳管权限”，需要在接口或 UI 层单独补一个最小提示机制

3. 这次没有处理 `npx tsc --noEmit` 的既有前端报错
   - 那两个 `implicit any` 报错在 `src/components/files/index.tsx`
   - 是否顺手修复，要看后续是否希望把这轮改动一起扩展到全仓类型清理

## 7. 一句话总结

当前 Step 2 的需求已经从“尽量兼容更多 Graph identity 形状”收窄成：

- inherited 只看 `permissionId`
- identity 只认 AAD `user/group`
- `siteUser/siteGroup` 只当作已观察到的 Graph 兼容现象，不再作为正式管理对象

并且这套收窄后的实现、测试、以及两份规划/验证文档，已经同步到当前代码状态。
