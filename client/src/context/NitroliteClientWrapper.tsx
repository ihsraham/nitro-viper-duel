"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type Hex } from "viem";
import { NitroliteStore, WalletStore } from "../store";
import { Client, EthereumMsgSigner, withBlockchainRPC, type TransactionSigner } from "@yellow-org/sdk";
import { generateKeyPair } from "./createSigner";
import { polygon } from "viem/chains";
import APP_CONFIG from "./app";
import { useAccount, useWalletClient } from 'wagmi';

const CRYPTO_KEYPAIR_KEY = "crypto_keypair";

export const CHAINS = polygon;

export const USDC_ADDRESS = APP_CONFIG.TOKENS[polygon.id] as Hex;

interface NitroliteContextType {
    client: Client | null;
    loading: boolean;
    error: string | null;
}

const NitroliteContext = createContext<NitroliteContextType>({
    client: null,
    loading: true,
    error: null,
});

export const useNitrolite = () => useContext(NitroliteContext);

interface NitroliteClientWrapperProps {
    children?: React.ReactNode;
}

export function NitroliteClientWrapper({ children }: NitroliteClientWrapperProps) {
    const [clientState, setClientState] = useState<NitroliteContextType>({
        client: null,
        loading: true,
        error: null,
    });

    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();

    const initializeKeys = useCallback(async () => {
        try {
            let keyPair = null;
            const savedKeys = localStorage.getItem(CRYPTO_KEYPAIR_KEY);
            if (savedKeys) {
                try { keyPair = JSON.parse(savedKeys); } catch { keyPair = null; }
            }
            if (!keyPair) {
                keyPair = await generateKeyPair();
                if (typeof window !== "undefined") {
                    localStorage.setItem(CRYPTO_KEYPAIR_KEY, JSON.stringify(keyPair));
                }
            }
            return keyPair;
        } catch (error) {
            console.error("Failed to initialize keys:", error);
            return null;
        }
    }, []);

    useEffect(() => {
        const initializeNitrolite = async () => {
            try {
                setClientState((prev) => ({ ...prev, loading: true, error: null }));

                if (!isConnected || !address || !walletClient) {
                    setClientState((prev) => ({
                        ...prev,
                        loading: false,
                        error: "Wallet not connected. Please connect your wallet.",
                    }));
                    return;
                }

                const keyPair = await initializeKeys();
                if (!keyPair) {
                    throw new Error("Failed to initialize keys.");
                }

                WalletStore.setWalletClient(walletClient);

                // Create state signer from session key
                const stateSigner = new EthereumMsgSigner(keyPair.privateKey as Hex);

                // Create transaction signer that wraps the wagmi wallet client
                const txSigner: TransactionSigner = {
                    getAddress: () => walletClient.account.address,
                    sendTransaction: async (tx: any) => {
                        const hash = await walletClient.sendTransaction(tx);
                        return hash;
                    },
                    signMessage: async (message: { raw: Hex }) => {
                        return walletClient.signMessage({ message: { raw: message.raw } }) as Promise<Hex>;
                    },
                };

                console.log("Creating SDK client with params:", {
                    wsUrl: APP_CONFIG.WEBSOCKET.URL,
                    stateSignerAddress: stateSigner.getAddress(),
                    txSignerAddress: txSigner.getAddress(),
                });

                // Create the SDK client - handles WebSocket connection and auth
                const client = await Client.create(
                    APP_CONFIG.WEBSOCKET.URL,
                    stateSigner,
                    txSigner,
                    withBlockchainRPC(BigInt(polygon.id), "https://polygon-rpc.com")
                );

                console.log("SDK client initialized successfully!");

                NitroliteStore.setClient(client);

                setClientState({
                    client,
                    loading: false,
                    error: null,
                });
            } catch (error: unknown) {
                console.error("Failed to initialize SDK client:", error);
                let errorMessage = "Failed to initialize SDK client";
                if (error instanceof Error) {
                    if (error.message.includes("provider")) {
                        errorMessage = "MetaMask provider error. Please refresh the page and try again.";
                    } else if (error.message.includes("wallet")) {
                        errorMessage = "Wallet client creation failed. Please ensure MetaMask is connected properly.";
                    } else {
                        errorMessage = `SDK client error: ${error.message}`;
                    }
                }
                setClientState({ client: null, loading: false, error: errorMessage });
            }
        };

        initializeNitrolite();
    }, [initializeKeys, address, isConnected, walletClient]);

    return <NitroliteContext.Provider value={clientState}>{children}</NitroliteContext.Provider>;
}
