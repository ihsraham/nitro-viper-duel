/**
 * ============================================================================
 * SESSION STATE UPDATES
 * ============================================================================
 *
 * Submits intermediate state updates to Yellow Network during gameplay.
 *
 * FLOW:
 * 1. Game progresses (moves, score changes)
 * 2. Submit updated state via SDK
 * 3. Update session_data with current game state
 * 4. Funds stay in session (no redistribution until close)
 *
 * KEY FUNCTION:
 * - submitAppState() - Update app session state during game
 * ============================================================================
 */

import { AppStateUpdateIntent, packAppStateUpdateV1 } from "@yellow-org/sdk";
import Decimal from "decimal.js";
import logger from '../utils/logger.js';
import { getRPCClient } from './client.js';
import { getAppSession } from './session-storage.js';

/**
 * Submit app state update to Yellow Network
 *
 * @param {string} roomId - Room ID
 * @param {Object} gameStateUpdate - Current game state data
 * @returns {Promise<void>}
 */
export async function submitAppState(roomId, gameStateUpdate = {}) {
  const session = getAppSession(roomId);

  if (!session) {
    logger.debug(`No active session for room ${roomId} to submit state`);
    return;
  }

  try {
    const rpcClient = getRPCClient();

    const allocations = [
      { participant: session.participantA, asset: 'usdc', amount: new Decimal(session.betAmount) },
      { participant: session.participantB, asset: 'usdc', amount: new Decimal(session.betAmount) },
      { participant: session.serverAddress, asset: 'usdc', amount: new Decimal('0') }
    ];

    const updatedSessionData = {
      gameType: 'viper_duel',
      version: '1.0',
      betAmount: session.betAmount,
      currency: 'usdc',
      totalPot: (parseFloat(session.betAmount) * 2).toString(),
      serverFee: '0',
      feeHistory: session.feeHistory || [],
      startTime: session.createdAt,
      updateTime: Date.now(),
      elapsedTime: Date.now() - session.createdAt,
      players: {
        player1: { address: session.participantA, role: 'host', contribution: session.betAmount },
        player2: { address: session.participantB, role: 'guest', contribution: session.betAmount }
      },
      gameState: 'playing',
      currentScores: gameStateUpdate.scores || {},
      gameTime: gameStateUpdate.gameTime || 0,
      moves: session.moves || [],
      totalMoves: (session.moves || []).length,
      movesByPlayer: {
        [session.participantA]: (session.moves || []).filter(m => m.player === session.participantA).length,
        [session.participantB]: (session.moves || []).filter(m => m.player === session.participantB).length
      },
      appSessionId: session.appSessionId,
      serverAddress: session.serverAddress,
      lastUpdate: new Date().toISOString()
    };

    const stateUpdate = {
      appSessionId: session.appSessionId,
      intent: AppStateUpdateIntent.Operate,
      version: BigInt(1),
      allocations,
      sessionData: JSON.stringify(updatedSessionData)
    };

    const hash = packAppStateUpdateV1(stateUpdate);
    const serverSig = await rpcClient.appSessionSigner.signMessage(hash);

    logger.nitro(`▶ Sending: submit_app_state for room ${roomId}`);

    await rpcClient.client.submitAppState(stateUpdate, [serverSig]);

    logger.nitro(`✓ App state submitted for room ${roomId}`);

  } catch (error) {
    logger.error(`Error submitting app state for room ${roomId}:`, error);
    // Don't throw - state submission is not critical for gameplay
  }
}
