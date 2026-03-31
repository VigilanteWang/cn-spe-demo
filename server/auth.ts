import { ConfidentialClientApplication } from "@azure/msal-node";
require("isomorphic-fetch");

export const getGraphToken = async (
  confidentialClient: ConfidentialClientApplication,
  token: string,
  graphBaseUrl: string,
): Promise<[boolean, string | any]> => {
  try {
    const graphTokenRequest = {
      oboAssertion: token,
      scopes: [`${graphBaseUrl}/FileStorageContainer.Selected`],
    };
    const oboGraphToken = (await confidentialClient.acquireTokenOnBehalfOf(
      graphTokenRequest,
    ))!.accessToken;

    return [true, oboGraphToken];
  } catch (error: any) {
    const errorResult = {
      status: 500,
      body: JSON.stringify({
        message: `Unable to generate Microsoft Graph OBO token: ${error.message}`,
        providedToken: token,
      }),
    };
    return [false, errorResult];
  }
};
