/**
 * ============================================================================
 * SESSION STATE UPDATES
 * ============================================================================
 *
 * Submits intermediate state updates to Nitrolite during gameplay.
 *
 * FLOW:
 * 1. Game progresses (moves, score changes)
 * 2. Submit updated state to Nitrolite
 * 3. Update session_data with current game state
 * 4. Funds stay in session (no redistribution until close)
 *
 * KEY FUNCTION:
 * - submitAppState() - Update app session state during game
 * ============================================================================
 */

import '@yellow-org/sdk-compat';
import logger from '../utils/logger.js';
import { getRPCClient } from './client.js';
import { getAppSession } from './session-storage.js';

/**
 * Submit app state update to Nitrolite
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
    const rpcClient = await getRPCClient();

    // Ensure WebSocket is connected

    // Keep current allocations (no fund redistribution during game)
    const allocations = [
      {
        participant: session.participantA,
        asset: 'usdc',
        amount: session.betAmount
      },
      {
        participant: session.participantB,
        asset: 'usdc',
        amount: session.betAmount
      },
      {
        participant: session.serverAddress,
        asset: 'usdc',
        amount: '0'
      }
    ];

    // Update session data with current game state (for periodic updates during gameplay)
    const betAmountNum = parseFloat(session.betAmount);
    const totalPot = betAmountNum * 2;
    const serverFee = '0';

    const updatedSessionData = {
      // Game Metadata
      gameType: 'viper_duel',
      version: '1.0',
      protocol: 'NitroRPC/0.4',

      // Financial Data
      betAmount: session.betAmount,
      currency: 'usdc',
      totalPot: totalPot.toString(),
      serverFee: serverFee,

      // Fee History (preserved from session)
      feeHistory: session.feeHistory || [],

      // Timing Data
      startTime: session.createdAt,
      updateTime: Date.now(),
      elapsedTime: Date.now() - session.createdAt,

      // Player Information
      players: {
        player1: {
          address: session.participantA,
          role: 'host',
          contribution: session.betAmount
        },
        player2: {
          address: session.participantB,
          role: 'guest',
          contribution: session.betAmount
        }
      },

      // Current Game State
      gameState: 'playing',
      currentScores: gameStateUpdate.scores || {},
      gameTime: gameStateUpdate.gameTime || 0,

      // Move History (continuously updated)
      moves: session.moves || [],
      totalMoves: (session.moves || []).length,

      // Move Statistics (real-time)
      movesByPlayer: {
        [session.participantA]: (session.moves || []).filter(m => m.player === session.participantA).length,
        [session.participantB]: (session.moves || []).filter(m => m.player === session.participantB).length
      },

      // Verification Data
      appSessionId: session.appSessionId,
      serverAddress: session.serverAddress,
      lastUpdate: new Date().toISOString()
    };

    const stateData = {
      app_session_id: session.appSessionId,
      allocations,
      session_data: JSON.stringify(updatedSessionData)
    };

    logger.nitro(`▶ Sending: submit_app_state for room ${roomId} via compat client`);
    logger.data('State update:', stateData);

    await rpcClient.submitAppState(stateData);

    logger.nitro(`✓ App state submitted for room ${roomId}`);

  } catch (error) {
    logger.error(`Error submitting app state for room ${roomId}:`, error);
    // Don't throw - state submission is not critical for gameplay
  }
}
