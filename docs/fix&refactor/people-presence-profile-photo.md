# People Presence 和 Profile Photo 接入说明

> 适合读者：刚接触 Microsoft Graph、React 和 Fluent UI，希望理解“文件列表里为什么能显示修改者头像和在线状态”的初级开发者。

---

## 1. 这篇文档要解决什么问题

在这个项目里，文件列表不仅显示“最后修改者是谁”，还会额外显示：

- 这个人的头像
- 这个人的 Teams 在线状态

这两个信息都不是 `DriveItem` 自带的完整展示数据。

`DriveItem.lastModifiedBy.user` 只能告诉我们：

- 用户 ID
- 用户显示名

如果我们想继续显示“头像”和“在线状态”，就必须再调用别的 Microsoft Graph API。

所以，当前实现实际上做了两层工作：

1. 先加载文件列表本身。
2. 再基于文件列表里的用户 ID，异步补齐人员增强信息。

这也是本次两次提交里最重要的变化：文件列表从“只显示名字”变成了“名字 + 头像 + Presence”。

---

## 2. 先理解两个核心概念

### 2.1 什么是 Presence

Presence 可以理解为“用户当前可用状态”。

在 Teams 和 Microsoft 365 生态里，常见状态包括：

- Available
- Away
- Busy
- In a call
- In a meeting
- Do not disturb
- Presenting
- Offline
- Out of office

这些状态并不只是“手动设置”的结果，它们还会受到以下因素影响：

- 用户是否活跃
- 用户是否在会议中
- 用户是否在通话中
- Outlook 日历是否设置了 Out of office
- Teams 客户端当前在哪台设备上活跃

也就是说，Presence 不是一个静态字段，而是 Microsoft 365 聚合出来的实时状态。

### 2.2 什么是 Profile Photo

Profile Photo 就是用户的头像。

在 Microsoft Graph 里，头像通常不是直接跟用户对象一起返回的，而是通过专门的图片接口单独获取。原因很简单：

- 头像是二进制图片数据，不适合总是跟用户基础信息一起返回
- 不同页面可能需要不同尺寸的头像
- 某些用户可能根本没有上传头像

所以，头像查询一般是“按需发起”的。

---

## 3. 这个项目里用到了哪些 Graph 能力

### 3.1 文件列表来源

文件列表本身来自 SharePoint Embedded 的 drive items 接口。当前逻辑位于：

- `src/components/files/hooks/useFilesData.tsx`

核心请求是：

```ts
GET / drives / { containerId } / items / { itemId } / children;
```

这个请求返回当前目录下的文件和文件夹信息，其中包含：

- 文件名
- 是否是文件夹
- 最后修改时间
- 最后修改者基本信息

这里的“最后修改者基本信息”足够拿到 `displayName` 和 `id`，但还不够做 richer UI。

### 3.2 Presence 来源

项目当前没有逐个调用单人 Presence 接口，而是直接使用批量接口：

```http
POST /communications/getPresencesByUserId
Content-Type: application/json

{
  "ids": ["user-id-1", "user-id-2"]
}
```

这样做的原因很现实：文件列表可能同时出现很多不同的修改者，如果每一行都单独发一个请求，会有两个问题：

- 网络往返次数太多
- 表格滚动和切目录时更容易出现性能抖动

批量接口一次最多支持 650 个用户 ID，更适合表格类页面。

当前批量查询逻辑位于：

- `src/components/files/services/peopleEnrichment.ts`

对应函数：

- `fetchUserPresenceMap`

### 3.3 Profile Photo 来源

项目当前为每个用户请求固定尺寸头像：

```http
GET /users/{id}/photos/48x48/$value
```

这里选 `48x48` 有两个好处：

- 和文件列表中的小头像尺寸比较匹配
- 比取最大尺寸更节省带宽

当前头像查询逻辑也位于：

- `src/components/files/services/peopleEnrichment.ts`

