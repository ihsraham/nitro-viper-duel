/**
 * ============================================================================
 * SESSION CLOSURE
 * ============================================================================
 *
 * Closes app sessions and distributes funds to winner.
 *
 * FLOW:
 * 1. Game ends with winner determined
 * 2. Create close message with fund distribution
 * 3. Server signs (has 100% voting power)
 * 4. Submit to Nitrolite
 * 5. Winner gets all funds
 *
 * YELLOW NETWORK AUDIT TRAIL:
 * The session_data includes complete game history for dispute resolution:
 *
 * FINANCIAL TRACKING:
 * - Fee history with timestamps (session_created, game_started, game_ended)
 * - Server fee charged and usage status
 * - Player contributions and payouts
 * - Total pot calculations
 *
 * GAMEPLAY TRACKING:
 * - All player moves (player address, direction, timestamp, move number)
 * - Complete timing data (start, end, duration)
 * - Final scores and winner
 * - Move statistics per player
 * - Server address and verification data
 *
 * This allows Yellow Network to:
 * 1. Verify all financial transactions and fee usage
 * 2. Replay the entire game and verify the outcome
 * 3. Resolve disputes with complete evidence
 *
 * KEY FUNCTION:
 * - closeAppSession() - Close session and distribute funds
 * ============================================================================
 */

import '@yellow-org/sdk-compat';
import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import { getRPCClient } from './client.js';
import { getAppSession, deleteAppSession } from './session-storage.js';

/**
 * Close app session and distribute funds to winner
 *
 * @param {string} roomId - Room ID
 * @param {string|null} winnerEOA - Winner's address (null for tie)
 * @returns {Promise<void>}
 */
