import { type Hex } from "viem";
import { ethers } from "ethers";

export interface CryptoKeypair {
    privateKey: string;
    address?: string;
}

export interface WalletSigner {
    address: Hex;
    sign: (payload: Hex) => Promise<Hex>;
}

export const createEthersSigner = (privateKey: string): WalletSigner => {
    try {
        const wallet = new ethers.Wallet(privateKey);
        return {
            address: ethers.getAddress(wallet.address) as Hex,
            sign: async (payload: Hex): Promise<Hex> => {
                try {
                    const messageBytes = ethers.getBytes(payload);
                    const { serialized: signature } = wallet.signingKey.sign(messageBytes);
                    return signature as Hex;
                } catch (error) {
                    console.error("Error signing message:", error);
                    throw error;
                }
            },
        };
    } catch (error) {
        console.error("Error creating ethers signer:", error);
        throw error;
    }
};

export const generateKeyPair = async (): Promise<CryptoKeypair> => {
    try {
        const wallet = ethers.Wallet.createRandom();
        const privateKeyHash = ethers.keccak256(wallet.privateKey as string);
        const walletFromHashedKey = new ethers.Wallet(privateKeyHash);
        return {
            privateKey: privateKeyHash,
            address: ethers.getAddress(walletFromHashedKey.address),
        };
    } catch (error) {
        console.error("Error generating keypair, using fallback:", error);
        const randomHex = ethers.randomBytes(32);
        const privateKey = ethers.keccak256(randomHex);
        const wallet = new ethers.Wallet(privateKey);
        return {
            privateKey: privateKey,
            address: ethers.getAddress(wallet.address),
        };
    }
};
