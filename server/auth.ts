/**
 * 权限验证和 Token 处理模块
 *
 * 本模块负责：
 * 1. 验证前端发来的 Access Token 是否有效
 * 2. 检查 Token 中是否有必要的权限 (Container.Manage)
 * 3. 使用 OBO (On-Behalf-Of) 流程获取 Graph API 的 Token
 * 4. 创建用于调用 Microsoft Graph API 的客户端
 *
 * 核心概念解释：
 * - JWT (JSON Web Token): 一种标准的身份验证令牌格式，包含 3 部分用.分隔:
 *   * Header: 说明使用的加密算法（如 RS256）
 *   * Payload: 包含声明 (claims)，如用户身份、权限、过期时间等
 *   * Signature: 用服务器私钥签署的数字签名，用来验证 token 未被篡改
 *
 * - JWKS (JSON Web Key Set): 微软 Entra ID 发布的公钥集合，用来验证 JWT 签名
 *   * 类似于网站的 SSL 证书，用来证明 JWT 确实来自微软官方
 *   * 地址根据 token 版本不同而不同（v1.0 vs v2.0）
 *
 * - Access Token 版本：
 *   * v1.0: 旧版本，issuer 为 sts.windows.net（全球）或 sts.chinacloudapi.cn（中国）
 *   * v2.0: 新版本，issuer 为 login.microsoftonline.com（全球）或 login.partner.microsoftonline.cn（中国）
 *   * 两版本都有效，本模块同时支持
 *
 * - Scope: 权限标记，如 "Container.Manage" 表示能管理容器
 *   * Token 的 scp claim 包含拥有的所有权限，以空格分隔
 */

import { Client } from "@microsoft/microsoft-graph-client";
import {
  ConfidentialClientApplication,
  Configuration,
  LogLevel,
} from "@azure/msal-node";
import {
  JwtHeader,
  JwtPayload,
  SigningKeyCallback,
  VerifyErrors,
  decode,
  verify,
} from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { Request } from "restify";
require("isomorphic-fetch");
import {
  SPEMBEDDED_CONTAINER_MANAGE,
  SPEMBEDDED_FILESTORAGECONTAINER_SELECTED,
} from "./common/scopes";
import { serverConfig } from "./config";

/**
 * API Access Token 中包含的声明 (Claims)
 *
 * JWT token 的 payload 包含这些信息：
 * - scp: 权限范围，如 "FileStorageContainer.Selected Container.Manage"（空格分隔）
 * - tid: 租户 ID，表示该 token 属于哪个 Azure 租户，用来防止跨租户攻击
 * - ver: token 版本，"1.0" 或 "2.0"，决定了 token 的签名方式和 issuer 格式
 *
 * JwtPayload 是 jsonwebtoken 库提供的基础类型，包含：
 * - iss (issuer): 谁签发的 token
 * - aud (audience): 这个 token 的目标对象（通常是我们的 API 客户端 ID）
 * - exp (expiration): 过期时间（Unix 时间戳）
 * - iat (issued at): 签发时间
 * - sub (subject): token 代表的用户 ID
 */
type ApiAccessTokenClaims = JwtPayload & {
  scp?: string; // 权限范围
  tid?: string; // 租户 ID
  ver?: string; // token 版本 ("1.0" 或 "2.0")
  oid?: string; // Azure AD Object ID —— 稳定的用户身份标识符，不随会话变化
};

/**
 * 权限验证成功的返回结果
 * ok: true 表示验证通过
 * token: 原始 access token 字符串
 * claims: 已提取的 token 声明
 */
type AuthorizationSuccess = {
  ok: true;
  token: string;
  claims: ApiAccessTokenClaims;
};

/**
 * 权限验证失败的返回结果
 * ok: false 表示验证失败
 * status: HTTP 状态码（401 = 无效 token，403 = 无权限）
 * body: 返回给前端的错误信息
 */
type AuthorizationFailure = {
  ok: false;
  status: number;
  body: {
    message: string;
  };
};

/**
 * 权限验证的结果类型，可以是成功或失败
 * TypeScript 联合类型：使函数返回类型更准确
 */
