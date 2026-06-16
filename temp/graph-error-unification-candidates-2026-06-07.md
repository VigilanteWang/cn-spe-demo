# Graph Error 值得改位置清单（2026-06-07）

## 前端 src

### 1. 文件域 direct Graph 调用分散

位置：

1. [src/components/files/hooks/useFilesData.tsx](src/components/files/hooks/useFilesData.tsx#L83)
2. [src/components/files/hooks/useFilesUpload.ts](src/components/files/hooks/useFilesUpload.ts#L137)
3. [src/components/files/index.tsx](src/components/files/index.tsx#L262)
4. [src/components/files/services/peopleEnrichment.ts](src/components/files/services/peopleEnrichment.ts#L195)

理由：

1. 同一类 Graph 失败在不同模块映射口径不一致。
2. 有的转成 AppError+code，有的仅 warning 降级，有的吞掉底层细节。
3. 重复处理逻辑较多，后续维护容易漂移。

### 2. 预览模块错误模型与其它 Graph 场景割裂

位置：

1. [src/components/preview/hooks/usePreviewUrl.ts](src/components/preview/hooks/usePreviewUrl.ts#L80)

理由：

1. 预览 API 失败后走 fallback，行为合理，但错误结构主要是本地专用模型。
2. 与 files/permissions 场景的 Graph 错误字段（code/status/origin）对齐度不高。

### 3. 目录搜索已有局部统一，但能力未复用到其它 direct Graph 场景

位置：

1. [src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearchError.ts](src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearchError.ts#L65)
2. [src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearch.ts](src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearch.ts#L108)
3. [src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearchQueryBuilder.ts](src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearchQueryBuilder.ts#L25)

理由：

1. 这条链路已经形成成熟映射（mapGraphError + toGraphAppError）。
2. 但目前仅在目录搜索域使用，未成为前端全局 Graph 错误底座。

## 后端 server

### 4. downloadGraph 存在重复包裹 GraphError 的模式

位置：

1. [server/download/downloadGraph.ts](server/download/downloadGraph.ts#L156)
2. [server/download/downloadGraph.ts](server/download/downloadGraph.ts#L160)

理由：

1. 先 sendGraphRequest，再 catch 后 toGraphAppError 二次包裹。
2. 同一映射职责在调用点重复，容易产生行为差异。

### 5. OBO token 失败与 Graph REST 失败共用 GraphError 类型

位置：

1. [server/auth.ts](server/auth.ts#L614)

理由：

1. 语义上它是身份/令牌交换上游失败，不是 Graph REST 调用失败。
2. 当前可运行，但在可观测性和问题定位上容易混淆错误来源。
