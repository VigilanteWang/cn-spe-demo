import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { Providers } from "@microsoft/mgt-element";
import type { GraphEndpoint } from "@microsoft/mgt-element";
import { Msal2Provider } from "@microsoft/mgt-msal2-provider";
import { clientConfig } from "./common/config";
import * as Scopes from "./common/scopes";

Providers.globalProvider = new Msal2Provider({
  clientId: clientConfig.clientEntraAppClientId,
  authority: clientConfig.authority,
  scopes: [
    ...Scopes.GRAPH_OPENID_CONNECT_BASIC,
    // 使用相对格式（不含资源 URI 前缀），与 AAD token 响应中的 scope 格式保持一致。
    // 若使用完整 URL 格式 "https://graph.microsoft.com/FileStorageContainer.Selected"，
    // AAD 返回时会去掉前缀，导致 MSAL 缓存 key 不匹配，每次 acquireTokenSilent 均报
    // NO_CACHED_ACCESS_TOKEN，触发不必要的 refresh_token 网络请求（约 400ms/次）。
    Scopes.SPEMBEDDED_FILESTORAGECONTAINER_SELECTED,
    // 读取组织内用户的 Teams 在线状态，用于文件列表中显示修改者的 PresenceBadge
    Scopes.GRAPH_PRESENCE_READ_ALL,
    // 读取组织内用户头像缩略图，用于人员列优先显示真实头像
    Scopes.GRAPH_PROFILE_PHOTO_READ_ALL,
  ],
  baseURL: clientConfig.graphBaseUrl as GraphEndpoint,
  customHosts: [new URL(clientConfig.graphBaseUrl).hostname],
});
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
