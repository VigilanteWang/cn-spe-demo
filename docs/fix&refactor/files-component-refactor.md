# files 组件重构说明

## 1. 背景

在本次重构之前，`src/components/files.tsx` 是一个典型的“大组件”。

它同时承担了很多不同层面的职责：

- 页面级状态管理
- 文件列表加载
- 文件夹导航
- 文件上传
- ZIP 归档下载
- 批量删除
- 新建文件夹
- 表格列定义
- 进度条展示
- 对话框展示
- 与 `Preview` 组件联动

这会带来几个非常现实的问题：

- 文件太长，阅读成本高。新人很难快速判断“哪一段代码负责哪一块功能”。
- 修改风险高。调整上传逻辑时，很容易误伤下载、删除或导航相关代码。
- 测试困难。原来很多逻辑都写在组件内部，不容易单独验证。
- React 职责边界不清晰。状态逻辑、异步副作用和 JSX 渲染混在一起，不利于维护。

简单说，原来的问题不是“代码不能运行”，而是“代码虽然能运行，但越来越难改、越来越难讲清楚”。

---

## 2. 这次重构的核心目标

这次重构并不是为了“把文件拆小而拆小”，而是为了把不同层次的职责拆开，让代码更符合 React 的常见最佳实践。

这次重构主要追求 4 件事：

1. 让入口组件只负责“组装”
2. 让复杂状态逻辑进入自定义 Hook
3. 让纯展示区域进入独立组件
4. 让纯工具函数和私有类型单独归档

这样做之后，开发者阅读代码时可以更快建立心智模型：

- 看 `index.tsx`，就知道这个页面由哪些部分组成
- 看 `hooks/`，就知道状态和副作用怎么运作
- 看 `components/`，就知道界面是怎么渲染的
- 看 `filesUtils.ts`，就知道哪些是纯函数
- 看 `filesTypes.ts`，就知道这个功能模块自己的类型边界

---

## 3. 重构后的文件夹结构

本次重构后，`files` 功能被迁移为一个独立的 `feature folder`：

```text
src/components/files/
├── index.tsx
├── filesStyles.ts
├── filesTypes.ts
├── filesUtils.ts
├── filesUtils.test.ts
├── components/
│   ├── FilesBreadcrumb.tsx
│   ├── FilesDataGrid.tsx
│   ├── FilesDataGrid.test.tsx
│   ├── FilesProgress.tsx
│   └── FilesToolbar.tsx
└── hooks/
    ├── useFilesArchiveDownload.ts
    ├── useFilesData.tsx
    ├── useFilesNavigation.ts
    ├── useFilesNavigation.test.tsx
    └── useFilesUpload.ts
```

### 各文件职责

#### `index.tsx`

页面入口组件，只负责“把各块拼起来”。

它主要做这些事：

- 调用各个 Hook
- 维护少量页面级 UI 状态
- 连接子组件与回调
- 渲染对话框和 `Preview`

它不再直接承载完整的上传、下载、导航、列表转换等大块逻辑。

#### `filesTypes.ts`

保存 `files` 模块私有的类型定义，例如：

- `IFilesProps`
- `IFilesBreadcrumbItem`
- `IUploadProgress`
- `IDownloadProgress`
- `IGraphApiClient`

这样做的好处是，类型不会散落在多个文件顶部，新人也能更快知道“这个功能模块用到了哪些数据结构”。

#### `filesUtils.ts`

保存纯函数，例如：

- 文件大小格式化
- 百分比格式化
- 进度值计算
- 下载文案生成

纯函数的特点是：

- 不依赖 React 状态
- 不操作 DOM
- 不发请求
- 输入固定，输出固定

这类函数最适合抽离，因为最容易复用，也最容易测试。

#### `hooks/useFilesData.tsx`

负责“文件列表数据”和“表格选中状态”。

它处理的重点包括：

- `loadItems`
- `driveItems`
- `selectedRows`
- `onSelectionChange`
- 竞态保护

这里的“竞态保护”很重要。
如果用户连续快速点击不同文件夹，前一个请求可能比后一个请求更晚返回。
如果不做保护，就会出现“明明已经切到新目录，但旧请求又把界面刷回去”的问题。

#### `hooks/useFilesNavigation.ts`

负责“目录导航状态”。

它处理的重点包括：

- `folderId`
- `breadcrumbPath`
- `navigateToFolder`
- `navigateToParentFolder`
- `onBreadcrumbClick`

这让“导航逻辑”从入口组件中独立出来，形成一个很清楚的单元。

#### `hooks/useFilesUpload.ts`

负责上传相关逻辑：

- 隐藏 input 的 `ref`
- 文件/文件夹选择事件
- 文件夹结构解析
- 必要时递归创建中间目录
- 上传进度状态

#### `hooks/useFilesArchiveDownload.ts`

负责下载相关逻辑：

- 单文件直链下载判断
- ZIP 归档任务启动
- 轮询后端进度
- 获取 `manifest`
- 启动前端流式下载和压缩
- 下载进度状态
- `AbortController`

