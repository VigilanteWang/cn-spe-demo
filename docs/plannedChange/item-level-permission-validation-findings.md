# Item-Level Permission 验证结论

本文档记录 `cn-spe-demo` 在当前租户、当前 app registration、当前后端 OBO 路径下，对 item-level permission 的最小验证结果。

验证日期：

- 本轮核心写操作验证完成于北京时间 `2026-05-21 00:01` 左右
- 本轮补充只读 `inheritedFrom` 探针完成于北京时间 `2026-05-21` 同一轮会话
- 本轮补充“直接授予用户 write 权限”验证完成于北京时间 `2026-05-21 18:29`

验证范围：

- `GET /drives/{driveId}/items/{itemId}/permissions`
- `GET /drives/{driveId}/items/{itemId}/permissions/{permissionId}`
- `POST /drives/{driveId}/items/{itemId}/invite`
- `PATCH /drives/{driveId}/items/{itemId}/permissions/{permissionId}`
- `DELETE /drives/{driveId}/items/{itemId}/permissions/{permissionId}`

验证约束：

- 不改正式功能代码
- 仅新增临时验证脚本：
  - [temp/itemPermissionValidation.ts](/Users/vigilante/Documents/code/cn-spe-demo/temp/itemPermissionValidation.ts)
  - [temp/itemPermissionInheritedProbe.ts](/Users/vigilante/Documents/code/cn-spe-demo/temp/itemPermissionInheritedProbe.ts)
  - [temp/itemPermissionUserInviteProbe.ts](/Users/vigilante/Documents/code/cn-spe-demo/temp/itemPermissionUserInviteProbe.ts)
- 验证时复用当前仓库的真实前端登录配置、后端 API scope、后端 OBO Graph token 路径

## 1. 结论摘要

### 1.1 是否需要额外 Graph delegated permission

结论：

- 在当前实测租户和当前应用配置下，**没有观察到需要额外新增 `Files.Read` 或 `Files.ReadWrite` delegated permission**。
- 本轮 `list / get / invite / patch / delete` 均已在真实 OBO 路径下成功执行。
- 本轮 OBO Graph token 的 `scp` 中**没有**出现 `Files.Read` 或 `Files.ReadWrite`，但相关 item permission API 仍可成功调用。

实测 OBO token `scp`：

```json
[
  "FileStorageContainer.Manage.All",
  "FileStorageContainer.Selected",
  "FileStorageContainerType.Manage.All",
  "FileStorageContainerTypeReg.Manage.All",
  "User.Read",
  "profile",
  "openid",
  "email"
]
```

解释：

- 这足以证明“当前实现路线下，item permission 并不依赖额外的 `Files.Read` / `Files.ReadWrite`”。
- 但它**不等于**“任意租户都一定不需要别的 scope”。
- 更准确的说法应是：

  - 当前实测租户
  - 当前应用
  - 当前 SharePoint Embedded / Graph delegated 配置
  - 当前后端 OBO 路径

  下，**不需要额外补 `Files.Read` / `Files.ReadWrite` 才能完成本轮 item permission 验证**。

### 1.2 `inheritedFrom` 是否稳定返回

结论：

- 本轮已经确认：当父文件夹存在显式 item permission 时，**子文件夹和子文件的 permission 列表里会出现 `inheritedFrom`**。
- 但当前样本中的 `inheritedFrom` 形状是 **空对象 `{}`**，不是带来源细节的完整对象。
- 因此更准确的结论是：
  - **`inheritedFrom` 在“父级 item permission 传递到子项”的场景下会出现**
  - **当前 SPE payload 中不能依赖 `inheritedFrom` 内部字段**
  - 代码应把“字段是否存在”作为 inherited 判定条件，而不是读取其内部结构

建议在正式实现前保守处理：

- 代码层把 `inheritedFrom` 视为“可选字段”
- 一旦字段存在，即使值是 `{}`，也按 inherited 处理
- 不要依赖 `inheritedFrom.driveId`、`inheritedFrom.itemId` 之类尚未在本轮样本中出现的内部字段

### 1.3 invite 创建出来的 permission 是否可 PATCH

结论：