export async function closeAppSession(roomId, winnerEOA = null, gameData = {}) {
  const session = getAppSession(roomId);

  if (!session) {
    logger.warn(`No active app session found for room ${roomId}`);
    return;
  }

  logger.nitro(`Closing app session for room ${roomId}`);
  logger.nitro(`Winner: ${winnerEOA || 'TIE'}`);

  try {
    const rpcClient = await getRPCClient();

    // Ensure WebSocket is connected

    const betAmount = parseFloat(session.betAmount) || 0;
    const totalPot = betAmount * 2;

    // Format winner address
    const formattedWinner = winnerEOA ? ethers.getAddress(winnerEOA) : null;

    // Create final session data with complete game history for Yellow Network audit
    const finalSessionData = {
      // Game Metadata
      gameType: 'viper_duel',
      version: '1.0',
      protocol: 'NitroRPC/0.4',

      // Financial Data
      betAmount: session.betAmount,
      currency: 'usdc',
      totalPot: totalPot.toString(),
      serverFee: '0',

      // Complete Fee History (for Yellow Network audit)
      feeHistory: [
        ...(session.feeHistory || []),
        {
          event: 'game_ended',
          timestamp: Date.now(),
          timestampISO: new Date().toISOString(),
          serverAddress: session.serverAddress,
          winner: formattedWinner,
          endCondition: gameData.endCondition || (formattedWinner ? 'collision' : 'tie'),
          winnerPayout: formattedWinner ? totalPot.toString() : null,
          player1Payout: !formattedWinner ? session.betAmount : (formattedWinner === session.participantA ? totalPot.toString() : '0'),
          player2Payout: !formattedWinner ? session.betAmount : (formattedWinner === session.participantB ? totalPot.toString() : '0'),
          serverPayout: '0' // Server gets no payout (fee was 0)
        }
      ],

      // Timing Data
      startTime: session.createdAt,
      endTime: Date.now(),
      duration: Date.now() - session.createdAt,

      // Player Information
      players: {
        player1: {
          address: session.participantA,
          role: 'host',
          contribution: session.betAmount,
          payout: !formattedWinner ? session.betAmount : (formattedWinner === session.participantA ? totalPot.toString() : '0')
        },
        player2: {
          address: session.participantB,
          role: 'guest',
          contribution: session.betAmount,
          payout: !formattedWinner ? session.betAmount : (formattedWinner === session.participantB ? totalPot.toString() : '0')
        }
      },

      // Game Outcome
      gameState: 'closed',
      winner: formattedWinner,
      endCondition: gameData.endCondition || (formattedWinner ? 'collision' : 'tie'),
      finalScores: gameData.finalScores || {},

      // Complete Move History (for dispute resolution)
      moves: session.moves || [],
      totalMoves: (session.moves || []).length,

      // Move Statistics
      movesByPlayer: {
        [session.participantA]: (session.moves || []).filter(m => m.player === session.participantA).length,
        [session.participantB]: (session.moves || []).filter(m => m.player === session.participantB).length
      },

      // Verification Data
      appSessionId: session.appSessionId,
      serverAddress: session.serverAddress,
      closedAt: new Date().toISOString()
    };

    // Determine fund distribution
    let allocations;

    if (!formattedWinner) {
      // TIE: Return funds to original owners
      logger.nitro('Game tied - returning funds');
      allocations = [
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
    } else {
      // WINNER: Winner takes all
      logger.nitro(`Winner ${formattedWinner} gets ${totalPot} USDC`);

      const loser = formattedWinner === session.participantA
        ? session.participantB
        : session.participantA;

      allocations = [
        {
          participant: formattedWinner,
          asset: 'usdc',
          amount: totalPot.toString()
        },
        {
          participant: loser,
          asset: 'usdc',
          amount: '0'
        },
        {
          participant: session.serverAddress,
          asset: 'usdc',
          amount: '0'
        }
      ];
    }

    // Create close message
    const closeData = {
      app_session_id: session.appSessionId,
      allocations,
      session_data: JSON.stringify(finalSessionData)
    };

    logger.data('Close session data:', closeData);
    logger.nitro('═══════════════════════════════════════════════════════');
    logger.nitro('COMPLETE GAME HISTORY FOR YELLOW NETWORK AUDIT:');
    logger.nitro('═══════════════════════════════════════════════════════');
    logger.data('Final game data:', finalSessionData);
    logger.nitro(`Total moves tracked: ${finalSessionData.totalMoves}`);
    logger.nitro(`Player 1 moves: ${finalSessionData.movesByPlayer[session.participantA]}`);
    logger.nitro(`Player 2 moves: ${finalSessionData.movesByPlayer[session.participantB]}`);
    logger.nitro(`Winner: ${formattedWinner || 'TIE'}`);
    logger.nitro(`Game duration: ${Math.round(finalSessionData.duration / 1000)}s`);
    logger.nitro('');
    logger.nitro('Fee History (complete audit trail):');
    finalSessionData.feeHistory.forEach((entry, idx) => {
      logger.nitro(`  ${idx + 1}. ${entry.event} @ ${entry.timestampISO}`);
      if (entry.feeCharged) logger.nitro(`     - Fee charged: ${entry.feeCharged}`);
      if (entry.feeUsed !== undefined) logger.nitro(`     - Fee used: ${entry.feeUsed}`);
      if (entry.totalPot) logger.nitro(`     - Total pot: ${entry.totalPot}`);
      if (entry.winnerPayout) logger.nitro(`     - Winner payout: ${entry.winnerPayout}`);
    });
    logger.nitro('');
    if (finalSessionData.moves.length > 0) {
      logger.nitro('Sample moves (first 5):');
      finalSessionData.moves.slice(0, 5).forEach(move => {
        logger.nitro(`  #${move.moveNumber}: ${move.player} → ${move.direction} @ ${new Date(move.timestamp).toISOString()}`);
      });
      if (finalSessionData.moves.length > 5) {
        logger.nitro(`  ... and ${finalSessionData.moves.length - 5} more moves`);
      }
    }
    logger.nitro('═══════════════════════════════════════════════════════');

    logger.nitro('▶ Sending: close_app_session via compat client');

    await rpcClient.closeAppSession({
      app_session_id: session.appSessionId,
      allocations,
      session_data: JSON.stringify(finalSessionData),
    });

    logger.nitro('✓ App session closed successfully');

    // Clean up
    deleteAppSession(roomId);

    logger.success(`App session closed and funds distributed for room ${roomId}`);

  } catch (error) {
    logger.error(`Error closing app session for room ${roomId}:`, error);
    throw error;
  }
}
