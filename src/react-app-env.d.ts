/// <reference types="vite/client" />

/**
 * 扩展 Vite 的 ImportMetaEnv 接口，约束本项目前端所有环境变量类型。
 * 在 .env.*.local 文件中使用 VITE_ 前缀以确保变量注入到客户端 bundle。
 * 注意：VITE_ 前缀变量会打包进浏览器产物，绝不能放入 secret！
 */
interface ImportMetaEnv {
  /** 前端 Entra App 的客户端 ID（MSAL 登录用） */
  readonly VITE_CLIENT_ENTRA_APP_CLIENT_ID: string;
  /** Azure AD 租户 ID */
  readonly VITE_CLIENT_ENTRA_APP_TENANT_ID: string;
  /** 后端 API 的 Entra App 客户端 ID（构建 token scope 用） */
  readonly VITE_API_ENTRA_APP_CLIENT_ID: string;
  /** 后端 API 服务器地址（如 http://localhost:3001） */
  readonly VITE_API_SERVER_URL: string;
  /** 云环境选择："global"（默认）或 "china" */
  readonly VITE_CLOUD_ENV?: string;
  /** 自定义 Graph API 基础 URL（可选，通常由 VITE_CLOUD_ENV 自动推导） */
  readonly VITE_GRAPH_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
