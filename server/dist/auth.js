"use strict";
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
exports.getGraphToken = void 0;
require("isomorphic-fetch");
const getGraphToken = (confidentialClient, token, graphBaseUrl) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const graphTokenRequest = {
            oboAssertion: token,
            scopes: [`${graphBaseUrl}/FileStorageContainer.Selected`],
        };
        const oboGraphToken = (yield confidentialClient.acquireTokenOnBehalfOf(graphTokenRequest)).accessToken;
        return [true, oboGraphToken];
    }
    catch (error) {
        const errorResult = {
            status: 500,
            body: JSON.stringify({
                message: `Unable to generate Microsoft Graph OBO token: ${error.message}`,
                providedToken: token,
            }),
        };
        return [false, errorResult];
    }
});
exports.getGraphToken = getGraphToken;