#### `components/`

这里的组件都偏向“展示组件”：

- `FilesBreadcrumb.tsx`
- `FilesToolbar.tsx`
- `FilesDataGrid.tsx`
- `FilesProgress.tsx`

它们的共同特点是：

- 尽量少保存自己的业务状态
- 更多通过 `props` 接收数据和回调
- 自己不承担复杂副作用

这类组件更容易被复用，也更容易测试。

---

## 4. 这次重构大致改了什么

可以把这次改动理解成“三层拆分”。

### 第一层：把大组件拆成入口组件 + 子模块

以前所有代码都在一个文件里。
现在变成了：

- 入口组件：负责组装
- Hook：负责状态和副作用
- 展示组件：负责渲染

这是最核心的结构变化。

### 第二层：把“业务逻辑”从 JSX 中移出去

以前在 `files.tsx` 中，很多逻辑和 JSX 写在一起，比如：

- 切换文件夹
- 上传文件
- 启动下载
- 轮询进度
- 处理删除

现在这些逻辑都被放进 Hook 或辅助模块，`index.tsx` 更像一个“控制台”。

### 第三层：把“纯规则”和“纯数据结构”独立出来

以前很多工具函数和类型写在组件顶部。
现在：

- 规则放进 `filesUtils.ts`
- 类型放进 `filesTypes.ts`

这样可以避免每个文件都从头铺一遍定义，也让测试更自然。

---

## 5. 为什么这样改对初级开发者更友好

这是这次重构最重要的一点。

对于有经验的开发者来说，大文件虽然不舒服，但通常还能硬读。
对于初级开发者来说，大文件真正的问题是：

- 不知道从哪里开始看
- 不知道状态变化是由谁驱动的
- 不知道哪个函数属于哪个业务
- 不知道改一处会不会影响别处

重构后，阅读路径变得清楚了：

### 看功能入口

先看 `index.tsx`。

它告诉你：

- 页面有哪些状态块
- 页面用了哪些 Hook
- 页面由哪些子组件组成

这就像先看“目录”，再看“正文”。

### 看某一类逻辑

如果你只想研究导航，就直接看 `useFilesNavigation.ts`。
如果你只想研究上传，就直接看 `useFilesUpload.ts`。

这样不会一上来就被下载、删除、表格列定义等内容淹没。

### 看界面结构

如果你只想研究表格怎么渲染，就看 `FilesDataGrid.tsx`。
如果你只想研究工具栏，就看 `FilesToolbar.tsx`。

这比在一个超长文件里来回滚动清晰得多。

---

## 6. 重点解释：为什么 Hook 改成“传入方法”的模式

这是这次重构里非常值得讲清楚的一点。

在 `index.tsx` 中，现在有这样的写法：

```tsx
const {
  folderId,
  breadcrumbPath,
  navigateToFolder,
  navigateToParentFolder,
  onBreadcrumbClick,
} = useFilesNavigation({
  loadItems,
  clearSelection,
});
```

很多初级开发者看到这里会问：

- 为什么不把 `loadItems` 直接写在 `useFilesNavigation` 里面？
- 为什么 Hook 之间要互相“传函数”？
- 这和以前把所有逻辑都写在一个组件里相比，到底好在哪里？

下面分几层解释。

### 6.1 先看“旧思路”

在大组件阶段，常见写法是：

- 组件自己定义 `loadItems`
- 组件自己定义 `navigateToFolder`
- `navigateToFolder` 直接调用组件内部的 `loadItems`

这种写法在单文件里是自然的，因为所有函数都在一个作用域里。

但是一旦你把“导航逻辑”抽到 `useFilesNavigation.ts`，就会遇到一个问题：

`useFilesNavigation` 本身并不知道“怎么加载文件列表”。

它只知道：

- 我负责维护当前目录状态
- 我负责维护面包屑
- 当切目录时，我需要让“文件列表重新加载”

也就是说：

- “导航”是它的职责
- “真正发请求加载文件”不是它的职责

这时最合理的做法，就是把“它需要调用的能力”通过参数传进来。

这就是这里的：

```tsx
useFilesNavigation({
  loadItems,
  clearSelection,
});
```

---

## 7. 这其实是一种“依赖注入”思路

可以把 `useFilesNavigation` 理解为：

“我会负责导航，但我需要两个外部能力：

1. 切目录时重新加载内容
2. 切目录时清空当前选择”

所以它不自己创造这些能力，而是从外部接收：

- `loadItems`
- `clearSelection`

这叫做依赖注入。

它的好处非常大：

### 好处 1：职责更清楚

`useFilesNavigation` 不需要关心：

- Graph API 怎么请求
- 数据怎么转换成 `IDriveItemExtended`
- 表格选中状态底层怎么存

它只关心：

- 切目录时调用谁
- 面包屑怎么更新
- 返回上级目录怎么处理

这就是“单一职责”的实际体现。

### 好处 2：Hook 更容易复用

如果以后某个页面也需要“目录导航 + 面包屑”，但它的数据来源不是这里的 `loadItems`，怎么办？