对应函数：

- `fetchUserPhotoUrlMap`

---

## 4. 权限是怎么配的

前端在应用启动时，通过 `Msal2Provider` 统一申请所需权限。入口位于：

- `src/index.tsx`

当前与本功能直接相关的权限有：

- `FileStorageContainer.Selected`
- `Presence.Read.All`
- `ProfilePhoto.Read.All`

权限常量定义位于：

- `src/common/scopes.ts`

### 4.1 为什么要 `Presence.Read.All`

因为这里展示的是“当前登录用户之外的其他人”的在线状态，例如文件最后修改者。

官方文档中：

- `GET /me/presence` 可以读取自己
- 读取其他用户，通常需要 `Presence.Read.All`
- 批量接口 `POST /communications/getPresencesByUserId` 也要求 `Presence.Read.All`

### 4.2 为什么要 `ProfilePhoto.Read.All`

因为这里要读取组织内其他用户的头像，而不是只读当前登录人的头像。

### 4.3 一个很容易踩坑的点：scope 写法会影响 token 缓存命中

第二个提交里修掉了一个很重要的问题：`FileStorageContainer.Selected` 之前使用了完整资源前缀格式，后来改成了相对 scope 名称。

也就是说，当前代码使用的是：

```ts
Scopes.SPEMBEDDED_FILESTORAGECONTAINER_SELECTED;
```

而不是：

```ts
https://graph.microsoft.com/FileStorageContainer.Selected
```

原因是 MSAL 做缓存匹配时，scope 格式不一致可能导致缓存 key 对不上，结果就是：

- `acquireTokenSilent` 明明应该命中缓存
- 但实际报 `NO_CACHED_ACCESS_TOKEN`
- 于是每次都额外走 refresh token 流程

这和 Presence / Photo 没有直接业务关系，但和“页面每次加载都要发多个 Graph 请求”高度相关，所以必须理解。

---

## 5. Presence 对象里最重要的几个字段

根据 Microsoft Graph 的 presence 资源定义，一个 presence 对象里当前实现最关心的是：

- `id`
- `availability`
- `activity`
- `outOfOfficeSettings.isOutOfOffice`

可以把它们粗略理解成：

### 5.1 `availability`

“基础状态”或者“主状态”。

例如：

- `Available`
- `Busy`
- `Away`
- `DoNotDisturb`
- `Offline`

### 5.2 `activity`

对基础状态的补充说明。

例如：

- `Available`
- `InACall`
- `InAMeeting`
- `Presenting`
- `BeRightBack`
- `OutOfOffice`

### 5.3 `outOfOfficeSettings.isOutOfOffice`

这是一个单独的 OOF 信号。

它非常重要，因为在 Fluent UI 里，“out of office”不一定应该被当成一个完全独立的基础状态来处理，很多时候它更像是在基础状态之上的叠加效果。

比如一个用户可能同时满足：

- Busy
- Out of Office

如果只保留一个字符串状态，就容易丢信息。

---

## 6. 为什么当前实现没有把 Presence 直接原样塞给 UI

因为 Graph 的 Presence 字段和 Fluent UI 的 `PresenceBadge` API 并不是一一对应的。

项目里专门定义了一个前端视图模型：

- `IUserPresenceBadgeState`

定义位置：

- `src/common/types.ts`

结构如下：

```ts
interface IUserPresenceBadgeState {
  status: UserPresenceStatus;
  outOfOffice: boolean;
}
```

这么做的原因是：

1. React 组件不需要理解 Graph 的所有原始字符串。
2. UI 层只关心“显示成什么 badge”。
3. OOF 在 Fluent UI 中是一个单独布尔值，而不是只能依赖 `status="out-of-office"`。

当前映射逻辑位于：

- `src/components/files/services/peopleEnrichment.ts`

对应函数：

- `mapGraphPresenceToBadgeState`

---

## 7. 当前项目里的 Presence 映射规则

