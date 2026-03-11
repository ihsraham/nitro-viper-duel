/**
 * ============================================================================
 * SESSION CREATION
 * ============================================================================
 *
 * Generates app session data for players to sign.
 *
 * FLOW:
 * 1. Generate app definition (participants, weights, quorum)
 * 2. Create session data string
 * 3. Pack definition + session data into a hash for signing
 * 4. Server signs the hash
 * 5. Store as pending until all signatures collected
 *
 * KEY FUNCTION:
 * - generateAppSessionMessage() - Creates hash for multi-party signing
 * ============================================================================
 */

import { packCreateAppSessionRequestV1 } from "@yellow-org/sdk";
import Decimal from "decimal.js";
import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import { getRPCClient } from './client.js';
import { getPendingSession, setPendingSession } from './session-storage.js';

/**
 * Generate app session message for multi-signature collection
 *
 * @param {string} roomId - Room ID
 * @param {string} participantA - First player's address
 * @param {string} participantB - Second player's address
 * @param {number} betAmount - Bet amount per player (0, 0.01, 0.1, 1, 2)
 * @returns {Promise<Object>} Hash to sign and app definition
 */
export async function generateAppSessionMessage(roomId, participantA, participantB, betAmount = 0) {
  try {
    const formattedA = ethers.getAddress(participantA);
    const formattedB = ethers.getAddress(participantB);

    logger.nitro(`Generating app session for room ${roomId}`);
    logger.nitro(`Players: ${formattedA} vs ${formattedB}`);
    logger.nitro(`Bet: ${betAmount} USDC each`);

    // Check if already have pending session
    let pending = getPendingSession(roomId);
    if (pending) {
      logger.nitro(`Reusing existing session for room ${roomId}`);
      return {
        appDefinition: pending.appDefinition,
        participants: [pending.participantA, pending.participantB, pending.serverAddress],
        hashToSign: pending.hashToSign
      };
    }

    // Get SDK client wrapper
    const rpcClient = getRPCClient();
    const serverAddress = rpcClient.address;

    // Create app definition in new SDK format
    const nonce = BigInt(Date.now());
    const appDefinition = {
      applicationId: "viper_duel",
      participants: [
        { walletAddress: formattedA, signatureWeight: 0 },
        { walletAddress: formattedB, signatureWeight: 0 },
        { walletAddress: serverAddress, signatureWeight: 100 },
      ],
      quorum: 100,
      nonce: nonce,
    };

    const betAmountString = betAmount > 0 ? betAmount.toString() : '0';
    const betAmountNum = parseFloat(betAmountString);
    const totalPot = betAmountNum * 2;

    // Create initial session data
    const initialSessionData = {
      gameType: 'viper_duel',
      version: '1.0',
      betAmount: betAmountString,
      currency: 'usdc',
      totalPot: totalPot.toString(),
      serverFee: '0',
      feeHistory: [
        {
          event: 'session_created',
          timestamp: Date.now(),
          timestampISO: new Date().toISOString(),
          serverAddress: serverAddress,
          feeCharged: '0',
          feeUsed: false,
          player1Contribution: betAmountString,
          player2Contribution: betAmountString,
          totalPot: totalPot.toString()
        }
      ],
      startTime: Date.now(),
      createdAt: new Date().toISOString(),
      players: {
        player1: { address: formattedA, role: 'host', contribution: betAmountString },
        player2: { address: formattedB, role: 'guest', contribution: betAmountString }
      },
      gameState: 'created',
      moves: [],
      totalMoves: 0,
      movesByPlayer: { [formattedA]: 0, [formattedB]: 0 },
      serverAddress: serverAddress,
      nonce: Number(nonce)
    };

    const sessionDataString = JSON.stringify(initialSessionData);

    // Pack definition + session data into hash for signing
    logger.nitro('Packing app session for signing...');
    const hashToSign = packCreateAppSessionRequestV1(appDefinition, sessionDataString);

    // Server signs the hash
    const serverSignature = await rpcClient.appSessionSigner.signMessage(hashToSign);

    logger.success(`Generated app session hash for room ${roomId}`);
    logger.nitro('═══════════════════════════════════════════════════════');
    logger.nitro('DATA SENT TO CLIENTS FOR SIGNING:');
    logger.nitro('═══════════════════════════════════════════════════════');
    logger.data('hashToSign:', hashToSign);
    logger.data('appDefinition:', appDefinition);
    logger.data('Server signature:', serverSignature);
    logger.nitro('Participants must sign this EXACT hash');
    logger.nitro('═══════════════════════════════════════════════════════');

    // Store as pending
    logger.nitro(`Storing pending session for room ${roomId}`);
    setPendingSession(roomId, {
      appDefinition,
      sessionDataString,
      participantA: formattedA,
      participantB: formattedB,
      serverAddress,
      hashToSign,
      nonce,
      signatures: new Map(),
      serverSignature
    });

    logger.info(`Pending session created - waiting for player signatures`);

    return {
      appDefinition,
      participants: [formattedA, formattedB, serverAddress],
      hashToSign
    };

  } catch (error) {
    logger.error(`Error generating app session message for room ${roomId}:`, error);
    throw error;
  }
}

/**
 * Get pending app session message for a room
 */
export function getPendingAppSessionMessage(roomId) {
  return getPendingSession(roomId);
}
