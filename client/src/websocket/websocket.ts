import { type Hex } from "viem";
import {
    Client,
    createSigners,
    EthereumMsgSigner,
    type StateSigner,
    type Channel,
    withErrorHandler,
} from "@yellow-org/sdk";
import { WalletStore } from "../store";
import { generateKeyPair, type CryptoKeypair } from "../context/createSigner";

// ===== Types =====

export const WebSocketReadyState = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
} as const;

export type WebSocketReadyState = (typeof WebSocketReadyState)[keyof typeof WebSocketReadyState];
export type WSStatus = "connected" | "connecting" | "disconnected" | "reconnecting" | "reconnect_failed" | "auth_failed" | "authenticating";

export interface WebSocketClientOptions {
    autoReconnect: boolean;
    reconnectDelay: number;
    maxReconnectAttempts: number;
    requestTimeout: number;
}

export interface WalletSigner {
    address: Hex;
    sign: (payload: any) => Promise<Hex>;
}

export const getAddressFromPublicKey = (publicKey: string): string => {
    const { ethers } = require("ethers");
    const formattedKey = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
    const hash = ethers.keccak256(formattedKey);
    const address = `0x${hash.slice(-40)}`;
    return ethers.getAddress(address);
};

// ===== Connection =====

export class WebSocketClient {
    private sdkClient: Client | null = null;
    private reconnectAttempts = 0;
    private reconnectTimeout: any = null;
    private statusHandlers: ((status: WSStatus) => void)[] = [];
    private messageHandlers: ((message: unknown) => void)[] = [];
    private errorHandlers: ((error: Error) => void)[] = [];
    private currentChannel: any = null;
    private nitroliteChannel: Channel | null = null;
    private sessionKey: CryptoKeypair | null = null;

    private url: string;
    private options: WebSocketClientOptions;

    constructor(
        url: string,
        _signer: WalletSigner,
        options: WebSocketClientOptions = {
            autoReconnect: true,
            reconnectDelay: 1000,
            maxReconnectAttempts: 5,
            requestTimeout: 10000,
        }
    ) {
        this.url = url;
        this.options = options;
    }

    onStatusChange(callback: (status: WSStatus) => void): void {
        this.statusHandlers.push(callback);
    }
    onMessage(callback: (message: unknown) => void): void {
        this.messageHandlers.push(callback);
    }
    onError(callback: (error: Error) => void): void {
        this.errorHandlers.push(callback);
    }

    get isConnected(): boolean {
        return this.sdkClient !== null;
    }
    get readyState(): WebSocketReadyState {
        return this.sdkClient ? WebSocketReadyState.OPEN : WebSocketReadyState.CLOSED;
    }
    get currentSubscribedChannel(): any {
        return this.currentChannel;
    }
    get currentNitroliteChannel(): Channel | null {
        return this.nitroliteChannel;
    }
    setNitroliteChannel(channel: Channel): void {
        this.nitroliteChannel = channel;
    }
    get currentSessionKey(): CryptoKeypair | null {
        return this.sessionKey;
    }
    get currentSessionSigner(): StateSigner | null {
        if (!this.sessionKey) return null;
        return new EthereumMsgSigner(this.sessionKey.privateKey as Hex);
    }

    async connect(): Promise<void> {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.isConnected) return;

        try {
            this.emitStatus("connecting");

            // Generate session key if not already created
            if (!this.sessionKey) {
                console.log("Generating new session key...");
                this.sessionKey = await generateKeyPair();
                console.log("Session key generated:", this.sessionKey.address);
            }

            this.emitStatus("authenticating");

            // Create signers from session key
            const { stateSigner, txSigner } = createSigners(this.sessionKey.privateKey as Hex);
            console.log("Created SDK signers, address:", stateSigner.getAddress());

            // Create SDK client - handles connection, auth, and ping internally
            this.sdkClient = await Client.create(
                this.url,
                stateSigner,
                txSigner,
                withErrorHandler((error: Error) => {
                    console.error("SDK client error:", error);
                    this.emitError(error);
                })
            );

            this.emitStatus("connected");
            this.reconnectAttempts = 0;

            // Fetch channels after connection
            try {
                const walletClient = WalletStore.getWalletClient();
                if (walletClient?.account?.address) {
                    const { channels } = await this.sdkClient.getChannels(walletClient.account.address as Hex);
                    console.log("Fetched channels:", channels?.length || 0);
                }
            } catch (channelError) {
                console.warn("Could not fetch channels:", channelError);
            }

        } catch (error) {
            this.emitStatus("auth_failed");
            this.emitError(error instanceof Error ? error : new Error(String(error)));
            this.sdkClient = null;
            this.handleReconnect();
            throw error;
        }
    }

    private handleReconnect(): void {
        if (!this.options.autoReconnect || this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
                this.emitStatus("reconnect_failed");
            }
            return;
        }
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectAttempts++;
        const delay = this.options.reconnectDelay * this.reconnectAttempts;
        this.emitStatus("reconnecting");
        this.reconnectTimeout = setTimeout(() => {
            this.connect().catch(() => {});
        }, delay);
    }

    close(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.sdkClient) {
            this.sdkClient.close().catch(console.error);
            this.sdkClient = null;
        }
        this.currentChannel = null;
        this.emitStatus("disconnected");
    }

    private emitStatus(status: WSStatus): void {
        this.statusHandlers.forEach((handler) => handler(status));
    }
    private emitError(error: Error): void {
        this.errorHandlers.forEach((handler) => handler(error));
    }

    /** Send a signed request - kept for backward compatibility but uses SDK client */
    async sendRequest(_signedRequest: string): Promise<unknown> {
        if (!this.sdkClient) throw new Error("SDK client not connected");
        // The SDK handles request signing internally now
        console.warn("sendRequest called but SDK handles requests internally");
        return {};
    }

    /** Ping the server */
    async ping(): Promise<unknown> {
        if (!this.sdkClient) throw new Error("SDK client not connected");
        await this.sdkClient.ping();
        return {};
    }

    /** Get the underlying SDK client */
    getSDKClient(): Client | null {
        return this.sdkClient;
    }
}

export function createWebSocketClient(url: string, signer: WalletSigner, options?: Partial<WebSocketClientOptions>): WebSocketClient {
    return new WebSocketClient(url, signer, {
        autoReconnect: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 5,
        requestTimeout: 10000,
        ...options,
    });
}
