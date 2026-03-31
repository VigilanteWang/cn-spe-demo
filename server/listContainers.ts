import { Request, Response } from "restify";
import * as MSAL from "@azure/msal-node";
require("isomorphic-fetch");
import * as MSGraph from "@microsoft/microsoft-graph-client";
import { getGraphToken } from "./auth";
import { serverConfig } from "./config";

const msalConfig: MSAL.Configuration = {
  auth: {
    clientId: serverConfig.clientId,
    authority: serverConfig.authority,
    clientSecret: serverConfig.clientSecret,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel: any, message: any, containsPii: any) {
        //console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: MSAL.LogLevel.Verbose,
    },
  },
};

const confidentialClient = new MSAL.ConfidentialClientApplication(msalConfig);

export const listContainers = async (req: Request, res: Response) => {
  if (!req.headers.authorization) {
    res.send(401, { message: "No access token provided." });
    return;
  }

  const [bearer, token] = (req.headers.authorization || "").split(" ");

  const [graphSuccess, oboGraphToken] = await getGraphToken(
    confidentialClient,
    token,
    serverConfig.graphBaseUrl,
  );

  if (!graphSuccess) {
    res.send(200, oboGraphToken);
    return;
  }

  const authProvider = (callback: MSGraph.AuthProviderCallback) => {
    callback(null, oboGraphToken);
  };

  try {
    const graphClient = MSGraph.Client.init({
      authProvider: authProvider,
      defaultVersion: "beta",
      baseUrl: serverConfig.graphBaseUrl,
      customHosts: new Set([new URL(serverConfig.graphBaseUrl).hostname]),
    });

    const graphResponse = await graphClient
      .api(
        `storage/fileStorage/containers?$filter=containerTypeId eq ${serverConfig.containerTypeId}`,
      )
      .get();

    res.send(200, graphResponse);
    return;
  } catch (error: any) {
    res.send(500, { message: `Unable to list containers: ${error.message}` });
    return;
  }
};
