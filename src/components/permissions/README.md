# 初识 `permissions` 模块

本文面向首次接触当前权限模块的开发者。

重点包括 3 个方面：

1. Microsoft Graph / SharePoint Embedded 里，permission 是怎么建模的
2. 当前仓库为什么会拆成 `Container User Permission`、`Item User Permission`、`Item Link Permission`
3. 一次真实的 user-type 权限编辑，是怎么从前端搜索与草稿状态一路走到后端 Graph 写回的

如需继续阅读 `item link permission` 的细节，请参考 [introduce-ItemLinkPermissionModule.md](./documents/introduce-ItemLinkPermissionModule.md)。

---

## 1. 官方模型：Graph 里的 permission 如何设计

> Graph 里的 `permission` 是统一资源类型，而 Microsoft 会用 facet 来表达“这条 permission 具备哪一种权限形态”。

官方参考文档：

- [Microsoft Graph permission resource](https://learn.microsoft.com/en-us/graph/api/resources/permission?view=graph-rest-1.0)
- [driveItem invite](https://learn.microsoft.com/en-us/graph/api/driveitem-invite?view=graph-rest-1.0&tabs=http)
- [driveItem createLink](https://learn.microsoft.com/en-us/graph/api/driveitem-createlink?view=graph-rest-1.0&tabs=http)
- [fileStorageContainer create permission](https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-post-permissions?view=graph-rest-1.0&tabs=http)
- [SharePoint Embedded: accessing content in containers](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/auth#accessing-content-in-containers)
- [SharePoint Embedded: sharing and permissions](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm)

### 1.1 按权限类型分：User permission 和 Link permission

从当前项目的实现视角看，permission 可分为两类。

#### User permission

这类权限的重点是：

> 把权限直接授予某个 user 或 group。相当于 Direct Access。

对当前仓库来说，最常见的是：

- container permission 把权限直接授予 user / group
- item user permission 也把权限直接授予 user / group

#### Link permission

这类权限的重点是：

> 先创建一条 share link，再决定这条 link 的访问范围、能力，以及它下面的 recipients。

对当前仓库来说，`item link permission` 处理的就是这一类能力。

### 1.2 facet 是什么

facet 原意是“面、切面“，微软用这个词，实际源于分面分类（Faceted Classification），它是一种将事物按照多个独立的特征、属性或维度（即“分面”）进行分类的方法。如服饰网站中，用户可以通过侧边栏的“颜色”、“尺码”、“品牌”和“价格区间”分面来筛选商品。

在 Graph API 中，facet 可以理解为：

> 一种用于描述资源某个独立特征或形态的“特征属性组”。

它不只是一个普通字段，而是一组带语义的相关属性：

- 这组属性本身描述某种能力或形态
- 同一个资源可以同时带多个 facet

在 `permission` resource 上，facet 的含义是：

> 用来表示“这条 Permission 属于哪一种 permission kind” 的一组属性。

在 `permission` 资源中，最重要的是两种 facet：

- `link`
  它的存在表示这条 permission 是一个 Link Permission，并带有 `type`、`scope` 等属性
- `invitation`
  它的存在表示这条 permission 是通过邀请特定对象创建出来的 Permission

对当前项目，还需要注意一点：

- SharePoint Embedded 当前不使用 `invitation` facet 来作为我们识别 user-type permission 的主要入口
- 在实际读模型和当前代码里，我们更常通过 `grantedToV2.user` / `grantedToV2.group` 判断“这是一条直接授予给 user/group 的 permission”
- `grantedToIdentitiesV2` 则更像是 link permission 下面 recipients 的集合字段，不应和 facet 混为一谈

在当前仓库中，可以直接按下面的规则理解：

- 看到 `link` facet，通常说明这是 link-type permission
- 看到 `grantedToV2.user` / `grantedToV2.group`，通常说明这是当前代码会按 user-type permission 处理的 permission

### 1.3 Graph 是怎么“创建权限”的

虽然这些接口最终都返回 `permission` 资源，但不同权限类型的创建入口并不相同。

#### Item User Permission：`invite`

item 上给某个 user 或 group 增加显式权限，通常走 `invite`：

- [driveItem invite](https://learn.microsoft.com/en-us/graph/api/driveitem-invite?view=graph-rest-1.0&tabs=http)

这也是当前仓库里 item user permission 的写入方式。

#### Item Link Permission：`createLink`

item 上创建分享链接，通常走 `createLink`：

- [driveItem createLink](https://learn.microsoft.com/en-us/graph/api/driveitem-createlink?view=graph-rest-1.0&tabs=http)

这也是当前仓库里 item link permission 的创建入口。

#### Container Permission：`POST /storage/fileStorage/containers/{containerId}/permissions`

container 的写法和 item 不同，它不是 `invite`，而是直接创建 container permission：

- [fileStorageContainer create permission](https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-post-permissions?view=graph-rest-1.0&tabs=http)

但模型上它仍然是 user-type permission，因为它授予的仍然是具体主体，而不是 share link。

### 1.4 按授予对象层级分：Container Permission 和 Item Permission

除了“按类型分”，这个项目还必须“按层级分”。

#### Container Permission

它授予的是 container 层的访问能力。

在 SharePoint Embedded 里，这一层决定的是：

> 某个 user / group 能不能访问这个 `fileStorageContainer`。

#### Item Permission

它授予的是某个 drive item 的访问能力。

> 注意：
> 在 SharePoint Embedded 里，item permission 可以理解为一种 additive permission，也就是“附加权限”。
>
> 文件和文件夹始终继承父级权限（包括 container 权限），开发者不能改变这条继承结构；
> 但可以在某个具体文件或文件夹上额外添加权限，用来在继承权限之外扩展某个 user 的访问能力。
>
> 例如，某个 user 在 container 层原本只有 `Reader`，但仍然可以通过 item permission 对某个具体文档额外获得 `Edit`。

在当前项目里，item permission 又继续分成两种：

- item user permission
- item link permission

---

## 2. 当前仓库如何建模这套 permission

映射到当前仓库后，可以归纳为一句话：

> `Container` 只有 user-type permission；`Item` 同时有 user-type permission 和 link-type permission。

所以项目里实际存在 3 大类权限：

1. `Container User Permission`
2. `Item User Permission`
3. `Item Link Permission`

### 2.1 命名规律

当前仓库的命名基本遵循下面的模式：

- `[Container/Item][User/Link]PermissionXXX.[ts/tsx]`

例如：

- [ContainerPermissionDialog.tsx](./ContainerPermissionDialog.tsx)
- [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx)
- [containerUserPermissionModels.ts](./models/containerUserPermissionModels.ts)
- [itemUserPermissionModels.ts](./models/itemUserPermissionModels.ts)
- [itemLinkPermissionModels.ts](./models/itemLinkPermissionModels.ts)
- [containerPermissionsHandlers.ts](../../../server/containerPermissions/containerPermissionsHandlers.ts)
- [itemPermissionsHandlers.ts](../../../server/itemPermissions/itemPermissionsHandlers.ts)
- [itemLinkPermissionHandlers.ts](../../../server/itemPermissions/linkPermission/itemLinkPermissionHandlers.ts)

从结构上看：

- user-type permission 在 container 和 item 之间共享大量前后端代码
- link-type permission 单独建模、单独请求、单独 diff、单独 apply

### 2.2 文件树和职责分组

注： `item link permission` 文件树未列出，请看 [introduce-ItemLinkPermissionModule.md](./documents/introduce-ItemLinkPermissionModule.md)。
测试文件也不在此列。

```text
common/
├─ contracts/
│  ├─ permissionCommonContracts.ts
│  ├─ containerPermissionCommonContracts.ts
│  └─ itemPermissionCommonContracts.ts

src/
├─ services/
│  ├─ containerPermissionApi.ts
│  └─ itemPermissionApi.ts
└─ components/
   └─ permissions/
      ├─ README.md
      ├─ ContainerPermissionDialog.tsx
      ├─ ItemPermissionDialog.tsx
      ├─ models/
      │  ├─ permissionSharedModels.ts
      │  ├─ containerUserPermissionModels.ts
      │  ├─ itemUserPermissionModels.ts
      │  └─ itemLinkPermissionModels.ts
      ├─ hooks/
      │  ├─ useUserPermissionDialogUIState.ts
      │  ├─ useUserPermissionDraft.ts
      │  └─ usePermissionPrincipalSearch.ts
      ├─ utils/
      │  ├─ userPermissionEntryUtils.ts
      │  ├─ containerUserPermissionDiff.ts
      │  └─ itemUserPermissionDiff.ts
      ├─ components/
      │  └─ UserPermissionPanel.tsx
      ├─ services/
      │  └─ directoryPrincipalSearch/
      │     ├─ directoryPrincipalSearch.ts
      │     ├─ directoryPrincipalSearchPlan.ts
      │     ├─ directoryPrincipalSearchQueryBuilder.ts
      │     ├─ directoryPrincipalSearchMapper.ts
      │     ├─ directoryPrincipalSearchCache.ts
      │     └─ directoryPrincipalSearchError.ts
      └─ documents/
         └─ introduce-ItemLinkPermissionModule.md

server/
├─ containerPermissions/
│  ├─ index.ts
│  ├─ containerPermissionsHandlers.ts
│  ├─ containerPermissionsRequestParser.ts
│  ├─ containerPermissionsCommonAdapters.ts
│  ├─ containerPermissionRoleMapper.ts
│  └─ containerPermissionsReaders.ts
├─ itemPermissions/
│  ├─ index.ts
│  ├─ itemPermissionsHandlers.ts
│  ├─ itemPermissionsRequestParser.ts
│  ├─ itemPermissionsGraphAdapters.ts
│  └─ itemPermissionRoleMapper.ts
└─ permissionsCore/
   ├─ permissionIdentityAdapters.ts
   └─ permissionGraphReaders.ts
```

#### 共享 contract / model

- [permissionCommonContracts.ts](../../../common/contracts/permissionCommonContracts.ts)
  定义三类 permission 都会复用的基础 identity 和 entry 字段。
- [containerPermissionCommonContracts.ts](../../../common/contracts/containerPermissionCommonContracts.ts)
  定义 container user permission 的 entry、role 和 `change set` 合同。
- [itemPermissionCommonContracts.ts](../../../common/contracts/itemPermissionCommonContracts.ts)
  同时承载 item user permission 与 item link permission 的共享 HTTP 合同。
- [permissionSharedModels.ts](./models/permissionSharedModels.ts)
  定义前端目录搜索候选项和 people/groups 分组模型。
- [containerUserPermissionModels.ts](./models/containerUserPermissionModels.ts)
  把 container user permission 的共享 contract 映射成前端可消费的分组类型。
- [itemUserPermissionModels.ts](./models/itemUserPermissionModels.ts)
  把 item user permission 的共享 contract 映射成前端可消费的分组类型。

#### 前端 user-type permission 入口

- [ContainerPermissionDialog.tsx](./ContainerPermissionDialog.tsx)
  负责编排 container user permission 的搜索、草稿、加载和 apply。
- [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx)
  作为 item 权限总入口，同时编排 item user permission 和 item link permission。
- [UserPermissionPanel.tsx](./components/UserPermissionPanel.tsx)
  把 people/groups 的搜索框和 access list 表格收进同一个共用面板。
- [useUserPermissionDialogUIState.ts](./hooks/useUserPermissionDialogUIState.ts)
  把 tab、搜索输入、草稿列表和候选去重整合成 user-type 共用状态层。
- [useUserPermissionDraft.ts](./hooks/useUserPermissionDraft.ts)
  负责维护 user-type 权限的原始基线与当前草稿。
- [usePermissionPrincipalSearch.ts](./hooks/usePermissionPrincipalSearch.ts)
  负责目录搜索的输入、debounce、结果状态和候选选择。
- [userPermissionEntryUtils.ts](./utils/userPermissionEntryUtils.ts)
  把目录搜索候选项转换成 user-type 权限草稿的基础 entry。
- [containerUserPermissionDiff.ts](./utils/containerUserPermissionDiff.ts)
  计算 container user permission 的 `create / update / remove` 差异。
- [itemUserPermissionDiff.ts](./utils/itemUserPermissionDiff.ts)
  计算 item user permission 的 `create / update / remove` 差异，并校验 inherited/readonly 约束。

#### `directoryPrincipalSearch` 相关文件

- [directoryPrincipalSearch.ts](./services/directoryPrincipalSearch/directoryPrincipalSearch.ts)
  目录搜索总入口，负责串起 plan、缓存和错误映射。
- [directoryPrincipalSearchPlan.ts](./services/directoryPrincipalSearch/directoryPrincipalSearchPlan.ts)
  根据输入决定这次目录搜索该走哪一种 Graph 查询策略。
- [directoryPrincipalSearchQueryBuilder.ts](./services/directoryPrincipalSearch/directoryPrincipalSearchQueryBuilder.ts)
  负责拼出不同策略对应的 Graph 查询参数。
- [directoryPrincipalSearchMapper.ts](./services/directoryPrincipalSearch/directoryPrincipalSearchMapper.ts)
  把 Graph 返回的目录对象映射成搜索服务内部统一结果。
- [directoryPrincipalSearchCache.ts](./services/directoryPrincipalSearch/directoryPrincipalSearchCache.ts)
  提供短周期内存缓存，减少重复目录查询。
- [directoryPrincipalSearchError.ts](./services/directoryPrincipalSearch/directoryPrincipalSearchError.ts)
  把底层 Graph 错误收口成前端可判断的稳定搜索错误。

#### 前端 API service

- [containerPermissionApi.ts](../../services/containerPermissionApi.ts)
  负责请求 container user permission 列表与 apply 接口。
- [itemPermissionApi.ts](../../services/itemPermissionApi.ts)
  负责请求 item user permission 与 item link permission 的前端 API。

#### 后端 container permission

- [index.ts](../../../server/containerPermissions/index.ts)
  作为 container permission 区域的导出边界。
- [containerPermissionsHandlers.ts](../../../server/containerPermissions/containerPermissionsHandlers.ts)
  负责 container permission 的读取、apply 和回读编排。
- [containerPermissionsRequestParser.ts](../../../server/containerPermissions/containerPermissionsRequestParser.ts)
  把外部请求体收窄成后端接受的 container `change set`。
- [containerPermissionsCommonAdapters.ts](../../../server/containerPermissions/containerPermissionsCommonAdapters.ts)
  负责 container permission 的 Graph 请求体和响应体映射。
- [containerPermissionRoleMapper.ts](../../../server/containerPermissions/containerPermissionRoleMapper.ts)
  负责 container 角色在 UI 和 Graph 之间转换。
- [containerPermissionsReaders.ts](../../../server/containerPermissions/containerPermissionsReaders.ts)
  提供 container 模块自己的 Graph record 读取工具。

#### 后端 item user permission

- [index.ts](../../../server/itemPermissions/index.ts)
  作为 item permissions 区域的导出边界。
- [itemPermissionsHandlers.ts](../../../server/itemPermissions/itemPermissionsHandlers.ts)
  负责 item user permission 的读取、apply、父级权限回读和结果回填。
- [itemPermissionsRequestParser.ts](../../../server/itemPermissions/itemPermissionsRequestParser.ts)
  把外部请求体收窄成后端接受的 item user permission `change set`。
- [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts)
  负责 item user permission 的 Graph `invite` 请求体和读结果映射。
- [itemPermissionRoleMapper.ts](../../../server/itemPermissions/itemPermissionRoleMapper.ts)
  负责 item user permission 角色在 UI 和 Graph 之间转换。

#### 后端共享 identity / Graph reader

- [permissionIdentityAdapters.ts](../../../server/permissionsCore/permissionIdentityAdapters.ts)
  从 `grantedToV2` / `grantedToIdentitiesV2` 提取当前项目真正支持的 user/group identity。
- [permissionGraphReaders.ts](../../../server/permissionsCore/permissionGraphReaders.ts)
  提供后端共享的 Graph record、string 和 array 读取能力。

### 2.4 三大权限在前端入口里的关系

只看前端入口时，关系如下：

- [ContainerPermissionDialog.tsx](./ContainerPermissionDialog.tsx)
  只处理 `Container User Permission`
- [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx)
  同时处理：
  - `Item User Permission`
  - `Item Link Permission`

这也是当前 item dialog 比 container dialog 更复杂的原因。

它不是单纯“多一个 tab”，而是：

- people/groups 这两页复用 user-type 共用逻辑
- links 页单独维护自己的加载、diff、校验和 apply

---

## 3. 用一个真实例子走一遍：把一个组加到文件夹

这个例子对应 `Item User Permission`，目标资源是一个文件夹。

需要区分一点：

- container 只有 user-type permission
- item 除了 user-type，还有 link-type

本例只讨论 user-type permission。

#### Step 1：关键模型与初始基线

这个例子涉及 4 份关键数据：

1. `IItemUserPermissionEntryForUI`
   含义：一条 item user permission 在前端访问列表里的标准行模型。
   位置：[itemPermissionCommonContracts.ts](../../../common/contracts/itemPermissionCommonContracts.ts)

2. `IItemUserPermissionEntriesByTab`
   含义：按 `people/groups` 分桶后的权限列表。
   位置：[itemUserPermissionModels.ts](./models/itemUserPermissionModels.ts)

3. `IPermissionPrincipalSearchCandidate`
   含义：搜索下拉框里的一条候选项，还不是权限行。
   位置：[permissionSharedModels.ts](./models/permissionSharedModels.ts)

4. `IItemUserPermissionChangeSetFromUI`
   含义：点击 `Apply` 后，前端真正提交给后端的 `create / update / remove` 变更集。
   位置：[itemPermissionCommonContracts.ts](../../../common/contracts/itemPermissionCommonContracts.ts)

此外，还要区分两类列表：

- 基线：`originalEntriesByTab`
  含义：最近一次后端确认过的快照，用来做 diff、做 reset。
- 草稿：`draftEntriesByTab`
  含义：当前弹窗里用户正在编辑的临时状态。

这两份状态都由 [useUserPermissionDraft.ts](./hooks/useUserPermissionDraft.ts) 管理。

假设当前文件夹已经有两条从父文件夹继承下来的 group 权限：

- `IT` 是 `Writer`
- `HR` 是 `Reader`

后端返回给前端的 `groups` 基线列表可简化为：

```json
{
  "groups": [
    {
      "id": "permission:perm-it",
      "permissionId": "perm-it",
      "principalId": "group-it",
      "principalObjectId": "group-it",
      "principalDisplayName": "IT",
      "principalType": "groups",
      "description": "IT 管理组",
      "isInherited": true,
      "isEditable": false,
      "isRemovable": false,
      "role": "Writer"
    },
    {
      "id": "permission:perm-hr",
      "permissionId": "perm-hr",
      "principalId": "group-hr",
      "principalObjectId": "group-hr",
      "principalDisplayName": "HR",
      "principalType": "groups",
      "description": "HR 协作组",
      "isInherited": true,
      "isEditable": false,
      "isRemovable": false,
      "role": "Reader"
    }
  ]
}
```

这份 JSON 对应：

```ts
const originalEntriesByTab: IItemUserPermissionEntriesByTab = {
  people: [],
  groups: [...]
};
```

弹窗刚打开时，草稿与基线一致：

```ts
const draftEntriesByTab: IItemUserPermissionEntriesByTab = {
  people: [],
  groups: [...]
};
```

#### Step 2：输入 `finance` 时，搜索模块如何工作

入口在 [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx)，搜索体验主要由以下模块负责：

- [usePermissionPrincipalSearch.ts](./hooks/usePermissionPrincipalSearch.ts)
- [directoryPrincipalSearch.ts](./services/directoryPrincipalSearch/directoryPrincipalSearch.ts)

这一层的两个核心模型是：

1. `IPermissionPrincipalSearchCandidate`
   含义：供前端搜索下拉框中选择的候选对象。

2. `IDirectoryPrincipalSearchResult`
   含义：`directoryPrincipalSearch` 服务内部统一的目录搜索结果模型。

位置：[directoryPrincipalSearchTypes.ts](./services/directoryPrincipalSearch/directoryPrincipalSearchTypes.ts)

二者关系如下：

```text
Graph 原始返回 JSON
  -> IDirectoryPrincipalSearchResult
  -> IPermissionPrincipalSearchCandidate
```

##### 2.1 搜索状态如何推进

搜索交互的基础规则如下：

1. 至少输入 3 个字符才真正搜索
2. 满足最小长度后，等待 `1s debounce`，避免每输入一个字就调用一次 Graph
3. 如果用户继续输入，就取消上一次等待中的请求；如果旧请求晚返回，会被 `requestSequence` 丢弃，避免结果倒灌

当用户在 `groups` tab 输入 `finance` 时，状态流转大致如下：

```text
idle
  -> waitingForMoreInput
  -> debouncing
  -> loading
  -> success / empty / error
```

触发真实搜索时，Hook 会调用：

```ts
searchDirectoryPrincipals({
  graphClient,
  tenantId,
  accountId,
  principalKind: selectedTab,
  query: trimmedQuery,
});
```

##### 2.2 搜索策略如何决定 Graph API

`directoryPrincipalSearch` 不会对所有输入都走同一种搜索接口。

核心思路如下：

1. 判断输入类型
2. 选择对应的 Graph API
3. 优先使用精确查询，必要时再回退到模糊搜索

它不是“所有输入都直接走 search”。

比如：

1. 如果用户直接粘贴一个 GUID
   对象 id 这类值会优先直接查 `/users/{id}` 或 `/groups/{id}`，而不是模糊搜索

2. 如果用户输入的是完整 UPN 或 email。例如 `adele@contoso.com` 会优先按 `userPrincipalName` 直查，必要时再回退到按 `mail` 精确过滤；groups 则直接按 `mail eq '...'` 精确查

3. 如果用户输入的是 `finance`、`sales-team` 这类更像标识符前缀的内容，则按 `mail`、`mailNickname`、`userPrincipalName` 等字段做 `startswith(...)`

4. 如果前面几类都不命中，再退回到对 `displayName` 或 `description` 使用 `$search` 进行模糊搜索

这一层的关键模型是：

- `IDirectorySearchPlan`
  含义：根据输入内容，判断该调用哪个 Graph API

##### 2.3 搜索结果如何映射到 dialog 候选项

在这个例子里，搜索返回的一条结果可简化成 `IDirectoryPrincipalSearchResult`：

```json
{
  "id": "group-finance-reviewers",
  "displayName": "Finance Reviewers",
  "secondaryText": "finance-reviewers",
  "principalType": "group",
  "mail": "finance-reviewers@contoso.com",
  "mailNickname": "finance-reviewers"
}
```

然后映射成 dialog 直接消费的候选项 `IPermissionPrincipalSearchCandidate`：

```json
{
  "id": "group-finance-reviewers",
  "type": "groups",
  "name": "Finance Reviewers",
  "secondaryText": "finance-reviewers",
  "objectId": "group-finance-reviewers",
  "mail": "finance-reviewers@contoso.com"
}
```

#### Step 3：候选项如何变成草稿权限行

这一步涉及两个模型：

- `IPermissionPrincipalSearchCandidate`
  含义：还只是搜索候选项
- `IItemUserPermissionEntryForUI`
  含义：已经是权限表格里的一行

这一转换主要由以下模块配合完成：

- [usePermissionPrincipalSearch.ts](./hooks/usePermissionPrincipalSearch.ts)
- [useUserPermissionDialogUIState.ts](./hooks/useUserPermissionDialogUIState.ts)
- [userPermissionEntryUtils.ts](./utils/userPermissionEntryUtils.ts)
- [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx)

关键代码是：

```ts
const createItemPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalSearchCandidate,
): IItemUserPermissionEntry => ({
  ...createBaseUserPermissionEntryFromCandidate(candidate),
  role: "Reader",
});
```

前端不会把搜索候选项原样写入权限表，而是会：

1. 先保留稳定身份线索，如 `objectId`、`mail`
2. 再补成 item user permission 默认角色 `Reader`
3. 最后放进 `draftEntriesByTab.groups`

处理后，候选项会变成：

```json
{
  "id": "group-finance-reviewers",
  "principalId": "group-finance-reviewers",
  "principalObjectId": "group-finance-reviewers",
  "principalDisplayName": "Finance Reviewers",
  "principalType": "groups",
  "principalMail": "finance-reviewers@contoso.com",
  "description": "finance-reviewers",
  "isInherited": false,
  "isEditable": true,
  "isRemovable": true,
  "role": "Reader"
}
```

此时草稿变成：

```json
{
  "groups": [
    {
      "id": "permission:perm-it",
      "permissionId": "perm-it",
      "principalId": "group-it",
      "principalObjectId": "group-it",
      "principalDisplayName": "IT",
      "principalType": "groups",
      "description": "IT 管理组",
      "isInherited": true,
      "isEditable": false,
      "isRemovable": false,
      "role": "Writer"
    },
    {
      "id": "permission:perm-hr",
      "permissionId": "perm-hr",
      "principalId": "group-hr",
      "principalObjectId": "group-hr",
      "principalDisplayName": "HR",
      "principalType": "groups",
      "description": "HR 协作组",
      "isInherited": true,
      "isEditable": false,
      "isRemovable": false,
      "role": "Reader"
    },
    {
      "id": "group-finance-reviewers",
      "principalId": "group-finance-reviewers",
      "principalObjectId": "group-finance-reviewers",
      "principalDisplayName": "Finance Reviewers",
      "principalType": "groups",
      "principalMail": "finance-reviewers@contoso.com",
      "description": "finance-reviewers",
      "isInherited": false,
      "isEditable": true,
      "isRemovable": true,
      "role": "Reader"
    }
  ]
}
```

此时有三个要点：

- 基线 `originalEntriesByTab` 还没变
- 只有草稿 `draftEntriesByTab` 变了
- 所以 UI 已经能显示新增行，但后端还完全没收到请求

#### Step 4：点击 `Apply` 后，草稿如何变成 change set

这一层的关键模型是：

- `IItemUserPermissionEntriesByTab` 前端保存的基线和草稿

- `IItemUserPermissionChangeSetFromUI` 前端提交给后端的最终变更集

```ts
userPermissionChanges = computeItemPermissionChanges(
  userPermissionOriginalEntriesByTab,
  userPermissionDraftEntriesByTab,
);
```

实现位置在 [itemUserPermissionDiff.ts](./utils/itemUserPermissionDiff.ts)。

其职责是：

> 用“原始基线”和“当前草稿”做对比，只保留 `create / update / remove` 三类变化。

这个例子只包含新增一条组权限，因此得到的 change set 为：

```json
{
  "create": [
    {
      "principalType": "groups",
      "principalId": "group-finance-reviewers",
      "recipientObjectId": "group-finance-reviewers",
      "recipientEmail": "finance-reviewers@contoso.com",
      "role": "Reader"
    }
  ],
  "update": [],
  "remove": []
}
```

草稿中的 3条 记录不会整张表原样提交给后端。

后端真正收到的只是 **相对基线的变化**：

- `IT` 和 `HR` 本来就存在，所以不需要写进 change set
- `Finance Reviewers` 是新增行所以写进 `create`

#### Step 5：后端如何把 change set 转成 Graph `invite`

这一层的关键模型是：

- `IItemUserPermissionChangeSetFromUI`
  含义：前端传来的变更集
- Graph `invite` body
  含义：后端真正发给 Microsoft Graph 的请求体

前端 API 入口在 [itemPermissionApi.ts](../../services/itemPermissionApi.ts)，对应后端入口是：

- [itemPermissionsHandlers.ts](../../../server/itemPermissions/itemPermissionsHandlers.ts)
- [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts)

后端在拿到 change set 后，处理 `create` 时，关键代码是：

```ts
for (const createChange of changeSet.create) {
  const inviteBody = newGraphInvitePermissionBody(createChange);

  await graphClient
    .api(getItemInviteGraphPath(driveId, itemId))
    .version("v1.0")
    .post(inviteBody);
}
```

`newGraphInvitePermissionBody(createChange)` 会把它转换成：

```json
{
  "recipients": [
    {
      "objectId": "group-finance-reviewers"
    }
  ],
  "requireSignIn": true,
  "sendInvitation": false,
  "roles": ["read"]
}
```

这一层有两个关键点：

- 前端的 `role: "Reader"`，会被后端映射成 Graph 的 `roles: ["read"]`
- `recipientObjectId` 比 `recipientEmail` 更稳定，所以会优先落到 Graph 的 `objectId`

#### Step 6：写入成功后，基线如何刷新，继承为何只读

这一阶段的关键模型回到：

- `IItemUserPermissionEntryForUI`
- `IItemUserPermissionEntriesByTab`

因为写入成功后，后端不会只回一句“成功”，而是会重新读取当前 item 的最新权限列表，再映射回前端统一模型。

因此前端最终收到的 `groups` 数据，会从原来的两条继承权限变成：

```json
{
  "groups": [
    {
      "id": "permission:perm-it",
      "permissionId": "perm-it",
      "principalId": "group-it",
      "principalObjectId": "group-it",
      "principalDisplayName": "IT",
      "principalType": "groups",
      "description": "IT 管理组",
      "isInherited": true,
      "isEditable": false,
      "isRemovable": false,
      "role": "Writer"
    },
    {
      "id": "permission:perm-hr",
      "permissionId": "perm-hr",
      "principalId": "group-hr",
      "principalObjectId": "group-hr",
      "principalDisplayName": "HR",
      "principalType": "groups",
      "description": "HR 协作组",
      "isInherited": true,
      "isEditable": false,
      "isRemovable": false,
      "role": "Reader"
    },
    {
      "id": "permission:perm-finance-reviewers",
      "permissionId": "perm-finance-reviewers",
      "principalId": "group-finance-reviewers",
      "principalObjectId": "group-finance-reviewers",
      "principalDisplayName": "Finance Reviewers",
      "principalType": "groups",
      "description": "finance-reviewers@contoso.com",
      "isInherited": false,
      "isEditable": true,
      "isRemovable": true,
      "role": "Reader"
    }
  ]
}
```

随后前端会调用 `replaceEntries`，同时刷新两份本地状态：

```text
新的后端返回
  -> originalEntriesByTab
  -> draftEntriesByTab
```

结果如下：

- 新增组现在已经有了后端确认过的 `permissionId`
- 它不再是本地草稿，而是新的 persisted entry
- 本地“未保存更改”状态会被清空

---

## 4. 关于 inherited permission

> 关键前提：当我们调用 list permissions API 时，子项目拿到的 permission 列表里，通常会同时包含“从上层文件夹继承下来的权限”和“这个 item 自己持有的权限”，所以这里看到的是混合结果，不是只返回 item 自带权限。

#### 1. 代码如何判定“这条权限是继承来的”

这个判断由后端完成，不是前端推断。

当前实现主线在：

- [itemPermissionsHandlers.ts](../../../server/itemPermissions/itemPermissionsHandlers.ts)
- [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts)

后端流程是：

1. 先读取当前 item 的 permission 列表
2. 再读取父 folder 的 permission 列表
3. 把父层里出现过的 `permissionId` 收集成一个集合
4. 如果当前项某条 permission 的 `permissionId` 也出现在父层集合里，就把它视为 inherited

而不是单纯依赖某个 `inheritedFrom` 字段，这个字段至少在 SharePoint Embedded 里会出现在继承权限entry中，但为空值，有时还不会出现。

关键代码可以直接看这里：

- [itemPermissionsHandlers.ts](../../../server/itemPermissions/itemPermissionsHandlers.ts:114)
  先读取当前项权限，再读取可比较父项，再把两份数据一起交给 adapter
- [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts:57)
  先收集父项 `permissionId`
- [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts:65)
  用 `parentPermissionIds.has(candidate.permissionId)` 判断 `isInherited`

#### 2. 识别成 inherited 之后，前端会得到什么限制

一旦后端认定某条权限是继承权限，就会直接把这些字段写回前端模型：

- `isInherited = true`
- `isEditable = false`
- `isRemovable = false`

对应代码在 [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts:72)。

所以前端拿到这份 `IItemUserPermissionEntryForUI` 后，不需要自己再猜一遍，只需要照着渲染：

1. 显示 inherited 图标
2. 禁用角色编辑
3. 禁用删除操作

#### 3. 很重要：不是所有用户都能看全 inherited permission

这一点很容易忽略。

当前代码在 [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx:121) 附近专门有提示逻辑，明确提醒：

> 当用户对文件只有 `read access` 时，Microsoft Graph 可能不会把 item-level permissions 全部返回出来。

对应的代码注释和提示文案都在强调同一件事：

1. 如果当前列表是空的，不一定代表“这个 item 真的没有权限”
2. 也可能只是因为当前用户权限太低，Graph 没把这些 item-level / inherited permissions 都返回出来

这也是为什么 inherited 相关问题不能只看前端表格，还要结合当前调用者本身对这个 item 的权限级别一起理解。

---

## 5. 阅读建议

首次阅读当前权限模块时，建议按下面的顺序理解：

1. 区分 3 大类权限：
   `Container User Permission`、`Item User Permission`、`Item Link Permission`
2. 区分两条 user-type 共用主线：
   搜索链路、草稿链路
3. 再看 container 和 item 在后端写 Graph 时的区别：
   container 走 create permission，item 走 invite

如需继续阅读 link-type permission，请直接跳到：

- [introduce-ItemLinkPermissionModule.md](./documents/introduce-ItemLinkPermissionModule.md)
