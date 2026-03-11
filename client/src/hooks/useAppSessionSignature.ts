import { useState, useCallback } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import { EthereumMsgSigner, AppSessionKeySignerV1 } from "@yellow-org/sdk";
import type { Hex } from "viem";
import type { AppSessionSignatureRequestMessage, AppSessionStartGameRequestMessage } from "../types";

export function useAppSessionSignature(
    sendSignature?: (roomId: string, signature: string) => void,
    sendStartGame?: (roomId: string, signature: string) => void
) {
    const [isSigningInProgress, setIsSigningInProgress] = useState(false);
    const [signatureError, setSignatureError] = useState<string | null>(null);
    const { sessionKey } = useWebSocketContext();

    const signAppSessionMessage = useCallback(
        async (roomId: string, hashToSign: Hex, messageType: "appSession:signature" | "appSession:startGame") => {
            if (!sessionKey?.privateKey) {
                throw new Error("No session key available for signing. Please ensure you are authenticated.");
            }

            setIsSigningInProgress(true);
            setSignatureError(null);

            try {
                // Create app session signer from session key
                const innerSigner = new EthereumMsgSigner(sessionKey.privateKey as Hex);
                const signer = new AppSessionKeySignerV1(innerSigner);
                console.log("Client signing hash with session key:", sessionKey.address);
                console.log("Hash to sign:", hashToSign);

                // Sign the hash
                const signature = await signer.signMessage(hashToSign);
                console.log("Client signature created:", signature);

                if (messageType === "appSession:signature" && sendSignature) {
                    sendSignature(roomId, signature);
                } else if (messageType === "appSession:startGame" && sendStartGame) {
                    sendStartGame(roomId, signature);
                } else {
                    throw new Error("No send function for message type: " + messageType);
                }

                setIsSigningInProgress(false);
                return signature;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown signing error";
                console.error("App session signing error:", errorMessage);
                setSignatureError(errorMessage);
                setIsSigningInProgress(false);
                throw error;
            }
        },
        [sessionKey, sendSignature, sendStartGame]
    );

    const handleParticipantBSignature = useCallback(
        async (message: AppSessionSignatureRequestMessage) => {
            try {
                await signAppSessionMessage(
                    message.roomId,
                    message.hashToSign as Hex,
                    "appSession:signature"
                );
            } catch (error) {
                console.error("Failed to sign as participant B:", error);
                throw error;
            }
        },
        [signAppSessionMessage]
    );

    const handleParticipantASignature = useCallback(
        async (message: AppSessionStartGameRequestMessage) => {
            try {
                await signAppSessionMessage(
                    message.roomId,
                    message.hashToSign as Hex,
                    "appSession:startGame"
                );
            } catch (error) {
                console.error("Failed to sign as participant A:", error);
                throw error;
            }
        },
        [signAppSessionMessage]
    );

    return {
        isSigningInProgress,
        signatureError,
        handleParticipantBSignature,
        handleParticipantASignature,
        signAppSessionMessage,
    };
}
