/**
 * 应用主组件模块
 *
 * 本模块负责：
 * 1. 渲染应用的顶层布局（标题栏 + 登录按钮 + 主内容区）
 * 2. 监听用户登录状态变化（通过 useIsSignedIn hook）
 * 3. 根据登录状态决定是否显示容器管理界面
 * 4. 应用 Fluent UI 主题（自定义主题 customTheme）
 *
 * 组件树结构：
 *   <FluentProvider>        ← 提供 Fluent UI 主题上下文
 *     <div appContainer>    ← 全屏 flex 容器
 *       <div topBanner>     ← 顶部横幅：标题 + 登录按钮
 *         <Text />          ← 应用标题
 *         <Login />         ← MGT 登录按钮组件
 *       </div>
 *       <Containers />      ← 仅在已登录时渲染，容器管理主界面
 *     </div>
 *   </FluentProvider>
 *
 * 核心概念：
 * - <Login /> 来自 @microsoft/mgt-react（Microsoft Graph Toolkit），
 *   它自动使用 index.tsx 中初始化的 Providers.globalProvider (Msal2Provider)
 *   来完成登录/登出操作。用户点击登录时，底层调用 MSAL 的弹窗或重定向流程。
 * - useIsSignedIn 是自定义 hook，监听 globalProvider 状态变化，
 *   当用户登录/登出时自动刷新 UI。
 **/

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
 * 自定义 Hook：监听用户登录状态
 *
 * 工作原理：
 * 1. 初始化时注册 Provider 状态变化监听器
 * 2. 当 globalProvider 状态变为 SignedIn 时，setIsSignedIn(true)
 * 3. 当用户登出时，状态变回 false
 * 4. 组件卸载时移除监听器（cleanup），防止内存泄漏
 *
 * @returns boolean 当前是否已登录
 **/
function useIsSignedIn() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const updateState = async () => {
      const provider = Providers.globalProvider;
      setIsSignedIn(provider && provider.state === ProviderState.SignedIn);
    };

    Providers.onProviderUpdated(updateState);
    updateState();

    return () => {
      Providers.removeProviderUpdatedListener(updateState);
    };
  }, []);

  return isSignedIn;
}

function App() {
  const isSignedIn = useIsSignedIn();
  const styles = useStyles();

  //这段源代码不正确，不同于index里的globalProvider，这里PublicClientApplication，
  //完全是个全新的实例，不能使用全局的token，而且PublicClientApplication也没有initialize，不知原用途为何
  // 这里的<Login/> component利用的globalProvider进行了登录，获取了全局token。
  // spembedded.ts中的getApiAccessToken，也不正确，改为了复用全局的token

  // const promptForContainerConsent = async (event: CustomEvent<undefined>): Promise<void> => {
  //   const containerScopes = {
  //     scopes: [Scopes.SPEMBEDDED_FILESTORAGECONTAINER_SELECTED],
  //     redirectUri: `${window.location.protocol}://${window.location.hostname}${(window.location.port === '80' || window.location.port === '443') ? '' : ':' + window.location.port}`
  //   };

  //   console.log('promptForContainerConsent is called');

  //   const msalInstance = new PublicClientApplication({
  //     auth: {
  //       clientId: Constants.CLIENT_ENTRA_APP_CLIENT_ID,
  //       authority: Constants.CLIENT_ENTRA_APP_AUTHORITY,
  //     },
  //     cache: {
  //       cacheLocation: 'localStorage',
  //       storeAuthStateInCookie: false,
  //     },
  //   });

  //   msalInstance.acquireTokenSilent(containerScopes)
  //     .then(response => {
  //       console.log('tokenResponse', JSON.stringify(response));
  //     })
  //     .catch(async (error) => {
  //       //console.log(error);
  //       if (error instanceof InteractionRequiredAuthError) {
  //         return msalInstance.acquireTokenPopup(containerScopes);
  //       }
  //     });
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
