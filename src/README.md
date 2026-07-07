# 前端应用文档

> React + TypeScript + Fluent UI 实现的 SharePoint Embedded 文件管理前端

前端当前可以按 5 个大模块来理解：应用壳层负责登录态、主题和全局错误边界；容器模块负责选择当前工作容器；文件模块承接日常文件操作；权限模块承接容器与 item 权限管理；预览模块负责文件预览体验。它们之间的关系是 `App` 提供顶层壳，`Containers` 决定当前容器上下文，`Files` 在该上下文里继续挂载预览、版本历史和权限能力。

| 模块 | 主要职责 | 关键入口 |
| --- | --- | --- |
| 应用壳层 | 负责初始化前端运行环境，包括 `Msal2Provider`、Fluent UI 主题、登录按钮和全局错误兜底。它不承载具体业务细节，主要负责把“用户已登录”这个前提和页面骨架搭起来。 | `src/index.tsx`、`src/App.tsx`、`src/components/app/` |
| 容器模块 | 负责列出当前用户可访问的 SharePoint Embedded 容器，并管理“选择哪个容器继续工作”。这里还承接创建容器和打开容器权限弹窗这两个页面级入口。 | `src/components/containers/` |
| 文件模块 | 负责容器内文件/文件夹的主工作流，包括列表展示、目录导航、上传、下载、删除、新建文件夹、版本历史等。这个模块是前端最主要的业务中心，也负责继续挂载 item 权限与文件预览等子能力。 | `src/components/files/` |
| 权限模块 | 负责容器权限、item user permission 和 item link permission 的前端建模、草稿编辑、搜索与写回调用。相比其他模块，这里概念密度更高，所以仓库里也单独补了说明文档。 | `src/components/permissions/` |
| 预览模块 | 负责在对话框中加载文件预览 URL，并处理前后切换、下载、在新标签页打开等预览态操作。它从文件模块接收当前文件上下文，本身专注于预览体验，不重复处理文件列表逻辑。 | `src/components/preview/` |

---

## 目录结构

```
src/
├── index.tsx                           # 应用入口：初始化 MGT/MSAL Provider 并挂载 React
├── App.tsx                             # 顶层页面壳：主题、登录态、错误边界、主内容区
├── customTheme.tsx                     # Fluent UI 自定义主题
├── index.css                           # 全局样式
├── common/                             # 前端共享配置、基础类型、通用映射
│   ├── config.ts                       # 环境变量与运行时配置
│   ├── scopes.ts                       # Graph / SPE scope 常量
│   ├── types.ts                        # 容器、文件等共享前端类型
│   └── apiErrorMapper.ts               # 前端 API 错误到 UI 文案的映射
├── components/
│   ├── app/                            # 应用级组件（如错误边界）
│   ├── containers/                     # 容器列表、容器选择、创建容器入口
│   ├── files/                          # 文件列表主模块：导航、上传、下载、删除、版本、预览入口
│   ├── permissions/                    # 容器 / item 权限对话框、hooks、服务与文档
│   ├── preview/                        # 文件预览弹窗、导航与预览 URL 处理
│   └── common/                         # 可复用通用 UI 组件
├── services/                           # 前端 API 封装（容器、文件、权限、下载、版本）
│   ├── containerAndFileApi.ts          # 容器与文件相关后端接口
│   ├── containerPermissionApi.ts       # 容器权限接口
│   ├── itemPermissionApi.ts            # item 权限接口
│   ├── itemVersionApi.ts               # 文件版本历史接口
│   └── downloadApi.ts                  # 归档下载任务接口
└── test/
    └── setup.ts                        # Vitest 前端测试初始化
```

权限模块详细文档：
- [README.md](./components/permissions/README.md)
- [introduce-ItemLinkPermissionModule.md](./components/permissions/documents/introduce-ItemLinkPermissionModule.md)

## 核心概念

### 组件树

```
<FluentProvider theme={customTheme}>     ← 提供 Fluent UI 主题
  <App>
    <AppErrorBoundary>                   ← 顶层错误兜底
      <TopBanner>
        <Login />                        ← MGT 登录按钮
      </TopBanner>
      <Containers />                     ← 容器页入口
        <CreateContainerDialog />        ← 创建容器弹窗
        <ContainerPermissionDialog />    ← 容器权限弹窗
        <Files container={selected}>     ← 文件页入口
          <FilesBreadcrumb />            ← 当前目录路径
          <FilesToolbar />               ← 上传、下载、删除、权限等操作
          <FilesProgress />              ← 上传/下载进度
          <FilesDataGrid />              ← 文件/文件夹列表
          <VersionHistoryDialog />       ← 版本历史弹窗
          <ItemPermissionDialog />       ← item 权限弹窗
          <Preview />                    ← 文件预览弹窗
        </Files>
      </Containers>
    </AppErrorBoundary>
  </App>
</FluentProvider>
```