- **可 PATCH。**
- 本轮对显式 invite permission 的角色更新已经成功验证。
- `read -> write` 与 `write -> read` 都成功。

这意味着当前实测租户下，正式实现**可以优先走直接 PATCH**，不必默认采用“delete + recreate”。

但仍建议保留 fallback 设计：

- 优先 PATCH
- 如果未来个别 permission 类型、个别租户或未来 Graph 行为变化导致 PATCH 失败，再 fallback 到 `delete + recreate`

### 1.4 group 邀请更适合用什么标识

结论：

- **首选 `objectId`**
- **次选 `email`**
- **不建议默认用 `alias`**

本轮结果：

- `objectId`：成功
- `email`：成功
- `alias`：失败，返回 `400 invalidRequest`

失败样例：

```json
{
  "code": "invalidRequest",
  "message": "One or more users could not be resolved"
}
```

因此正式实现建议：

1. 默认发 `objectId`
2. 如果前端候选缺少 `objectId`，再退到 `email`
3. 不把 `alias` 作为默认主路径；最多只当特殊 fallback，并且要准备好失败处理

### 1.5 直接授予用户 write 权限后是什么情况

结论：

- 已补测用户 `MiriamG@<tenant>.onmicrosoft.com` 的显式 `write` 授权。
- `POST /invite` 成功后，会创建一条显式 item permission，`roles` 为 `["write"]`。
- 这条用户 permission **没有** `inheritedFrom`，因此应被视为 explicit permission。
- 用户场景与 group 场景一样，也存在“`invite` 返回体”和“后续 `GET permission` / `list permissions` 返回体” shape 不完全一致的问题。

本轮实测到的用户 payload 特征：

- `invite` 返回体：
  - `grantedToV2.user`
  - `grantedTo.user`
- 后续 `GET permission` / `list permissions`：
  - `grantedToV2.user`
  - `grantedToV2.siteUser`
  - `grantedTo.user`

因此正式实现建议：

1. 用户 permission 也不要只靠单一路径字段做解析。
2. 后端 normalization 需要兼容读取返回里的 `user` 与 `siteUser` 现象，但当前项目可以只把 AAD `user` 当作正式可管理身份。
3. Apply 成功后仍应重新 `list`，不要把 `invite` 返回体当作最终本地状态。

## 2. 分接口验证结果

### 2.1 `GET /drives/{driveId}/items/{itemId}/permissions`

结果：

- 成功
- 临时测试 item 返回空数组

样例：

```json
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#drives('<drive-id-prefix>...')/items('<item-id-prefix>...')/permissions",
  "value": []
}
```

补充：

- `root` item 的 `GET /root/permissions` 本轮也返回 `[]`
- 普通“无 item-level 权限”的 item，返回空数组
- 但在“父文件夹显式授权 -> 子项继承”的补充验证里，子文件夹与子文件都返回了带 `inheritedFrom: {}` 的 permission

### 2.2 `GET /drives/{driveId}/items/{itemId}/permissions/{permissionId}`

结果：

- 成功
- 对 invite 创建出来的显式 group permission 可读取

样例关键字段：

```json
{
  "id": "<permission-id-prefix>...",
  "roles": ["read"],
  "grantedToV2": {
    "group": {
      "displayName": "Retail Members",
      "email": "Retail@<tenant>.onmicrosoft.com",
      "id": "7f3104-...-703f"
    },
    "siteUser": {
      "displayName": "Retail Members",
      "email": "Retail@<tenant>.onmicrosoft.com",
      "id": "<site-user-id>",
      "loginName": "c:0o.c|federateddirectoryclaimprovider|7f3104-...-703f"
    }
  },
  "grantedTo": {
    "user": {
      "displayName": "Retail Members",
      "email": "Retail@<tenant>.onmicrosoft.com",
      "id": "7f3104-...-703f"
    }
  }
}
```

### 2.3 `POST /drives/{driveId}/items/{itemId}/invite`

结果：

- 成功
- 本轮验证了 `sendInvitation=false`
- 验证了 `roles=read` 与 `roles=write`
- 验证对象为 group

`objectId` 成功样例：

请求核心语义：

