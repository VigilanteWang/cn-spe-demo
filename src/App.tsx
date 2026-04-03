/**
 * 应用主组件与身份验证入口
 *
 * 本模块负责：
 * 1. 集成 Microsoft Graph Toolkit (MGT) 的 Login 组件，管理用户身份验证
 * 2. 维护全局登录状态，监听身份验证状态变化
 * 3. 根据登录状态条件性渲染容器管理界面
 * 4. 应用 Fluent Design System 主题
 *
 * 身份验证流程：
 * - <Login /> 组件自动初始化 Entra ID 登录，创建全局 provider
 * - useIsSignedIn() hook 订阅 provider 状态变化
 * - 当用户登录时，SpEmbedded 服务可以使用全局 token 调用后端 API
 * - 当用户登出时，UI 隐藏容器管理界面
 *
 * 技术栈：
 * - React hooks (useState, useEffect) 用于状态管理
 * - Fluent UI React 组件库提供现代化 UI
 * - MGT (Microsoft Graph Toolkit) 处理 Entra ID 集成
 *
 * 全局状态管理注意：
 * - 不使用专门的状态管理库（如 Redux），直接用 React hooks
 * - Providers.globalProvider 是 MGT 的全局单例，所有子组件都能访问
 * - 子组件通过 SpEmbedded 服务类与后端通信，后端验证权限
 */

import React, { useState, useEffect } from "react";
import { Providers, ProviderState } from "@microsoft/mgt-element";
import { Login } from "@microsoft/mgt-react";
import {
  FluentProvider,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { customTheme } from "./customTheme";
import Containers from "./components/containers";

const useStyles = makeStyles({
  appContainer: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  topBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1px 15px",
  },
  title: {
    color: tokens.colorBrandForeground1,
    margin: "15px 0",
  },
});

/**
 * 登录状态 Hook
 *
 * 功能：
 * 1. 初始化时检查全局 provider 的登录状态
 * 2. 订阅 provider 的状态变化事件
 * 3. 当状态变化时更新本地状态
 * 4. 组件卸载时清除监听器，避免内存泄漏
 *
 * 返回值：
 * - boolean: true 表示用户已登录，false 表示未登录或已登出
 *
 * 使用示例：
 * ```
 * const isSignedIn = useIsSignedIn();
 * if (isSignedIn) {
 *   return <Containers />; // 显示容器管理界面
 * } else {
 *   return <Text>Please sign in</Text>; // 显示登录提示
 * }
 * ```
 *
 * 设计模式：
 * - 这是一个自定义 React hook，遵循 hook 规则
 * - 通过事件监听实现响应式更新，而非 polling
 * - 在 useEffect cleanup 函数中及时移除监听器
 */
function useIsSignedIn() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    // ── 检查登录状态的异步函数 ────────────────────────────────────────
    const updateState = async () => {
      const provider = Providers.globalProvider;
      setIsSignedIn(provider && provider.state === ProviderState.SignedIn);
    };

    // ── 监听 provider 状态变化 ─────────────────────────────────────────
    // 每当用户登录/登出时，MGT 会触发此回调
    Providers.onProviderUpdated(updateState);

    // ── 初始化：检查当前状态 ───────────────────────────────────────────
    updateState();

    // ── 清理：移除监听器 ────────────────────────────────────────────────
    // 这是 useEffect cleanup 函数，组件卸载或依赖变化时自动调用
    return () => {
      Providers.removeProviderUpdatedListener(updateState);
    };
  }, []);

  return isSignedIn;
}

/**
 * 应用主组件
 *
 * 责任：
 * 1. 提供 Fluent Design 主题包裹整个应用
 * 2. 渲染应用顶部横幅（标题 + 登录按钮）
 * 3. 条件性渲染内容区域：
 *    - 已登录：显示容器管理界面 (<Containers />)
 *    - 未登录：只显示标题和登录按钮
 *
 * 组件关系：
 * ```
 * <App>
 *   <FluentProvider>         // 主题提供者
 *     <topBanner>
 *       <title>
 *       <Login/>             // MGT 提供的登录按钮
 *     </topBanner>
 *     {isSignedIn && <Containers />}  // 只有登录后才显示
 *   </FluentProvider>
 * </App>
 * ```
 */
function App() {
  const isSignedIn = useIsSignedIn();
  const styles = useStyles();

  // ── 弃用的代码参考 ────────────────────────────────────────────────────
  // 以下代码曾用来处理权限提示，但已被弃用：
  // 1. 创建独立的 PublicClientApplication 实例会导致登录状态不同步
  // 2. 现已改为复用全局 provider 的 token，确保一致性
  // 参见 spembedded.ts 中的 getApiAccessToken() 方法

  // const promptForContainerConsent = async (event: CustomEvent<undefined>): Promise<void> => {
  //   const containerScopes = {
  //     scopes: [Scopes.SPEMBEDDED_FILESTORAGECONTAINER_SELECTED],
  //     redirectUri: `${window.location.protocol}://${window.location.hostname}${(window.location.port === '80' || window.location.port === '443') ? '' : ':' + window.location.port}`
  //   };
  //   ...
  // }

  return (
    <FluentProvider theme={customTheme}>
      <div className={styles.appContainer}>
        <div className={styles.topBanner}>
          <Text size={600} weight="bold" className={styles.title}>
            SharePoint Embedded Demo App
          </Text>
          <Login loginView="compact" />
        </div>
        {/* ── 条件渲染：只在登录后显示容器管理面板 ────────────────────── */}
        {isSignedIn && <Containers />}
      </div>
    </FluentProvider>
  );
}
export default App;

// Addtional details on the globalProvider:
/*
 <Login /> 组件来自 @microsoft/mgt-react，它是 Microsoft Graph Toolkit 的一部分。
 它的作用是在 UI 上提供一个登录按钮，帮助用户通过 Microsoft 身份验证登录，并在登录后显示用户信息或登出按钮。

幕后原理：

<Login /> 组件会自动检测 Providers.globalProvider 的状态（你在 index.tsx 里设置的 Msal2Provider）。
当用户点击登录时，<Login /> 会调用 Providers.globalProvider.login()，实际就是 Msal2Provider 的登录方法。
Msal2Provider 内部使用 @azure/msal-browser 的 PublicClientApplication 实例，但这个实例是由 Msal2Provider 自己管理的，不是你在 App.tsx 里 new 的那个(上方被comment掉的代码)。
你在 index.tsx 里配置的 clientId、authority、scopes 等参数，会传递给 Msal2Provider，进而用于初始化它内部的 msalInstance。
 */

// What if there is no <login /> component?
// 查看index.tsx中的初始化Provider config
/*
import { Providers } from "@microsoft/mgt-element";

// 检查 provider 是否存在
const provider = Providers.globalProvider;
if (provider) {
  if (provider.state !== 2) { // 2 === ProviderState.SignedIn
    // 触发登录流程（弹窗或重定向，取决于 provider 配置）
    await provider.login();
  } else {
    // 已登录，可以获取 token
    const token = await provider.getAccessToken({ scopes: ["User.Read"] });
    console.log(token);
  }
} else {
  // provider 未初始化，无法登录
  console.log("Provider not initialized");
}
*/