这部分很值得初级开发者仔细看，因为这里体现了“后端数据”和“前端 UI 模型”之间通常不会完全等价。

当前逻辑先做了一步归一化：

- 忽略大小写
- 去掉连字符、下划线等非字母字符

这样可以兼容类似这些写法：

- `DoNotDisturb`
- `do-not-disturb`
- `do_not_disturb`

然后再映射成 Fluent UI 能识别的 badge 状态。

常见映射关系如下：

| Graph 返回                    | UI 显示                             |
| ----------------------------- | ----------------------------------- |
| `Available` / `Available`     | `status: "available"`               |
| `Busy` / `InACall`            | `status: "busy"`                    |
| `Busy` / `InAMeeting`         | `status: "busy"`                    |
| `DoNotDisturb` / `Presenting` | `status: "do-not-disturb"`          |
| `Away` / `BeRightBack`        | `status: "away"`                    |
| `Offline` / `OffWork`         | `status: "offline"`                 |
| `Busy` + OOF                  | `status: "busy", outOfOffice: true` |

这正是第二个提交修复的重点之一：不要把 OOF 简单粗暴地塞成单一字符串状态，而是拆成：

- 基础状态 `status`
- 叠加标志 `outOfOffice`

这样 UI 才能正确表现“忙碌但同时外出”的场景。

真正执行这一步映射的代码在：

- `src/components/files/services/peopleEnrichment.ts`

对应函数是：

- `mapGraphPresenceToBadgeState`

它先把 Graph 返回的 `availability`、`activity` 和 `outOfOfficeSettings` 统一整理成前端可直接消费的 `IUserPresenceBadgeState`，然后再由 `fetchUserPresenceMap` 把这个结果回填到每一行文件数据里。

---

## 8. React 侧是怎么把这些数据串起来的

### 8.1 第一步：先拿文件列表

`useFilesData` 是这个功能的数据中枢，位置在：

- `src/components/files/hooks/useFilesData.tsx`

它先调用文件列表接口，然后把 Graph 原始 `DriveItem` 转成前端更好用的 `IDriveItemExtended`。

这里会补出几个 UI 专用字段：

- `isFolder`
- `modifiedByName`
- `modifiedById`
- `iconElement`
- `downloadUrl`

注意：此时 presence 和 photo 还没有回来。

### 8.2 第二步：立即把核心列表渲染出来

当前实现故意没有等头像和 presence 查完再显示表格，而是先：

- `setDriveItems(items)`
- `setCurrentFolderId(itemId)`

这样做的好处是首屏更快，目录切换更顺。

对于用户来说，最重要的是先看到文件列表，而不是先等所有人物增强信息都准备完毕。

### 8.3 第三步：后台异步富化人员信息

文件列表先显示出来后，`useFilesData` 会并行启动两个异步流程：

1. `fetchUserPhotoUrlMap`
2. `fetchUserPresenceMap`

这两个请求都属于“增强信息”，失败时允许静默降级：

- 头像失败：仍然显示姓名首字母
- Presence 失败：仍然显示未知状态或不显示增强效果

这是一种很典型的前端设计思想：

- 核心功能优先
- 增强体验其次
- 增强失败不能拖垮主流程

### 8.4 第四步：避免旧请求覆盖新目录

`useFilesData` 里有一个 `loadRequestSequenceRef`。

它的作用是给每次加载目录分配一个序号，只允许“最新的一次请求”落盘。

这个保护非常重要，因为 presence 和 photo 都是异步补数据。如果用户快速切换目录，旧目录的头像或在线状态不应该反过来覆盖新目录的数据。

---

## 9. 为什么头像不能直接把 Graph URL 填进 `img src`

这是很多初级开发者第一次接 Graph 图片接口时最容易困惑的地方。

表面上看，头像接口是一个 URL：

```http
GET /users/{id}/photos/48x48/$value
```