```json
{
  "recipients": [
    {
      "objectId": "7f3104-...-703f"
    }
  ],
  "requireSignIn": true,
  "sendInvitation": false,
  "roles": ["read"]
}
```

返回关键字段：

```json
{
  "value": [
    {
      "id": "<permission-id-prefix>...",
      "roles": ["read"],
      "grantedToV2": {
        "user": {
          "displayName": "Retail Members",
          "email": "Retail@<tenant>.onmicrosoft.com"
        }
      },
      "grantedTo": {
        "group": {
          "displayName": "Retail Members",
          "email": "Retail@<tenant>.onmicrosoft.com"
        }
      }
    }
  ]
}
```

### 2.3.1 补充：直接授予用户 `write` 的实测结果

补测对象：

- 用户：`MiriamG@<tenant>.onmicrosoft.com`
- objectId：`89cb17b1-...-87f8`
- 角色：`write`

请求核心语义：

```json
{
  "recipients": [
    {
      "objectId": "89cb17b1-...-87f8"
    }
  ],
  "requireSignIn": true,
  "sendInvitation": false,
  "roles": ["write"]
}
```

`invite` 返回关键字段：

```json
{
  "value": [
    {
      "id": "<permission-id-prefix>...",
      "roles": ["write"],
      "grantedToV2": {
        "user": {
          "displayName": "Miriam",
          "email": "MiriamG@<tenant>.onmicrosoft.com",
          "id": "89cb17b1-...-87f8"
        }
      },
      "grantedTo": {
        "user": {
          "displayName": "Miriam",
          "email": "MiriamG@<tenant>.onmicrosoft.com",
          "id": "89cb17b1-...-87f8"
        }
      }
    }
  ]
}
```

随后 `GET /permissions/{permissionId}` 的关键字段：

```json
{
  "id": "<permission-id-prefix>...",
  "roles": ["write"],
  "grantedToV2": {
    "user": {
      "displayName": "Miriam",
      "email": "MiriamG@<tenant>.onmicrosoft.com",
      "id": "89cb17b1-...-87f8"
    },
    "siteUser": {
      "displayName": "Miriam",
      "email": "MiriamG@<tenant>.onmicrosoft.com",
      "id": "20",
      "loginName": "i:0#.f|membership|miriamg@<tenant>.onmicrosoft.com"
    }
  },
  "grantedTo": {
    "user": {
      "displayName": "Miriam",
      "email": "MiriamG@<tenant>.onmicrosoft.com",
      "id": "89cb17b1-...-87f8"
    }
  }
}
```

结论：

- 当前租户下，直接授予用户 `write` 权限可成功落到 item permission。
- 该 permission 是显式权限，不带 `inheritedFrom`。
- 用户场景同样体现出“创建响应较简略、读取响应较完整”的 shape 差异。
- 本次用户补测重点是“创建后真实 payload 长什么样”；并**未单独再次执行**用户样本的 `PATCH` / `DELETE`，因此这两项仍主要沿用前文对显式 invite permission 的通用结论。

### 2.4 `PATCH /drives/{driveId}/items/{itemId}/permissions/{permissionId}`

结果：

- 成功
- 显式 invite permission 可直接 PATCH `roles`

实测：

- `objectId` 创建出的 permission：`read -> write` 成功
- `email` 创建出的 permission：`write -> read` 成功

PATCH 后再次 `GET` 的关键字段：

```json
{
  "id": "<permission-id-prefix>...",
  "roles": ["write"]
}
```

### 2.5 `DELETE /drives/{driveId}/items/{itemId}/permissions/{permissionId}`

结果：

- 成功
- 返回 `204`

说明：

- 显式 invite permission 在当前租户可正常删除

### 2.6 `inheritedFrom` 的补充链路验证

结果：

- 成功验证“父文件夹显式授权 -> 子文件夹 / 子文件继承”场景
- 父文件夹上的 permission：
  - `hasInheritedFrom = false`
- 子文件夹上的对应 permission：
  - `hasInheritedFrom = true`
  - 原始 payload 为 `inheritedFrom: {}`
