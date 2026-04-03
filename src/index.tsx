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
    `${clientConfig.graphBaseUrl}/${Scopes.SPEMBEDDED_FILESTORAGECONTAINER_SELECTED}`,
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