type AuthorizationResult = AuthorizationSuccess | AuthorizationFailure;

// 从 Graph API 基础 URL 中提取主机名（如 "graph.microsoft.com")
// 用来设置 Graph 客户端的 customHosts，确保只调用来自该主机的 API
const graphHost = new URL(serverConfig.graphBaseUrl).hostname;

/**
 * 接受的 Audience (aud claim)
 *
 * Token 中的 aud claim 表示该 token 的目标用户
 * 我们接受两种格式的 audience ID：
 * 1. 直接的客户端 ID（如 "23cde6e4-7c2b-4201-a46a-c62e01194b4b"）
 * 2. api:// 前缀格式（如 "api://23cde6e4-7c2b-4201-a46a-c62e01194b4b"）
 * 两种格式都表示这个 token 是为我们的 API 签发的
 */
const acceptedAudiences = [
  serverConfig.clientId,
  `api://${serverConfig.clientId}`,
];

/**
 * 不同云环境的 Entra ID 端点配置
 *
 * Microsoft 有两套云服务：
 * 1. Global (全球): 普通的 Azure 环境
 * 2. China (中国): 21Vianet 运营的特殊环境，使用不同的服务器
 *
 * 每套环境中，token 版本不同对应不同的 issuer 主机：
 * - v1.0 tokens: 旧格式，issuer 是 sts.windows.net 或 sts.chinacloudapi.cn
 * - v2.0 tokens: 新格式，issuer 是 login.microsoftonline.com 或 login.partner.microsoftonline.cn
 *
 * discoveryHost: 用来获取公钥的地址，不同的 host 托管不同的密钥端点
 */
const identityEndpointsByCloud = {
  global: {
    v1IssuerHost: "https://sts.windows.net", // v1.0 token 的签发者
    v2IssuerHost: "https://login.microsoftonline.com", // v2.0 token 的签发者
    discoveryHost: "https://login.microsoftonline.com", // 获取公钥的地址
  },
  china: {
    v1IssuerHost: "https://sts.chinacloudapi.cn", // 中国环境的 v1.0 issuer
    v2IssuerHost: "https://login.partner.microsoftonline.cn", // 中国环境的 v2.0 issuer
    discoveryHost: "https://login.chinacloudapi.cn", // 中国环境的公钥地址
  },
} as const;

// 根据 serverConfig.cloudEnv（来自环境变量）选择对应云的配置
const identityEndpoints = identityEndpointsByCloud[serverConfig.cloudEnv];

/**
 * JWKS (JSON Web Key Set) 客户端
 *
 * JWKS 是微软 Entra ID 公布的公钥集合，格式如下：
 * {
 *   "keys": [
 *     { "kty": "RSA", "use": "sig", "kid": "...", "n": "...", "e": "...", ... },
 *     ...
 *   ]
 * }
 *
 * 我们需要两个 JWKS 客户端：
 * 1. v1.0: 从 .../discovery/keys 端点获取公钥（旧格式）
 * 2. v2.0: 从 .../discovery/v2.0/keys 端点获取公钥（新格式）
 *
 * 配置说明：
 * - jwksUri: JWKS 端点地址，包含租户 ID（确保只获取该租户的密钥）
 * - cache: true = 启用本地缓存，避免每次验证都网络请求
 * - cacheMaxAge: 10 分钟，10 分钟后缓存失效，重新获取最新密钥
 * - rateLimit: true = 防止密钥更新时的网络洪泛
 */