- 子文件上的对应 permission：
  - `hasInheritedFrom = true`
  - 原始 payload 为 `inheritedFrom: {}`

结论：

- `inheritedFrom` 确实可用于区分“当前 item 上显式权限”与“从父级 item 继承来的权限”
- 但当前租户样本里它只是一个空对象，不能指望里面有稳定可读的来源字段

父级显式 permission 关键片段：

```json
{
  "id": "<permission-id-prefix>...",
  "roles": ["read"]
}
```

子项继承 permission 关键片段：

```json
{
  "id": "<permission-id-prefix>...",
  "roles": ["read"],
  "inheritedFrom": {}
}
```

### 2.7 `U.S.Sales` 对照实验：证明出现条件与 container 边界

本轮又补做了一组更强的对照实验，目标组为：

- `U.S.Sales@<tenant>.onmicrosoft.com`
- group id: `7eba5343-...-77b5`

实验前提：

- 该组在当前 container 上**已经存在 container permission**
- 命中的 container permission 角色是 `manager`

命中样例：

```json
{
  "id": "<container-permission-id-prefix>...",
  "roles": ["manager"],
  "grantedToV2": {
    "group": {
      "displayName": "U.S. Sales Members",
      "email": "U.S.Sales@<tenant>.onmicrosoft.com",
      "id": "7eba5343-...-77b5"
    }
  }
}
```

然后做了下面这组 before / after 对照：

1. 创建临时父文件夹
2. 在父文件夹下创建子文件夹和子文件
3. **在父文件夹还没有 item-level permission 时**，先读子文件夹/子文件 `/permissions`
4. 再对父文件夹执行该组的 item-level `invite`
5. 再读父文件夹 / 子文件夹 / 子文件 `/permissions`

对照结果：

- before:
  - 子文件夹 `/permissions` = `[]`
  - 子文件 `/permissions` = `[]`
- after:
  - 父文件夹：出现 1 条显式 permission，**没有** `inheritedFrom`
  - 子文件夹：出现 1 条 permission，**有** `inheritedFrom: {}`
  - 子文件：出现 1 条 permission，**有** `inheritedFrom: {}`

这组结果可以支持两个更强的结论：

1. `inheritedFrom` 的出现条件，至少在当前实测租户样本下，是“父级存在显式 item-level permission，子项继承后才出现”
2. 单独存在 container permission，**不会**让 item `/permissions` 自动出现一条带 `inheritedFrom` 的记录

也就是说：

- container permission 可以让该组本身拥有 container 访问权
- 但在父文件夹还没做 item-level `invite` 前，子文件夹和子文件的 item permission 列表仍然是空
- 因此当前没有证据表明“container permission 会映射成 item `inheritedFrom`”

## 3. 真实 payload 样例带来的实现风险

### 3.1 不要靠单一字段判断 principal 类型

风险：

- `invite` 返回体里，同一条 group permission 出现了：
  - `grantedToV2.user`
  - `grantedTo.group`
- 但后续 `GET permission` 返回体里又变成：
  - `grantedToV2.group`
  - `grantedToV2.siteUser`
  - `grantedTo.user`

这说明：

- 同一个逻辑上的“group permission”
- 在不同接口、不同阶段
- 字段形状并不完全一致

正式实现建议：

- 后端 adapter 不要假设“group 一定只出现在 `grantedToV2.group`”
- 应按“可解析 identity 集合”做归一化
- 优先抽象出统一 principal normalization 层

### 3.2 `invite` 返回体与 `permission get` 返回体 shape 不一致

风险：

- `invite` 的响应 shape 更像“创建结果摘要”
- `GET permission` 的响应 shape 更像“完整 permission 实体”
- 如果前端直接拿 `invite` 的返回体当长期 source of truth，后续可能出现显示或 diff 偏差

正式实现建议：

- Apply 成功后重新 `list`，不要长期依赖 `invite` 原始返回体作为本地最终状态

补充：

- 这条风险不仅出现在 group 样本里，用户 `MiriamG@<tenant>.onmicrosoft.com` 的 `write` 授权样本里也同样出现：
  - `invite` 返回体只出现 `grantedToV2.user`
  - 后续 `GET permission` / `list permissions` 会多出 `grantedToV2.siteUser`

