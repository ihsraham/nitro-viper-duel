/**
 * ============================================================================
 * YELLOW NETWORK SDK CLIENT
 * ============================================================================
 *
 * Main client for communicating with Yellow Network.
 * Uses @yellow-org/sdk Client which handles:
 * - WebSocket connection
 * - Authentication (session keys, auth flow)
 * - Signed RPC requests
 * - Message parsing
 *
 * KEY FUNCTIONS:
 * - initializeRPCClient() - Create and connect the SDK client
 * - getRPCClient() - Get the initialized client wrapper
 * ============================================================================
 */

import { Client, createSigners, AppSessionKeySignerV1 } from "@yellow-org/sdk";
import logger from "../utils/logger.js";

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let clientInstance = null;
let stateSignerInstance = null;
let txSignerInstance = null;
let appSessionSignerInstance = null;

/**
 * Initialize the SDK client. Handles connection and authentication.
 *
 * @param {string} url - Yellow Network WebSocket URL
 * @param {string} privateKey - Server private key
 * @returns {Promise<Object>} Client wrapper with backward-compatible interface
 */
export async function initializeRPCClient(url, privateKey) {
    if (clientInstance) {
        logger.system("SDK client already initialized");
        return getRPCClient();
    }

    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const { stateSigner, txSigner } = createSigners(formattedKey);

    stateSignerInstance = stateSigner;
    txSignerInstance = txSigner;
    appSessionSignerInstance = new AppSessionKeySignerV1(stateSigner);

    logger.system(`Initializing SDK client with address: ${stateSigner.getAddress()}`);

    clientInstance = await Client.create(url, stateSigner, txSigner);

    logger.system("SDK client connected and authenticated");

    return getRPCClient();
}

/**
 * Get the initialized client wrapper.
 * Provides a backward-compatible interface for existing code.
 *
 * @returns {Object} Client wrapper
 */
export function getRPCClient() {
    if (!clientInstance) {
        throw new Error("SDK client not initialized. Call initializeRPCClient() first.");
    }

    return {
        /** The underlying SDK Client instance */
        client: clientInstance,
        /** State signer for signing messages */
        stateSigner: stateSignerInstance,
        /** App session signer (wraps state signer with app session domain) */
        appSessionSigner: appSessionSignerInstance,
        /** Server address (from state signer) */
        address: stateSignerInstance.getAddress(),

        // Backward-compatible properties
        get sessionKey() {
            return { address: stateSignerInstance.getAddress() };
        },
        get sessionSigner() {
            return (data) => appSessionSignerInstance.signMessage(data);
        },

        /** Connect (no-op, Client.create() already connected) */
        async connect() {
            logger.system("SDK client is already connected via Client.create()");
        },

        /** Ensure connected (no-op, SDK manages connection internally) */
        async ensureConnected() {
            // SDK Client manages its own connection
        },

        /** Ping the server */
        async ping() {
            return clientInstance.ping();
        },

        /** Get channel info */
        async getChannelInfo() {
            try {
                const { channels } = await clientInstance.getChannels(stateSignerInstance.getAddress());
                return channels;
            } catch (error) {
                logger.error("Error getting channel info:", error);
                throw error;
            }
        },
    };
}
