/**
 * Nitrolite Client (sdk-compat)
 *
 * Wraps NitroliteClient from @yellow-org/sdk-compat for the game server.
 * Auth, WebSocket, and signing are handled internally by the client.
 */
import WebSocket from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = WebSocket;
}

import { NitroliteClient, blockchainRPCsFromEnv, createECDSAMessageSigner } from '@yellow-org/sdk-compat';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import logger from '../utils/logger.js';

let clientInstance = null;
let serverAddress = null;
let sessionSigner = null;

export async function initializeRPCClient(url, privateKey) {
    if (clientInstance) return clientInstance;

    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey);
    serverAddress = account.address;

    const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(),
    });

    const blockchainRPCs = blockchainRPCsFromEnv();
    if (!blockchainRPCs[polygon.id]) {
        blockchainRPCs[polygon.id] = polygon.rpcUrls.default.http[0];
    }

    sessionSigner = createECDSAMessageSigner(formattedKey);

    clientInstance = await NitroliteClient.create({
        wsURL: url,
        walletClient,
        chainId: polygon.id,
        blockchainRPCs,
    });

    logger.system(`NitroliteClient initialized with address: ${serverAddress}`);

    // Backward-compatible interface expected by session files
    clientInstance.sessionKey = { address: serverAddress };
    clientInstance.sessionSigner = sessionSigner;
    clientInstance.address = serverAddress;

    // Expose a WebSocket-like interface for session files that send raw RPC
    // messages via rpcClient.ws.send() and listen via rpcClient.ws.on('message').
    // The compat client's underlying SDK client uses a dialer with a WebSocket.
    const innerWs = clientInstance.innerClient?._rpcClient?._dialer?.ws;
    if (innerWs) {
        clientInstance.ws = innerWs;
    } else {
        // Fallback: create a connected WS that the session files can use
        const rawWs = new WebSocket(url);
        await new Promise((resolve, reject) => {
            rawWs.onopen = resolve;
            rawWs.onerror = reject;
        });
        clientInstance.ws = rawWs;
        logger.warn('Using fallback raw WebSocket for session RPC (innerClient WS not accessible)');
    }

    // No-op ensureConnected since compat client manages its own connection
    clientInstance.ensureConnected = async () => {};

    return clientInstance;
}

export function getRPCClient() {
    if (!clientInstance) {
        throw new Error('RPC client not initialized. Call initializeRPCClient() first.');
    }
    return clientInstance;
}

export function getServerAddress() {
    return serverAddress;
}

export function getSessionSigner() {
    return sessionSigner;
}