### 3.3 group 的显示名可能与目录搜索候选不完全一致

本轮样本里：

- 目录候选组：`Retail`
- permission payload 显示名：`Retail Members`

风险：

- 前端若用显示名做唯一比对，会误判为不同对象

正式实现建议：

- 比对与去重一律用稳定 ID
- 显示名只作展示用途

### 3.4 permission id 在同一 principal 上可能稳定复用

本轮样本里：

- `objectId` invite
- `email` invite

两次都得到同一 `permissionId`

风险：

- 这提示当前系统更像“同一 principal 的同一显式授权记录被更新/复用”
- 正式实现不能把“再次 invite 同一 principal”简单当成一定会新建新 permission

正式实现建议：

- 变更前先基于现有 entries 做显式去重
- 不允许对同一 principal 在同一 item 上重复添加

### 3.5 `inheritedFrom` 当前可观测到，但内部 shape 仍不能假设

风险：

- 如果代码只判断 `Object.keys(inheritedFrom).length > 0`，当前样本会误判
- 因为当前继承行返回的是 `inheritedFrom: {}`
- 如果把 container permission 和 item inherited permission 混为一谈，也会导致 UI 误展示

正式实现建议：

- 数据模型保留 `isInherited` / `inheritedFrom?`
- UI 逻辑保留 inherited row 只读分支
- inherited 判定建议使用：
  - `permission.inheritedFrom !== undefined && permission.inheritedFrom !== null`
- 不要宣称 `inheritedFrom` 内部 shape 稳定
- 不要把 container permission 伪装成 item inherited row

## 4. 对正式实现的建议

### 4.1 后端策略

- 继续采用计划文档里的后端 OBO 路线，不回退到前端直写 Graph
- item create 使用 `invite`
- group recipient 默认优先 `objectId`
- 缺 `objectId` 时 fallback 到 `email`
- 不要把 `alias` 作为默认路径
- item role update 优先直接 `PATCH`
- 仍保留 `PATCH` 失败时的 `delete + recreate` fallback 设计
- Apply 成功后重新 `list`

### 4.2 前端和共同契约

- item role 继续只暴露 `Reader | Writer`
- 数据模型保留：
  - `permissionId`
  - `principalId`
  - `principalName`
  - `principalType`
  - `isInherited`
  - `isEditable`
  - `isRemovable`
- principal candidate 需要稳定保留：
  - `objectId`
  - `email`
  - `userPrincipalName`
  - group 相关目录字段
- 不能只保留显示名

### 4.3 文档和结论措辞

建议后续 PR / 设计文档中直接使用下面这类表述：

- 当前实测租户下，item permission 的 `list / get / invite / patch / delete` 已可通过现有 OBO 路径调用成功
- 当前实测租户下，不需要额外新增 `Files.Read` 或 `Files.ReadWrite` delegated permission
- 当前实测租户已观测到 `inheritedFrom` 会出现在子项继承场景，但其内部 shape 仍需继续观察，不应在实现里假设为带明细字段的对象
- 当前实测租户下，group invite 推荐优先使用 `objectId`，`email` 可作为 fallback，`alias` 不可靠
- 当前实测租户下，用户 `MiriamG@<tenant>.onmicrosoft.com` 的显式 `write` 授权可成功创建；其读取 payload 同时可能出现 `user` 与 `siteUser` 视角，但项目实现可以只采纳 AAD `user`

## 5. 下一步建议

建议按现有计划继续推进时，直接采用以下落地判断：

1. Step 0 已完成，可进入后续共享核心/后端 adapter 实现阶段
2. `Files.Read` / `Files.ReadWrite` 不要默认加入
3. `PATCH` 作为 item 显式权限更新主路径
4. `objectId` 作为 group invite 主路径
5. `inheritedFrom` 逻辑可以正式纳入 explicit/inherited 区分，但实现上只依赖“字段存在”，不要依赖其内部字段
6. 当前实现说明里可以明确写：container permission 不会自动展开成 item inherited row；只有父级 item-level permission 传播到子项时，才会在子项 `/permissions` 里看到 `inheritedFrom`
