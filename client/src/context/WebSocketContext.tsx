import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { Channel } from '@yellow-org/sdk-compat';
import { generateKeyPair } from "./createSigner";
import { useNitrolite } from "./NitroliteClientWrapper";

export interface CryptoKeypair {
    privateKey: string;
    publicKey?: string;
    address?: string;
}

export type WSStatus = "connected" | "connecting" | "disconnected" | "reconnecting" | "reconnect_failed" | "auth_failed" | "authenticating";

const CRYPTO_KEYPAIR_KEY = "crypto_keypair";

interface WebSocketContextProps {
    client: null;
    status: WSStatus;
    keyPair: CryptoKeypair | null;
    sessionKey: CryptoKeypair | null;
    wsChannel: Channel | null;
    currentNitroliteChannel: Channel | null;
    isConnected: boolean;
    hasKeys: boolean;
    generateKeys: () => Promise<CryptoKeypair | null>;
    connect: () => Promise<boolean>;
    disconnect: () => void;
    setNitroliteChannel: (channel: Channel) => void;
    clearKeys: () => void;
    sendPing: () => Promise<void>;
    sendRequest: (payload: string) => Promise<unknown>;
}

const WebSocketContext = createContext<WebSocketContextProps | undefined>(undefined);

/**
 * Simplified WebSocketProvider that no longer maintains a separate clearnode
 * WebSocket connection. NitroliteClient (from NitroliteClientWrapper) handles
 * all clearnode communication internally. This provider now only manages
 * session key generation and exposes connectivity state derived from
 * NitroliteClient.
 */
export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [keyPair, setKeyPair] = useState<CryptoKeypair | null>(null);
    const [sessionKey, setSessionKey] = useState<CryptoKeypair | null>(null);
    const [currentNitroliteChannel, setCurrentNitroliteChannel] = useState<Channel | null>(null);

    const { client: nitroliteClient, loading: nitroliteLoading } = useNitrolite();

    const status: WSStatus = nitroliteClient
        ? "connected"
        : nitroliteLoading
            ? "connecting"
            : "disconnected";

    const isConnected = !!nitroliteClient;

    useEffect(() => {
        if (typeof window === "undefined") return;

        const savedKeys = localStorage.getItem(CRYPTO_KEYPAIR_KEY);
        if (savedKeys) {
            try {
                const parsed = JSON.parse(savedKeys) as CryptoKeypair;
                setKeyPair(parsed);
                setSessionKey(parsed);
            } catch {
                localStorage.removeItem(CRYPTO_KEYPAIR_KEY);
                initKeys();
            }
        } else {
            initKeys();
        }

        async function initKeys() {
            const newKeyPair = await generateKeyPair();
            setKeyPair(newKeyPair);
            setSessionKey(newKeyPair);
            localStorage.setItem(CRYPTO_KEYPAIR_KEY, JSON.stringify(newKeyPair));
        }
    }, []);

    const generateKeys = useCallback(async () => {
        const newKeyPair = await generateKeyPair();
        setKeyPair(newKeyPair);
        setSessionKey(newKeyPair);
        if (typeof window !== "undefined") {
            localStorage.setItem(CRYPTO_KEYPAIR_KEY, JSON.stringify(newKeyPair));
        }
        return newKeyPair;
    }, []);

    const clearKeys = useCallback(() => {
        if (typeof window !== "undefined") {
            localStorage.removeItem(CRYPTO_KEYPAIR_KEY);
        }
        setKeyPair(null);
        setSessionKey(null);
    }, []);

    const setNitroliteChannel = useCallback((channel: Channel) => {
        setCurrentNitroliteChannel(channel);
    }, []);

    const connect = useCallback(async () => {
        return isConnected;
    }, [isConnected]);

    const disconnect = useCallback(() => {
        // NitroliteClient lifecycle is managed by NitroliteClientWrapper
    }, []);

    const sendPing = useCallback(async () => {
        if (nitroliteClient) {
            await nitroliteClient.ping();
        }
    }, [nitroliteClient]);

    const sendRequest = useCallback(async (_payload: string) => {
        throw new Error("Direct RPC requests are no longer supported. Use NitroliteClient methods instead.");
    }, []);

    const value = useMemo(
        () => ({
            client: null,
            status,
            keyPair,
            sessionKey,
            wsChannel: null,
            currentNitroliteChannel,
            isConnected,
            hasKeys: !!keyPair,
            generateKeys,
            connect,
            disconnect,
            setNitroliteChannel,
            clearKeys,
            sendPing,
            sendRequest,
        }),
        [status, keyPair, sessionKey, currentNitroliteChannel, isConnected, generateKeys, connect, disconnect, setNitroliteChannel, clearKeys, sendPing, sendRequest]
    );

    return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const useWebSocketContext = (): WebSocketContextProps => {
    const context = useContext(WebSocketContext);
    if (context === undefined) {
        throw new Error("useWebSocketContext must be used within a WebSocketProvider");
    }
    return context;
};
