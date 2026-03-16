import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { NitroliteStore, WalletStore } from "../store";
import { useStore } from "../store/storeUtils";
import { parseTokenUnits } from "./utils/tokenDecimals";
import { useWebSocketContext } from "../context/WebSocketContext";
import { USDC_ADDRESS } from '../context/NitroliteClientWrapper';

// Define localStorage keys
const STORAGE_KEYS = {
    CHANNEL: "nitrolite_channel",
    CHANNEL_STATE: "nitrolite_channel_state",
    CHANNEL_ID: "nitrolite_channel_id",
};

/**
 * Custom hook for managing Nitrolite channels
 */
export function useChannel() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { currentNitroliteChannel } = useWebSocketContext();
    const walletState = useStore(WalletStore.state);

    /**
     * Check for existing channels
     */
    const checkForExistingChannel = useCallback(async () => {
        const savedChannelId = localStorage.getItem(STORAGE_KEYS.CHANNEL_ID);

        if (savedChannelId) {
            console.log("Found existing channel ID in localStorage:", savedChannelId);
            return { exists: true, source: "localStorage" };
        }

        if (walletState.channelOpen) {
            console.log("Channel is open according to walletStore");
            return { exists: true, source: "walletStore" };
        }

        console.log("No existing channel found");
        return { exists: false };
    }, [walletState.channelOpen]);

    /**
     * Create a new Nitrolite channel
     */
    const createChannel = useCallback(
        async (tokenAddress: Hex, amount: string) => {
            setIsLoading(true);
            setError(null);

            try {
                const existingChannel = await checkForExistingChannel();

                if (existingChannel.exists) {
                    const source = existingChannel.source;
                    let message = "Cannot create a new channel because one already exists.";

                    if (source === "accountChannels") {
                        message += " You have active channel(s). Please close existing channels before creating a new one.";
                    } else {
                        message += " Please close the existing channel before creating a new one.";
                    }

                    setError(message);
                    throw new Error(message);
                }

                const nitroliteState = NitroliteStore.state.getState();
                console.log("NitroliteStore state:", {
                    isInitialized: nitroliteState.isInitialized,
                    hasClient: !!nitroliteState.client,
                });

                const client = nitroliteState.client;
                if (!client) {
                    console.error("Nitrolite client not initialized - client is null in store");
                    throw new Error("Nitrolite client not initialized");
                }

                // Log client methods
                console.log("Available client methods:", Object.keys(client));

                const amountBigInt = parseTokenUnits(tokenAddress, amount);
                await client.deposit(USDC_ADDRESS, amountBigInt);
                WalletStore.setChannelOpen(true);

                return { success: true };
            } catch (error) {
                console.error("Error creating channel:", error);
                setError(error instanceof Error ? error.message : String(error));
                WalletStore.setChannelOpen(false);
                throw error;
            } finally {
                setIsLoading(false);
            }
        },
        [checkForExistingChannel]
    );

    /**
     * Deposit to a channel
     */
    const depositToChannel = useCallback(async (tokenAddress: Address, amount: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const nitroliteState = NitroliteStore.state.getState();
            console.log("[depositToChannel] NitroliteStore state:", {
                isInitialized: nitroliteState.isInitialized,
                hasClient: !!nitroliteState.client,
            });

            const client = nitroliteState.client;
            if (!client) {
                console.error("[depositToChannel] Nitrolite client not initialized - client is null in store");
                throw new Error("Nitrolite client not initialized");
            }

            // Log client methods for deposit
            console.log("[depositToChannel] Available client methods:", Object.keys(client));

            const amountBigInt = typeof amount === "string" && !amount.startsWith("0x") ? parseTokenUnits(tokenAddress, amount) : BigInt(amount);

            await client.deposit(USDC_ADDRESS, amountBigInt);
            WalletStore.openChannel(tokenAddress, amountBigInt.toString());

            return true;
        } catch (depositError) {
            let errorMessage = "Deposit failed";

            if (String(depositError).includes("approve") && String(depositError).includes("not been authorized")) {
                errorMessage = "Token approval was rejected. Please approve the USDC spend in your wallet to proceed.";
            } else if (String(depositError).includes("user rejected transaction")) {
                errorMessage = "Transaction was rejected. Please confirm the transaction in your wallet.";
            } else {
                errorMessage = `Deposit error: ${depositError}`;
            }

            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Clear stored channel data
     */
    const clearStoredChannel = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEYS.CHANNEL);
            localStorage.removeItem(STORAGE_KEYS.CHANNEL_STATE);
            localStorage.removeItem(STORAGE_KEYS.CHANNEL_ID);
            WalletStore.closeChannel();

            console.log("Cleared channel data from localStorage");
        } catch (error) {
            console.error("Failed to clear channel data from localStorage:", error);
        }
    }, []);

    return {
        createChannel,
        depositToChannel,
        clearStoredChannel,
        currentChannel: currentNitroliteChannel,
        isChannelOpen: walletState.channelOpen,
        isLoading,
        error,
    };
}