但浏览器中的普通 `<img src="...">` 不能自动帮你加上 Bearer Token。

而 Microsoft Graph 的头像接口又需要认证头：

```http
Authorization: Bearer {token}
```

所以当前实现采用的是：

1. 通过 Graph client 发送认证请求
2. 把响应按 `Blob` 读出来
3. 用 `URL.createObjectURL(blob)` 生成浏览器可显示的本地 URL
4. 把这个本地 URL 交给 `Avatar image={{ src: ... }}`

这也是 `fetchUserPhotoUrlMap` 的核心工作。

对应代码里还能看到两个重要细节：

- 用 `photoCacheRef` 缓存 `userId -> object URL`
- 在组件卸载时统一 `URL.revokeObjectURL(...)`

前者是为了少打重复请求，后者是为了避免浏览器内存泄漏。

---

## 10. 前端 UI 组件是怎么配合的

### 10.1 `FilesDataGrid`

位置：

- `src/components/files/components/FilesDataGrid.tsx`

这个组件负责定义表格列。

现在“Last Modified By”这一列不再只是纯文本，而是渲染 `PersonCell`：

```tsx
<PersonCell
  name={driveItem.modifiedByName}
  imageUrl={driveItem.modifiedByPhotoUrl}
  presenceStatus={driveItem.modifiedByPresence}
/>
```

### 10.2 `PersonCell`

位置：

- `src/components/files/components/PersonCell.tsx`

这个组件的职责非常单一：

- 显示头像
- 显示名字
- 显示 Presence badge

它没有自己发请求，也不处理 Graph 原始数据，只负责“消费已经整理好的 UI 数据”。

这是一种很好的 React 分层方式：

- Hook 负责数据和副作用
- 展示组件负责渲染

### 10.3 `Avatar`

这里用的是 Fluent UI 的 `Avatar` 组件，而不是自己手工拼头像和状态点。

当前主要用了这些属性：

- `name`
- `image`
- `color="colorful"`
- `size={28}`
- `badge={{ status, outOfOffice }}`

其中：

- `name` 可以在没有头像时自动生成首字母
- `color="colorful"` 会按名字哈希出一个稳定颜色
- `badge` 槽位内部就是 PresenceBadge

这也是当前实现没有单独再渲染一个 `PresenceBadge` 组件的原因：`Avatar` 本身已经支持 badge 插槽。

---

## 11. 失败时系统怎么降级

当前实现对人员增强信息采用了“可失败但不影响主流程”的策略。

### 11.1 如果头像拉取失败

结果是：

- `modifiedByPhotoUrl` 不写入
- `Avatar` 自动退回到姓名首字母

### 11.2 如果 Presence 拉取失败

结果是：

- `modifiedByPresence` 不写入
- `Avatar` badge 使用默认的 `unknown`

### 11.3 如果用户根本没有头像

根据 Graph 文档，获取头像二进制时可能返回 `404 Not Found`。

这在当前实现里被视为正常降级场景，不会让整个文件列表报错。

---

## 12. 为什么需要缓存头像，但没有对 Presence 做同样级别的本地对象缓存

这两类数据的性质不一样：

### 12.1 头像

头像相对稳定，而且图片下载开销比一个小 JSON 要大，所以缓存收益高。

### 12.2 Presence

Presence 是实时状态，变化频率更高。如果在前端长时间缓存，反而更容易出现“界面显示过期状态”。

所以当前实现对 Presence 的策略更偏向：

- 每次加载当前目录时重新拉取
- 失败时降级
- 不做长期静态缓存

这是一个很合理的取舍。

---

## 13. Teams Presence 有哪些现实限制

在做这类功能时，必须知道 Presence 不是“我一请求就永远准确”的简单字段。

常见限制包括：

