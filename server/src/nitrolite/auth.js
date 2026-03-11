/**
 * Authentication is now handled automatically by @yellow-org/sdk Client.create().
 * Session key management and the auth_request/auth_challenge/auth_verify flow
 * are all internal to the SDK.
 *
 * This module is kept for backward compatibility but no longer performs manual auth.
 */
import logger from "../utils/logger.js";

export const AUTH_DOMAIN = { name: "Viper Duel" };
export const SESSION_EXPIRY = 24 * 60 * 60; // 24 hours

/**
 * @deprecated Authentication is now handled by Client.create() in the SDK.
 */
export async function authenticateWithSessionKey() {
    logger.auth("Authentication is now handled internally by @yellow-org/sdk Client.create()");
    throw new Error("Manual authentication is no longer required. Use Client.create() from @yellow-org/sdk.");
}
