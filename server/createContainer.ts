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
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: MSAL.LogLevel.Verbose,
    },
  },
};

const confidentialClient = new MSAL.ConfidentialClientApplication(msalConfig);

export const createContainer = async (req: Request, res: Response) => {
  if (!req.headers.authorization) {
    res.send(401, { message: "No access token provided." });
    return;
  }

  const [bearer, token] = (req.headers.authorization || "").split(" ");

  const [graphSuccess, graphTokenRequest] = await getGraphToken(
    confidentialClient,
    token,
    serverConfig.graphBaseUrl,
  );

  if (!graphSuccess) {
    res.send(200, graphTokenRequest);
    return;
  }

  const authProvider = (callback: MSGraph.AuthProviderCallback) => {
    callback(null, graphTokenRequest);
  };

  try {
    const graphClient = MSGraph.Client.init({
      authProvider: authProvider,
      defaultVersion: "beta",
      baseUrl: serverConfig.graphBaseUrl,
      customHosts: new Set([new URL(serverConfig.graphBaseUrl).hostname]),
    });

    const containerRequestData = {
      displayName: req.body!.displayName,
      description: req.body?.description ? req.body.description : "",
      containerTypeId: serverConfig.containerTypeId,
    };

    const graphResponse = await graphClient
      .api(`storage/fileStorage/containers`)
      .post(containerRequestData);

    res.send(200, graphResponse);
    return;
  } catch (error: any) {
    res.send(500, { message: `Failed to create container: ${error.message}` });
    return;
  }
};
