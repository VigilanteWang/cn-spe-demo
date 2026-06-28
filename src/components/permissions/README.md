# 初识 `permissions` 模块

这篇 README 面向刚接触当前权限模块的同学。

目标不是一次讲完全部实现细节，而是先帮你建立 3 个稳定印象：

1. Microsoft Graph / SharePoint Embedded 里，permission 是怎么建模的
2. 当前仓库为什么会拆成 `Container User Permission`、`Item User Permission`、`Item Link Permission`
3. 一次真实的 user-type 权限编辑，是怎么从前端搜索与草稿状态一路走到后端 Graph 写回的

如果你之后想继续深入 `item link permission` 的细节，请阅读 [introduce-ItemLinkPermissionModule.md](./documents/introduce-ItemLinkPermissionModule.md)。

---

## 1. 先看官方模型：Graph 里的 permission 如何设计的

先记住一个核心点：

> Graph 里的 `permission` 是统一资源类型，而 Microsoft 会用 facet 来表达“这条 permission 具备哪一种权限形态”。

官方参考文档：

- [Microsoft Graph permission resource](https://learn.microsoft.com/en-us/graph/api/resources/permission?view=graph-rest-1.0)
- [driveItem invite](https://learn.microsoft.com/en-us/graph/api/driveitem-invite?view=graph-rest-1.0&tabs=http)
- [driveItem createLink](https://learn.microsoft.com/en-us/graph/api/driveitem-createlink?view=graph-rest-1.0&tabs=http)
- [fileStorageContainer create permission](https://learn.microsoft.com/en-us/graph/api/filestoragecontainer-post-permissions?view=graph-rest-1.0&tabs=http)
- [SharePoint Embedded: accessing content in containers](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/auth#accessing-content-in-containers)
- [SharePoint Embedded: sharing and permissions](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm)

### 1.1 按权限类型分：User permission 和 Link permission

从当前项目最关心的视角看，permission 可以先分成两类。

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

### 1.2 这里的 facet 是什么

facet 原意是“面、切面“，微软用这个词，实际源于分面分类（Faceted Classification），它是一种将事物按照多个独立的特征、属性或维度（即“分面”）进行分类的方法。如服饰网站中，用户可以通过侧边栏的“颜色”、“尺码”、“品牌”和“价格区间”分面来筛选商品。

这里 graph api 中，可以把 facet 理解成：

> 一种用于描述资源某个独立特征或形态的“特征属性组”。

它不只是一个普通字段，而是一组带语义的相关属性：

- 这组属性本身描述某种能力或形态
- 同一个资源可以同时带多个 facet

在 `permission` resource 上，facet 的含义是：

> 用来表示“这条 Permission 属于哪一种 permission kind” 的一组属性。

在 `permission` 资源里，当前最重要的是两种 facet：

- `link`
  它的存在表示这条 permission 是一个 Link Permission，并带有 `type`、`scope` 等属性
- `invitation`
  它的存在表示这条 permission 是通过邀请特定对象创建出来的 Permission

但对当前项目要额外注意一点：

- SharePoint Embedded 当前不使用 `invitation` facet 来作为我们识别 user-type permission 的主要入口
- 在实际读模型和当前代码里，我们更常通过 `grantedToV2.user` / `grantedToV2.group` 判断“这是一条直接授予给 user/group 的 permission”
- `grantedToIdentitiesV2` 则更像是 link permission 下面 recipients 的集合字段，不应和 facet 混为一谈

所以对当前仓库来说，可以先这样记：

- 看到 `link` facet，通常说明这是 link-type permission
- 看到 `grantedToV2.user` / `grantedToV2.group`，通常说明这是当前代码会按 user-type permission 处理的 permission

### 1.3 Graph 是怎么“创建权限”的

虽然官方最后都返回 `permission` 资源，但不同权限类型的创建入口并不一样。

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

把上面的官方模型映射到当前仓库，可以先记住一句话：

> `Container` 只有 user-type permission；`Item` 同时有 user-type permission 和 link-type permission。

所以项目里实际存在 3 大类权限：

1. `Container User Permission`
2. `Item User Permission`
3. `Item Link Permission`

### 2.1 命名规律

当前仓库的命名是比较统一的，通常按这个模式展开：

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

如果只看前端入口，可以这样理解：

- [ContainerPermissionDialog.tsx](./ContainerPermissionDialog.tsx)
  只处理 `Container User Permission`
- [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx)
  同时处理：
  - `Item User Permission`
  - `Item Link Permission`

这也是为什么当前 item dialog 会比 container dialog 更复杂。

它不是单纯“多一个 tab”，而是：

- people/groups 这两页复用 user-type 共用逻辑
- links 页单独维护自己的加载、diff、校验和 apply

---

## 3. 两个真实例子：user-type permission 是怎么跑通的

下面不再从“文件树”视角介绍，而是改成两个真实使用过程。

目标是让你看到：

> 用户在弹窗里点的每一步，最后是怎样变成 Graph 请求的。

### 3.1 例子一：把一个用户加到 container

这个例子对应的是 `Container User Permission`。

#### Step 1：打开 container 权限弹窗

入口在 [ContainerPermissionDialog.tsx](./ContainerPermissionDialog.tsx)。

这个组件负责把 3 类能力拼起来：

- user-type 草稿状态
- 目录搜索状态
- API 加载与 apply 状态

它自己不直接理解 Graph 字段，而是负责 orchestration。

#### Step 2：在搜索框里搜一个用户

搜索交互由 [usePermissionPrincipalSearch.ts](./hooks/usePermissionPrincipalSearch.ts) 管理。

这个 Hook 处理的事情包括：

- people / groups 两个 tab 各自保留 query
- 至少输入 3 个字符才真正搜索
- debounce 1 秒后再发请求
- 把结果映射成统一的 `IPermissionPrincipalSearchCandidate`

它真正调用的目录搜索入口是：

- [directoryPrincipalSearch.ts](./services/directoryPrincipalSearch/directoryPrincipalSearch.ts)

这层会继续负责编排：

- search plan
- 短周期缓存
- Graph 错误映射

#### Step 3：把候选用户变成一条本地草稿 entry

用户从下拉列表选中一个候选人后：

1. [usePermissionPrincipalSearch.ts](./hooks/usePermissionPrincipalSearch.ts) 把候选项交给 dialog
2. [userPermissionEntryUtils.ts](./utils/userPermissionEntryUtils.ts) 先创建 user-type 共用基础字段
3. [ContainerPermissionDialog.tsx](./ContainerPermissionDialog.tsx) 里的 `createContainerPermissionEntryFromCandidate` 再补上 container 默认角色 `Reader`

这样，目录搜索结果就变成了一条真正的 container 权限草稿。

#### Step 4：草稿状态由共用 Hook 管理

这条新草稿会进入：

- [useUserPermissionDialogUIState.ts](./hooks/useUserPermissionDialogUIState.ts)
- [useUserPermissionDraft.ts](./hooks/useUserPermissionDraft.ts)

可以把这两层理解成：

- `useUserPermissionDialogUIState`
  负责把 tab、输入框、候选去重、显示列表这些 UI 语义拼起来
- `useUserPermissionDraft`
  负责维护“原始基线”和“当前草稿”两份列表

这也是为什么用户可以在弹窗里先改很多次，最后再一次性 `Apply`。

#### Step 5：点击 Apply，先算 diff

当用户点击 `Apply` 时：

- [ContainerPermissionDialog.tsx](./ContainerPermissionDialog.tsx) 会调用 [containerUserPermissionDiff.ts](./utils/containerUserPermissionDiff.ts)

这一层会把：

- 原始权限快照
- 当前草稿权限列表

比较成一个 `create / update / remove` 变更集。

如果只是“新增一个用户”，最终通常只会在 `create` 里出现一条记录。

#### Step 6：前端把 change set 发给后端

container user permission 的前端 API 入口是：

- [containerPermissionApi.ts](../../services/containerPermissionApi.ts)

这里会：

- 调用 `/api/containerPermissions/{containerId}/apply`
- 把 change set 原样提交给后端
- 等后端返回最新 entries 后，再映射回 people/groups 分组结构

#### Step 7：后端把 UI change 映射成 Graph create permission

后端编排入口在：

- [containerPermissionsHandlers.ts](../../../server/containerPermissions/containerPermissionsHandlers.ts)

它负责：

- 鉴权
- 读取 `containerId`
- 解析请求体
- 创建 Graph client
- 顺序执行 `remove -> update -> create`
- 最后回读 container permission 列表

真正把前端 `create` 变成 Graph body 的位置在：

- [containerPermissionsCommonAdapters.ts](../../../server/containerPermissions/containerPermissionsCommonAdapters.ts)

这里会把 user / group 变更分别映射成：

- `grantedToV2.user.userPrincipalName`
- `grantedToV2.group.id`

所以 container user permission 的本质就是：

> 前端先保留目录搜索得到的主体线索，后端再把这些线索翻译成 Graph 的 `grantedToV2` 请求体。

#### Step 8：后端回读最新权限，前端刷新基线

写入成功后，后端不会只返回“写入成功”。

它会重新读取 Graph 当前的 container permission 列表，再把结果返回前端。

这样前端就能：

- 用服务端确认后的最新结果替换原始基线
- 同时把草稿也重置成这份新基线

于是弹窗里的列表状态会重新稳定下来。

### 3.2 例子二：把一个组加到文件夹

这个例子对应的是 `Item User Permission`，而且目标是一个文件夹。

这里顺便要注意一个区别：

- container 只有 user-type permission
- item 除了 user-type，还有 link-type

但这次例子只看 user-type。

#### Step 1：从 item dialog 的 `groups` tab 进入

入口仍然在 [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx)。

这个组件一边管理 people/groups 的 user-type 权限，一边管理 links tab。

如果当前用户正在 `groups` tab：

- 搜索与草稿部分走的是 user-type 共用逻辑
- links 的状态不会混进这一条提交链路里

#### Step 2：搜索一个组，并加到草稿里

这里复用的还是同一套 user-type 能力：

- [usePermissionPrincipalSearch.ts](./hooks/usePermissionPrincipalSearch.ts)
- [directoryPrincipalSearch.ts](./services/directoryPrincipalSearch/directoryPrincipalSearch.ts)
- [userPermissionEntryUtils.ts](./utils/userPermissionEntryUtils.ts)
- [useUserPermissionDialogUIState.ts](./hooks/useUserPermissionDialogUIState.ts)

区别只是：

- 当前 tab 是 `groups`
- [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx) 里的 `createItemPermissionEntryFromCandidate` 会给它补上 item user permission 默认角色 `Reader`

#### Step 3：点击 Apply，先计算 item user permission change set

当用户点击 `Apply` 时：

- [ItemPermissionDialog.tsx](./ItemPermissionDialog.tsx) 会先调用 [itemUserPermissionDiff.ts](./utils/itemUserPermissionDiff.ts)

这层会把差异整理成：

- `create`
- `update`
- `remove`

并且额外做 item user permission 特有的校验，例如：

- inherited 行不能更新
- inherited 行不能删除
- 创建或重建权限时，必须还能找到合法 recipient 线索

#### Step 4：前端调 item user permission 后端接口

前端 API 入口在：

- [itemPermissionApi.ts](../../services/itemPermissionApi.ts)

user-type 这条链路会调用：

- `listItemUserPermissions`
- `applyItemUserPermissionChanges`

对应的后端路由是 `itemPermissions`，不是 links 子路由。

#### Step 5：后端用 `invite` 创建组权限，用 PATCH 更新已有显式权限

后端编排入口在：

- [itemPermissionsHandlers.ts](../../../server/itemPermissions/itemPermissionsHandlers.ts)

这里会：

- 读取 `driveId` / `itemId`
- 解析前端发来的 user-type change set
- 对 `create` 走 `invite`
- 对 `update` 走 PATCH 更新已有显式权限角色
- 对 `remove` 走 delete
- 最后重新读取当前 item 的权限列表

真正把新增权限翻译成 `invite` body 的位置在：

- [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts)

这里会构造 Graph 的 `recipients`，并保留：

- `recipientObjectId`
- `recipientEmail`
- `recipientAlias`

这也是为什么 item user permission 的 change set 里要保留 recipient 相关字段。

因为对 item 来说，后端真正写 Graph 时用的是 `invite`，而 `invite` 必须知道 recipient。

#### Step 6：顺带理解“继承权限”为何会是只读

文件夹和文件的 item permission 还有一个 container 没有的复杂点：

> 当前项可能继承父文件夹的权限。

这个逻辑在后端完成，关键位置是：

- [itemPermissionsHandlers.ts](../../../server/itemPermissions/itemPermissionsHandlers.ts)
- [itemPermissionsGraphAdapters.ts](../../../server/itemPermissions/itemPermissionsGraphAdapters.ts)

后端会：

1. 先读取当前 item 的 permission
2. 再尝试读取父 folder 的 permission
3. 用父子两层的 `permissionId` 做对比

如果某条当前项权限的 `permissionId` 也出现在父层里，就会把它视为：

- `isInherited = true`
- `isEditable = false`
- `isRemovable = false`

前端收到这份结果后，就会把继承项显示成只读、不可删。

所以这里不是前端自己“猜”哪条权限是继承的，而是后端先对 Graph 结果做了继承判定。

---

## 4. 阅读这个模块时，建议先抓住什么

如果你是第一次读当前权限模块，建议先按下面顺序理解：

1. 先分清 3 大类权限：
   `Container User Permission`、`Item User Permission`、`Item Link Permission`
2. 再分清两条 user-type 共用主线：
   搜索链路、草稿链路
3. 最后再看 container 和 item 在后端写 Graph 时的区别：
   container 走 create permission，item 走 invite

也可以记成一句话：

> 当前仓库把“user-type 权限的共用交互”尽量抽在一起，把“container / item / link 的 Graph 差异”尽量收在各自边界里。

如果接下来你要继续读 link-type 权限，请直接跳到：

- [introduce-ItemLinkPermissionModule.md](./documents/introduce-ItemLinkPermissionModule.md)