const jwksClients = {
  "1.0": jwksClient({
    // v1.0 token 的公钥端点
    jwksUri: `${identityEndpoints.discoveryHost}/${serverConfig.tenantId}/discovery/keys`,
    cache: true, // 启用缓存，减少网络请求
    cacheMaxAge: 10 * 60 * 1000, // 缓存保留 10 分钟
    rateLimit: true, // 防止缓存失效时频繁请求
  }),
  "2.0": jwksClient({
    // v2.0 token 的公钥端点（注意路径中有 /v2.0/）
    jwksUri: `${identityEndpoints.discoveryHost}/${serverConfig.tenantId}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxAge: 10 * 60 * 1000,
    rateLimit: true,
  }),
};

/**
 * MSAL (Microsoft Authentication Library) Node.js 配置
 *
 * MSAL 用来获取 token 和执行 OBO (On-Behalf-Of) 流程
 * OBO 流程：取前端传来的 user token → 用 API app 的密钥换成 Graph API token
 * 这样保护了 API 密钥不会直接暴露给前端
 *
 * 配置项说明：
 * - clientId: API app 的应用程序 ID
 * - authority: Entra ID 认证端点（如 https://login.microsoftonline.com/{tenantId}）
 * - clientSecret: API app 的密钥，用来证明我们的身份（必须保密！）
 *
 * system 日志配置：
 * - piiLoggingEnabled: false 防止日志中记录敏感信息
 * - logLevel: Warning 只记录警告和错误，减少日志噪音
 */
const msalConfig: Configuration = {
  auth: {
    clientId: serverConfig.clientId,
    authority: serverConfig.authority,
    clientSecret: serverConfig.clientSecret,
  },
  system: {
    loggerOptions: {
      loggerCallback() {
        return; // 忽略日志输出
      },
      piiLoggingEnabled: false, // 不记录个人身份信息
      logLevel: LogLevel.Warning, // 只记录警告级别及以上
    },
  },
};

// 创建 MSAL 机密客户端实例，用于 OBO 流程
const confidentialClient = new ConfidentialClientApplication(msalConfig);

/**
 * 根据 token 版本获取预期的 issuer
 *
 * Token 中的 iss claim 必须与预期的 issuer 完全匹配，否则验证失败
 * 这是防止伪造 token 的重要安全检查
 *
 * v1.0 token 的 issuer 格式：
 *   https://sts.windows.net/{tenantId}/   (全球)
 *   https://sts.chinacloudapi.cn/{tenantId}/   (中国)
 *
 * v2.0 token 的 issuer 格式：
 *   https://login.microsoftonline.com/{tenantId}/v2.0   (全球)
 *   https://login.partner.microsoftonline.cn/{tenantId}/v2.0   (中国)
 *
 * @param tokenVersion token 的 ver claim，"1.0" 或 "2.0"
 * @returns 该版本应该拥有的 issuer 字符串
 */
const getExpectedIssuer = (tokenVersion: string): string => {
  if (tokenVersion === "2.0") {
    // v2.0 token 的 issuer 包含 /v2.0 后缀
    return `${identityEndpoints.v2IssuerHost}/${serverConfig.tenantId}/v2.0`;
  }

  // 默认为 v1.0，issuer 以斜杠结尾，不包含版本号
  return `${identityEndpoints.v1IssuerHost}/${serverConfig.tenantId}/`;
};

/**
 * 根据 token 版本获取对应的 JWKS 客户端
 *
 * 每个 token 版本有不同的 JWKS 端点，需要使用对应的客户端
 * 客户端会自动处理缓存和网络请求
 *
 * @param tokenVersion "1.0" 或 "2.0"
 * @returns 该版本对应的 JWKS 客户端实例
 */
const getJwksClient = (tokenVersion: string) => {
  return tokenVersion === "2.0" ? jwksClients["2.0"] : jwksClients["1.0"];
};

/**
 * 无验证解码 token
 *
 * 这一步只是把 token 分解成结构，NOT 验证签名！
 * 用途：快速获取 ver 和 tid claim，决定后续用哪个 JWKS 客户端和 issuer
 *
 * JWT token 结构：header.payload.signature
 * decode() 只是 base64 解码 payload 部分，不检查签名有效性
 * 签名验证在 verifyAccessToken() 中进行
 *
 * 重要：永远不要信任来自 decode() 的数据！只能作为路由决策
 * 签名验证后才能真正信任这些 claims
 *
 * @param token JWT token 字符串
 * @returns 解码后的 token claims（未验证）
 * @throws 如果 token 格式无效
 */
const decodeTokenClaims = (token: string): ApiAccessTokenClaims => {
  const decoded = decode(token); // base64 解码，不验证签名

  if (!decoded || typeof decoded === "string") {
    throw new Error("Unable to decode access token claims.");
  }

  return decoded as ApiAccessTokenClaims;
};

/**
 * 从 JWKS 获取用来验证 token 签名的公钥
 *
 * Token 的 header 中有一个 kid (Key ID) 字段
 * 该字段指向 JWKS 中的某个公钥，我们需要找到它并用来验证签名
 *
 * 过程：
 * 1. Token header 说："我是用 kid=xyz 的密钥签的"
 * 2. 我们从 JWKS 中查找 kid=xyz 的公钥
 * 3. 用这个公钥验证 token 的签名
 *
 * kid 的作用：
 * - 微软定期轮换密钥对（为了安全）
 * - 每个密钥对有唯一的 kid
 * - JWKS 包含目前有效的所有密钥对
 * - Token 指明是用哪个密钥签的，我们就用那个来验证
 *
 * @param tokenVersion "1.0" 或 "2.0"
 * @param header JWT header，包含 kid 和加密算法信息
 * @param callback Node.js 风格回调：(error, publicKey) => void
 */
const getSigningKey = (
  tokenVersion: string,
  header: JwtHeader,
  callback: SigningKeyCallback,
): void => {
  if (!header.kid) {
    // kid 缺失 = token 无效，无法验证签名
    callback(new Error("Access token is missing a key identifier."));
    return;
  }

  // 用对应版本的 JWKS 客户端查找该 kid 的公钥
  getJwksClient(tokenVersion).getSigningKey(header.kid, (error, key) => {
    if (error) {
      callback(error);
      return;
    }

    // 从 JWKS 密钥对象中提取公钥部分，传给回调
    callback(null, key?.getPublicKey());
  });
};

/**
 * 验证 access token 的有效性
 *
 * 这是本模块最重要的安全检查，确保：
 * 1. Token 签名有效（用正确的公钥能验证）
 * 2. Token 的 audience 是我们的 API
 * 3. Token 的 issuer 是微软 Entra ID
 * 4. Token 的租户 ID 匹配我们的租户
 * 5. Token 未过期
 *
 * 验证步骤详解：
 * 1. 无验证解码获取 ver claim（决定用哪个 JWKS）
 * 2. 从解码的 claims 中提取 tid，检查是否与 serverConfig.tenantId 匹配
 * 3. 构建该版本应该拥有的 issuer
 * 4. 使用 jsonwebtoken.verify() 进行完整验证：
 *    - 获取 token header 中的 kid
 *    - 从 JWKS 通过 kid 查找对应的公钥
 *    - 用公钥验证 token 的 RS256 签名
 *    - 验证 aud 是否在 acceptedAudiences 中
 *    - 验证 iss 是否等于 expectedIssuer
 *    - 验证 token 未过期（由 verify() 自动检查）
 *
 * @param token JWT token 字符串
 * @returns 验证通过后的 token claims
 * @throws 如果任何验证步骤失败
 */
const verifyAccessToken = async (
  token: string,
): Promise<ApiAccessTokenClaims> => {
  /** 先做无验证解码，快速获取 ver 和 tid，用于选择对应的 JWKS 客户端和 issuer。 */
  const decodedClaims = decodeTokenClaims(token);
  const tokenVersion = decodedClaims.ver === "2.0" ? "2.0" : "1.0";
  const expectedIssuer = getExpectedIssuer(tokenVersion);

  /** 租户隔离：确保 token 归属于本服务的租户，防止跨租户访问。 */
  if (decodedClaims.tid !== serverConfig.tenantId) {
    throw new Error("Access token tenant does not match API tenant.");
  }

  /** jsonwebtoken.verify 执行完整的签名验证和 claims 校验。 */
  return new Promise((resolve, reject) => {
    verify(
      token,
      (header, callback) => getSigningKey(tokenVersion, header, callback),
      {
        algorithms: ["RS256"],
        audience: acceptedAudiences,
        issuer: expectedIssuer,
      },
      (error: VerifyErrors | null, decoded?: JwtPayload | string) => {
        if (error) {
          reject(error);
          return;
        }

        if (!decoded || typeof decoded === "string") {
          reject(new Error("Unable to decode access token claims."));
          return;
        }

        /** 验证成功，返回已验证的 claims。 */
        resolve(decoded as ApiAccessTokenClaims);
      },
    );
  });
};

/**
 * 检查 token 是否拥有必要的权限
 *
 * Token 的 scp claim 包含空格分隔的权限列表，如：
 * "FileStorageContainer.Selected Container.Manage"
 *
 * 我们的 API 需要 Container.Manage 权限才能允许容器操作
 *
 * 逻辑：
 * 1. 获取 scp claim（没有则默认为空字符串）
 * 2. 按空格分割成权限数组
 * 3. 过滤掉空字符串（split 可能产生）
 * 4. 检查数组中是否包含 "Container.Manage"
 *
 * @param claims token 的声明
 * @returns true 如果有 Container.Manage 权限，否则 false
 */
const hasRequiredScope = (claims: ApiAccessTokenClaims): boolean => {
  /** 拆分权限列表并过滤多余空项。 */
  const scopes = (claims.scp ?? "").split(" ").filter(Boolean);

  /** 检查是否包含所需的 Container.Manage 权限。 */
  return scopes.includes(SPEMBEDDED_CONTAINER_MANAGE);
};

/**
 * 权限验证的主入口函数 - API 路由会调用此函数
 *
 * 完整的验证流程：
 * 1. 从 HTTP 请求 header 中提取 Authorization token
 * 2. 检查格式是否为 "Bearer <token>"
 * 3. 验证 token 的签名和声明
 * 4. 检查 token 是否有 Container.Manage 权限
 *
 * HTTP 状态码约定：
 * - 401: token 不存在、格式错误、签名无效、或其他验证失败 (Unauthorized)
 * - 403: token 有效但权限不足 (Forbidden)
 * - 200: 验证成功（由调用者处理）
 *
 * @param req restify Request 对象，包含 HTTP headers
 * @returns AuthorizationResult，包含验证结果和错误信息
 *
 * 使用示例：
 * ```ts
 * const result = await authorizeContainerManageRequest(req);
 * if (!result.ok) {
 *   res.send(result.status, result.body);
 *   return;
 * }
 * // result.token 和 result.claims 已验证，可以安全使用
 * ```
 */
export const authorizeContainerManageRequest = async (
  req: Request,
): Promise<AuthorizationResult> => {
  /** 从请求头中提取 Authorization 字段。 */
  const authorizationHeader = req.headers.authorization;

  /** token 不存在则直接返回 401。 */
  if (!authorizationHeader) {
    return {
      ok: false,
      status: 401,
      body: { message: "No access token provided." },
    };
  }

  /** 拆分 scheme 和 token，不允许多余部分，防止格式注入。 */
  const [scheme, token, ...extraParts] = authorizationHeader
    .trim()
    .split(/\s+/);

  if (scheme !== "Bearer" || !token || extraParts.length > 0) {
    return {
      ok: false,
      status: 401,
      body: { message: "Authorization header must use Bearer token format." },
    };
  }

  try {
    /** 验证 token 签名和 claims。 */
    const claims = await verifyAccessToken(token);

    /** 签名有效后再校验权限，遵循最小权限验证顺序。 */
    if (!hasRequiredScope(claims)) {
      return {
        ok: false,
        status: 403,
        body: {
          message: `Access token is missing required scope ${SPEMBEDDED_CONTAINER_MANAGE}.`,
        },
      };
    }

    /** 所有检查通过，返回带有已验证令牌和 claims 的成功结果。 */
    return {
      ok: true,
      token,
      claims,
    };
  } catch (error: any) {
    /** 任何验证异常都统一转为 401，避免向客户端泄露内部信息。 */
    return {
      ok: false,
      status: 401,
      body: { message: `Invalid access token: ${error.message}` },
    };
  }
};

/**
 * 执行 OBO (On-Behalf-Of) 流程获取 Graph API token
 *
 * OBO 流程的目的和好处：
 * - 前端收集用户的 token（用户授权）
 * - 前端发送 token 给后端 API
 * - 后端 API 用自己的身份（clientSecret）交换一个 Graph API token
 * - 后端 API 用自己的 Graph token 调用 Microsoft Graph
 *
 * 好处：
 * 1. 后端可以访问用户能访问的资源（委托权限）
 * 2. 不需要前端直接持有 Graph token（前端更安全）
 * 3. 后端密钥（clientSecret）对前端隐藏（中间件隐藏），更安全
 * 4. 审计日志中由后端 API app 执行操作，而不是用户账户
 *
 * 你可以将其想象为：
 * 用户对前端说："我授权你代表我访问 Graph"
 * 前端对后端说："用户授权我代表他访问 Graph，这是 token"
 * 后端对 Entra ID 说："用户授权了前端，我用我的密钥证明前端的要求有效"
 * Entra ID 对后端说："好的，这是你可以代表用户使用的 Graph token"
 *
 * @param token 用户 token（来自 authorizeContainerManageRequest）
 * @returns Graph API 的 access token
 * @throws 如果 OBO 流程失败
 *
 * 使用示例：
 * ```ts
 * const graphToken = await getGraphToken(userToken);
 * const graphClient = createGraphClient(graphToken);
 * // 现在可以用 graphClient 代表用户调用 Graph API
 * ```
 */
export const getGraphToken = async (token: string): Promise<string> => {
  try {
    /** 构建 OBO 请求体，声明代理用户访问 Graph 所需的权限范围。 */
    const graphTokenRequest = {
      oboAssertion: token,
      scopes: [
        `${serverConfig.graphBaseUrl}/${SPEMBEDDED_FILESTORAGECONTAINER_SELECTED}`,
      ],
    };

    /** 通过 MSAL 机密客户端执行 OBO 令牌交换，得到 Graph 访问令牌。 */
    const oboGraphToken = (await confidentialClient.acquireTokenOnBehalfOf(
      graphTokenRequest,
    ))!.accessToken;

    return oboGraphToken;
  } catch (error: any) {
    throw new Error(
      `Unable to generate Microsoft Graph OBO token: ${error.message}`,
    );
  }
};

/**
 * 创建 Microsoft Graph API 客户端
 *
 * Graph API 客户端用来与微软 Graph API 通信，相当于一个 API 驱动程序
 * 它简化了 API 调用，提供了对象化的接口，而不需要手动构造 HTTP 请求
 *
 * 配置说明：
 * - authProvider: 提供 token 的函数，每次 API 调用时会被调用以获取最新 token
 * - defaultVersion: 使用 v1.0 API（稳定版），不用 beta（实验版）
 * - baseUrl: Graph API 的基础地址（全球或中国）
 * - customHosts: 限制只能访问该主机，防止被 SSRF 攻击
 *
 * @param accessToken Graph API 的有效 access token
 * @returns Microsoft Graph Client 实例，可以用来调用 API
 *
 * 使用示例：
 * ```ts
 * const graphClient = createGraphClient(graphToken);
 *
 * // 获取容器列表
 * const containers = await graphClient
 *   .api("/storage/fileStorage/containers")
 *   .version("v1.0")
 *   .filter(`containerTypeId eq '${typeId}'`)
 *   .get();
 *
 * // 创建容器
 * const newContainer = await graphClient
 *   .api("/storage/fileStorage/containers")
 *   .version("v1.0")
 *   .post({
 *     displayName: "My Container",
 *     containerTypeId: typeId,
 *   });
 * ```
 */
export const createGraphClient = (accessToken: string): Client => {
  return Client.init({
    /** 每次发起 API 请求前回调以提供最新访问令牌。 */
    authProvider: (callback) => {
      callback(null, accessToken);
    },
    defaultVersion: "v1.0",
    baseUrl: serverConfig.graphBaseUrl,
    customHosts: new Set([graphHost]),
  });
};
