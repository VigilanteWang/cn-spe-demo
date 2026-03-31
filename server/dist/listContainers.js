"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listContainers = void 0;
const MSAL = __importStar(require("@azure/msal-node"));
require("isomorphic-fetch");
const MSGraph = __importStar(require("@microsoft/microsoft-graph-client"));
const auth_1 = require("./auth");
const config_1 = require("./config");
const msalConfig = {
    auth: {
        clientId: config_1.serverConfig.clientId,
        authority: config_1.serverConfig.authority,
        clientSecret: config_1.serverConfig.clientSecret,
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                //console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: MSAL.LogLevel.Verbose,
        },
    },
};
const confidentialClient = new MSAL.ConfidentialClientApplication(msalConfig);
const listContainers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.headers.authorization) {
        res.send(401, { message: "No access token provided." });
        return;
    }
    const [bearer, token] = (req.headers.authorization || "").split(" ");
    const [graphSuccess, oboGraphToken] = yield (0, auth_1.getGraphToken)(confidentialClient, token, config_1.serverConfig.graphBaseUrl);
    if (!graphSuccess) {
        res.send(200, oboGraphToken);
        return;
    }
    const authProvider = (callback) => {
        callback(null, oboGraphToken);
    };
    try {
        const graphClient = MSGraph.Client.init({
            authProvider: authProvider,
            defaultVersion: "beta",
            baseUrl: config_1.serverConfig.graphBaseUrl,
            customHosts: new Set([new URL(config_1.serverConfig.graphBaseUrl).hostname]),
        });
        const graphResponse = yield graphClient
            .api(`storage/fileStorage/containers?$filter=containerTypeId eq ${config_1.serverConfig.containerTypeId}`)
            .get();
        res.send(200, graphResponse);
        return;
    }
    catch (error) {
        res.send(500, { message: `Unable to list containers: ${error.message}` });
        return;
    }
});
exports.listContainers = listContainers;
