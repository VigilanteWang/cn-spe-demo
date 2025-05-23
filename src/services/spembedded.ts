import { Providers, ProviderState } from '@microsoft/mgt-element';
import * as Msal from '@azure/msal-browser';
import * as Constants from './../common/constants';
import * as Scopes from './../common/scopes';
import { IContainer } from './../common/IContainer';

export default class SpEmbedded {
    async getApiAccessToken() {
        // 重用全局 provider 已登录用户的 token，原代码会出现no account selected的错误
        const provider = Providers.globalProvider;
        if (provider.state === ProviderState.SignedIn) {
            try {
                const accessToken = await provider.getAccessToken({
                    scopes: [
                        `api://${Constants.CLIENT_ENTRA_APP_CLIENT_ID}/${Scopes.SPEMBEDDED_CONTAINER_MANAGE}`
                    ]
                });
                console.log(`Reusing token: ${accessToken}`);
                return accessToken;
            } catch (error) {
                console.error('Error getting token from global provider', error);
                return null;
            }
        } else {
            console.warn('Global provider is not signed in');
            return null;
        }
    };

    async listContainers(): Promise<IContainer[] | undefined> {
        const api_endpoint = `${Constants.API_SERVER_URL}/api/listContainers`;

        if (Providers.globalProvider.state === ProviderState.SignedIn) {
            const token = await this.getApiAccessToken();
            const containerRequestHeaders = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };
            const containerRequestOptions = {
                method: 'GET',
                headers: containerRequestHeaders
            };
            const response = await fetch(api_endpoint, containerRequestOptions);

            if (response.ok) {
                const containerResponse = await response.json();
                return (containerResponse.value)
                    ? (containerResponse.value) as IContainer[]
                    : undefined;
            } else {
                console.error(`Unable to list Containers: ${JSON.stringify(response)}`);
                return undefined;
            }
        }
    };

    async createContainer(containerName: string, containerDescription: string = ''): Promise<IContainer | undefined> {
        const api_endpoint = `${Constants.API_SERVER_URL}/api/createContainer`;

        if (Providers.globalProvider.state === ProviderState.SignedIn) {
            const token = await this.getApiAccessToken();
            const containerRequestHeaders = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            const containerRequestData = {
                displayName: containerName,
                description: containerDescription
            };
            const containerRequestOptions = {
                method: 'POST',
                headers: containerRequestHeaders,
                body: JSON.stringify(containerRequestData)
            };

            const response = await fetch(api_endpoint, containerRequestOptions);

            if (response.ok) {
                const containerResponse = await response.json();
                return containerResponse as IContainer;
            } else {
                console.error(`Unable to create container: ${JSON.stringify(response)}`);
                return undefined;
            }
        }
    };
}