如果导航 Hook 把加载逻辑写死了，就很难复用。

但如果它只要求外部传一个 `loadItems` 进来，那它就能复用在别的场景里。

### 好处 3：Hook 更容易测试

现在测试 `useFilesNavigation.ts` 时，不需要真的连 Graph API。
测试里可以直接传入假的 `loadItems`：

```tsx
const loadItems = vi.fn().mockResolvedValue(undefined);
```

这样测试可以专注验证：

- 导航是否调用了 `loadItems`
- `breadcrumbPath` 是否更新正确
- `folderId` 是否更新正确

这比把请求逻辑耦合进去更容易写，也更稳定。

### 好处 4：入口组件更像“编排层”

现在的 `index.tsx` 不是一个“无所不做的大脑”，而是一个“总调度台”。

它负责把不同能力拼起来：

- `useFilesData` 提供数据加载和选中状态
- `useFilesNavigation` 负责导航
- `useFilesUpload` 负责上传
- `useFilesArchiveDownload` 负责下载

这就是典型的 React 组合式思路。

---

## 8. 为什么这里还配合了 `useCallback`

你会看到现在很多传给 Hook 或子组件的方法，都会经过 `useCallback`。

例如：

- `reloadCurrentFolder`
- `onDownloadItemClick`
- `onDeleteItemClick`
- `handlePreviewDelete`

这并不是“为了到处都用 Hook”，而是因为在组合式结构下，函数本身也会变成依赖项。

例如：

```tsx
const reloadCurrentFolder = useCallback(async () => {
  await loadItems(folderId || "root");
}, [folderId, loadItems]);
```

这里 `reloadCurrentFolder` 的意义是：

- 当上传完成时，刷新当前目录

为什么不用普通函数？

因为它要作为参数传给 `useFilesUpload`。

如果每次渲染都创建一个全新的函数引用，那么：

- 依赖它的 Hook 可能会被迫重新计算
- 某些 `useEffect` 会重复触发
- 调试时也更难判断“到底是值变了，还是只是函数引用变了”

所以 `useCallback` 在这里的价值是：

- 让函数引用更稳定
- 明确声明“这个函数依赖哪些状态”
- 方便子 Hook 和子组件进行依赖追踪

要注意一点：

`useCallback` 不是为了“性能神话”而乱加。
它更重要的作用，是在“函数会被传递下去时”帮助我们稳定依赖边界。

---

## 9. 把这个例子讲透

我们再回到这段代码：

```tsx
const {
  folderId,
  breadcrumbPath,
  navigateToFolder,
  navigateToParentFolder,
  onBreadcrumbClick,
} = useFilesNavigation({
  loadItems,
  clearSelection,
});
```

这段代码可以这样理解：

### `useFilesData`

负责回答：

- 当前目录里有哪些文件
- 选中了哪些行
- 如何重新加载目录内容

它提供：

- `loadItems`
- `clearSelection`

### `useFilesNavigation`

负责回答：

- 当前目录 ID 是什么
- 面包屑路径是什么
- 如何进入子目录
- 如何返回上级目录
- 如何点击面包屑跳转

但它不负责回答：

- 文件列表具体怎么请求
- 数据怎么转换

所以它从外部拿到：

- `loadItems`
- `clearSelection`

这表示：

“导航 Hook 只声明自己需要什么，不声明底层具体怎么做。”

这正是 React 中比较健康的拆分方式。

---

## 10. 对初级开发者最重要的结论

如果你刚开始写 React，可以记住下面这些经验。

### 经验 1

不要让一个组件同时承担：

- 数据加载
- 状态管理
- 副作用
- 大段 JSX 渲染

如果一个文件越来越长，通常说明职责开始混在一起了。

### 经验 2

当某段逻辑可以用“这是一套状态和行为”来描述时，通常可以考虑抽成自定义 Hook。

例如：

- 文件夹导航
- 文件上传
- 下载任务

### 经验 3

当某个 Hook 需要调用外部能力时，优先把能力作为参数传进去，而不是把所有逻辑都写死在 Hook 里面。

这会让：

- 职责更清楚
- Hook 更容易复用
- 测试更容易写

### 经验 4

`useCallback` 的价值，不只是性能优化。
更重要的是：当函数需要传给子组件或子 Hook 时，它可以帮助我们稳定依赖边界。

### 经验 5

入口组件最理想的样子，不是“什么都做”，而是“把不同职责的模块组装起来”。

如果一个入口文件越来越像目录和调度中心，通常说明结构正在变得更健康。

---

## 11. 本次重构带来的直接收益

本次改造后，代码获得了这些实际收益：

- 阅读路径更清楚
- 目录结构更清楚
- Hook 职责更明确
- 组件更容易单测
- 列表、导航、上传、下载之间的边界更清晰
- 更适合继续给初级开发者讲解和演进

从维护角度看，这次重构不是“改写功能”，而是“让功能更容易被理解、修改和测试”。

这正是一次好的重构应该带来的价值。
