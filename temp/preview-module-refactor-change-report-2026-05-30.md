# Preview 模块重组变更报告

## 背景

本次改动的目标是把 `src/components/preview.tsx` 从单文件组件重组为与 `files`、`permissions` 一致的目录模块结构，同时保持页面层调用方式和现有用户行为不变。

## 改动摘要

- 删除旧入口文件：`src/components/preview.tsx`
- 新增目录模块入口：`src/components/preview/index.tsx`
- 新增内部子目录：
  - `src/components/preview/components/`
  - `src/components/preview/hooks/`
  - `src/components/preview/models/`
  - `src/components/preview/services/`

## 结构调整详情

### 1. 入口组件

`src/components/preview/index.tsx` 现在作为 Preview 模块唯一公开入口，负责：

- 接收原有 `Preview` props
- 编排预览 URL 状态
- 编排前后导航状态
- 组装下载、新标签页打开、删除、关闭回调
- 将状态和事件传入共享弹窗骨架

页面层仍可继续使用：

```ts
import Preview from "../preview";
```

因此 `src/components/files/index.tsx` 无需适配导入路径。

### 2. hooks 拆分

新增 `src/components/preview/hooks/usePreviewUrl.ts`：

- 负责调用 Graph `POST /drives/{driveId}/items/{fileId}/preview`
- 优先使用返回的 `getUrl`
- 统一追加 `nb=true`
- `/preview` 失败时回退到 `webUrl`
- 在弹窗关闭、文件切换或 `currentFile` 清空时重置旧状态

新增 `src/components/preview/hooks/usePreviewNavigation.ts`：

- 根据 `allFiles` 和 `currentFile` 计算当前位置
- 暴露 `hasPrevious / hasNext`
- 暴露 `goToPrevious / goToNext`
- 不复制父层文件状态

### 3. services 拆分

新增 `src/components/preview/services/previewUrl.ts`，承接原组件中的纯逻辑和浏览器辅助逻辑：

- `appendNoBannerParam`
- `resolvePreviewRequestTarget`
- `resolvePreviewFallbackUrl`
- `isOfficeOrVisioFile`
- `resolveOpenInNewTabUrl`
- `openInIsolatedTab`

### 4. components 拆分

新增 `src/components/preview/components/PreviewDialogFrame.tsx`：

- 负责 `Dialog` 外壳
- 负责标题和关闭按钮
- 负责承载内容区和底部操作区

新增 `src/components/preview/components/PreviewContent.tsx`：

- 负责 `loading / error / iframe / empty` 四态渲染

新增 `src/components/preview/components/PreviewFooter.tsx`：

- 负责前后导航按钮
- 负责下载、新标签页打开、删除按钮

新增 `src/components/preview/components/previewStyles.ts`：

- 承接原 `preview.tsx` 中的弹窗、内容区、底部按钮样式

### 5. models 拆分

新增 `src/components/preview/models/previewTypes.ts`：

- `IPreviewProps`
- `IPreviewContentState`
- `IPreviewNavigationState`

用于收拢 Preview 模块对外 props 和内部派生状态类型。

## 保持不变的行为

本次重组没有改变以下行为：

- 预览仍通过 iframe 加载 SharePoint 预览 URL
- 仍优先使用 Graph `/preview` 接口
- 仍在成功 URL 后追加 `nb=true`
- `/preview` 失败时仍回退到 `webUrl`
- 仍支持前后文件导航
- 仍支持下载、删除、新标签页打开
- `Files` 页面仍通过原有回调协议与 Preview 交互

## 测试补充

本次新增 focused tests：

- `src/components/preview/services/previewUrl.test.ts`
- `src/components/preview/hooks/usePreviewNavigation.test.tsx`
- `src/components/preview/components/PreviewDialogFrame.test.tsx`

覆盖内容包括：

- `nb=true` 参数拼接
- `driveId` 解析优先级
- `webUrl` fallback
- Office/Visio 与非 Office 文件的新标签页打开策略
- 首项/末项导航禁用
- 前后导航触发正确文件
- Dialog loading/error/iframe/empty 四态
- 底部按钮禁用与点击行为

## 已执行验证

已完成以下验证并通过：

```bash
npm test -- --run src/components/preview
npx tsc --noEmit
git diff --check
```

## 结论

Preview 模块现已完成从单文件组件到目录模块的重组，结构与仓库中 `files`、`permissions` 的组织方式保持一致，同时保持了外部调用方式、运行行为和用户可见交互不变。