- 只支持工作或学校账户场景，不支持个人 Microsoft 账户作为这个接口的主要使用场景
- 某些接口需要管理员同意高权限
- Teams 和 Graph 的状态同步可能有几分钟延迟
- 组织的隐私设置、外部访问策略、trusted domains 都可能影响可见性
- Out of office 和 In a meeting 这类状态往往来自日历、自动回复或客户端状态聚合，不一定是用户手动设置的

所以，开发时不要把 Presence 当成“毫秒级绝对真相”，更适合把它视为“近实时的协作信号”。

---

## 14. 当前实现的整体流程图

```text
Msal2Provider 初始化 scopes
        |
        v
useFilesData.loadItems(folderId)
        |
        +--> GET /drives/{containerId}/items/{itemId}/children
        |          |
        |          +--> 转成 IDriveItemExtended
        |          +--> 立刻 setDriveItems(items)
        |
        +--> collectModifiedByUserIds(items)
                   |
                   +--> fetchUserPhotoUrlMap()
                   |       |
                   |       +--> GET /users/{id}/photos/48x48/$value
                   |       +--> Blob -> object URL
                   |       +--> 回填 modifiedByPhotoUrl
                   |
                   +--> fetchUserPresenceMap()
                           |
                           +--> POST /communications/getPresencesByUserId
                           +--> mapGraphPresenceToBadgeState()
                           +--> 回填 modifiedByPresence

FilesDataGrid
        |
        +--> PersonCell
                |
                +--> Avatar
                        |
                        +--> image
                        +--> badge(status, outOfOffice)
```

---

## 15. 如果你是初级开发者，读代码时建议按这个顺序看

1. 先看 `src/index.tsx`
2. 再看 `src/common/scopes.ts`
3. 再看 `src/components/files/hooks/useFilesData.tsx`
4. 再看 `src/components/files/services/peopleEnrichment.ts`
5. 最后看 `src/components/files/components/FilesDataGrid.tsx` 和 `src/components/files/components/PersonCell.tsx`

这样会比较容易建立清晰的心智模型：

- 权限在哪里申请
- 数据在哪里加载
- 数据在哪里转换
- UI 在哪里渲染

---

## 16. 这个设计为什么是合理的

把这套实现浓缩成一句话，就是：

> 先保证文件列表可用，再渐进增强人员信息展示。

这个设计合理的原因有四个：

1. 首屏更快，不会因为头像或 presence 拖慢列表加载。
2. UI 分层清楚，Hook 不直接负责渲染，组件不直接负责拉数据。
3. 出错可降级，增强功能失败不会破坏主流程。
4. 便于后续扩展，例如增加 hover 卡片、点击打开用户详情、批量缓存策略等。

---

## 17. 参考资料

- Microsoft Graph presence resource: https://learn.microsoft.com/en-us/graph/api/resources/presence?view=graph-rest-1.0
- Microsoft Graph get presence: https://learn.microsoft.com/en-us/graph/api/presence-get?view=graph-rest-1.0
- Microsoft Graph getPresencesByUserId: https://learn.microsoft.com/en-us/graph/api/cloudcommunications-getpresencesbyuserid?view=graph-rest-1.0
- Microsoft Graph get profilePhoto: https://learn.microsoft.com/en-us/graph/api/profilephoto-get?view=graph-rest-1.0
- Fluent UI Avatar: https://storybooks.fluentui.dev/react/?path=/docs/components-avatar--docs
- Fluent UI PresenceBadge: https://storybooks.fluentui.dev/react/?path=/docs/components-badge-presencebadge--docs
- Microsoft Teams presence admin guidance: https://learn.microsoft.com/en-us/microsoftteams/presence-admins
- Microsoft Graph presence state management guidance: https://learn.microsoft.com/en-us/graph/cloud-communications-manage-presence-state

如果你准备继续深入，下一步最值得看的代码就是：

- `src/components/files/services/peopleEnrichment.ts`

它是这套能力的核心转换层，既连接 Graph，又屏蔽了 UI 不需要直接理解的原始细节。
