"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { type Hex } from "viem";
import { NitroliteStore, WalletStore } from "../store";
import { NitroliteClient, blockchainRPCsFromEnv } from '@yellow-org/sdk-compat';
import { polygon } from "viem/chains";
import APP_CONFIG from "./app";
import { useAccount, useWalletClient } from 'wagmi';

export const CHAINS = polygon;

export const USDC_ADDRESS = APP_CONFIG.TOKENS[polygon.id] as Hex;

interface NitroliteContextType {
    client: NitroliteClient | null;
    loading: boolean;
    error: string | null;
}

const NitroliteContext = createContext<NitroliteContextType>({
    client: null,
    loading: false,
    error: null,
});

export const useNitrolite = () => useContext(NitroliteContext);

interface NitroliteClientWrapperProps {
    children?: React.ReactNode;
}

export function NitroliteClientWrapper({ children }: NitroliteClientWrapperProps) {
    const [clientState, setClientState] = useState<NitroliteContextType>({
        client: null,
        loading: false,
        error: null,
    });

    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();

    useEffect(() => {
        const initializeNitrolite = async () => {
            if (!isConnected || !address || !walletClient) {
                setClientState({ client: null, loading: false, error: null });
                return;
            }

            try {
                setClientState((prev) => ({ ...prev, loading: true, error: null }));

                WalletStore.setWalletClient(walletClient);

                const blockchainRPCs = blockchainRPCsFromEnv();

                const viteRPCs = import.meta.env.VITE_BLOCKCHAIN_RPCS as string | undefined;
                if (viteRPCs) {
                    for (const pair of viteRPCs.split(',').filter(Boolean)) {
                        const idx = pair.indexOf(':');
                        if (idx === -1) continue;
                        const chainId = Number(pair.slice(0, idx).trim());
                        const rpcUrl = pair.slice(idx + 1).trim();
                        if (Number.isFinite(chainId) && rpcUrl) blockchainRPCs[chainId] = rpcUrl;
                    }
                }

                if (!blockchainRPCs[polygon.id]) {
                    blockchainRPCs[polygon.id] = polygon.rpcUrls.default.http[0];
                }

                const client = await NitroliteClient.create({
                    wsURL: APP_CONFIG.WEBSOCKET.URL,
                    walletClient: walletClient as any,
                    chainId: polygon.id,
                    blockchainRPCs,
                });

                if (!client) {
                    throw new Error("Nitrolite client creation failed");
                }

                console.log("Nitrolite client initialized successfully");
                NitroliteStore.setClient(client);

                setClientState({
                    client,
                    loading: false,
                    error: null,
                });
            } catch (error: unknown) {
                console.error("Failed to initialize Nitrolite client:", error);

                let errorMessage = "Failed to initialize Nitrolite client";
                if (error instanceof Error) {
                    if (error.message.includes("provider")) {
                        errorMessage = "MetaMask provider error. Please refresh the page and try again.";
                    } else if (error.message.includes("wallet")) {
                        errorMessage = "Wallet client creation failed. Please ensure MetaMask is connected properly.";
                    } else {
                        errorMessage = `Nitrolite client error: ${error.message}`;
                    }
                }

                setClientState({
                    client: null,
                    loading: false,
                    error: errorMessage,
                });
            }
        };

        initializeNitrolite();
    }, [address, isConnected, walletClient]);

    return <NitroliteContext.Provider value={clientState}>{children}</NitroliteContext.Provider>;
}
