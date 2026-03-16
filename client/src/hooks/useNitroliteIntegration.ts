import { useCallback, useEffect } from 'react';
import { NitroliteStore, WalletStore } from '../store';
import { useStore } from '../store/storeUtils';
import { useNitrolite } from '../context/NitroliteClientWrapper';
import { useChannel } from './useChannel';

/**
 * Integrates NitroliteClient state with channel recovery and wallet store.
 */
export function useNitroliteIntegration() {
  const { client, loading } = useNitrolite();
  const walletState = useStore(WalletStore.state);
  const { currentChannel, clearStoredChannel } = useChannel();

  const isConnected = !!client;
  const status = client ? 'connected' : loading ? 'connecting' : 'disconnected';

  useEffect(() => {
    if (isConnected && client && !currentChannel) {
      const channelId = localStorage.getItem('nitrolite_channel_id');
      const channelState = localStorage.getItem('nitrolite_channel_state');

      if (channelId && channelState) {
        try {
          console.log('Found saved channel, should reconnect:', channelId);
          WalletStore.setChannelOpen(true);
        } catch (error) {
          console.error('Failed to recover channel:', error);
          clearStoredChannel();
        }
      } else {
        WalletStore.setChannelOpen(false);
      }
    }
  }, [isConnected, client, currentChannel, clearStoredChannel]);

  const initializeNitroliteClient = useCallback(async (clientInstance: any) => {
    NitroliteStore.setClient(clientInstance);
  }, []);

  return {
    wsStatus: status,
    isWsConnected: isConnected,
    hasOpenChannel: walletState.channelOpen,
    currentChannelId: currentChannel ? JSON.stringify(currentChannel).substring(0, 20) : null,
    initializeNitroliteClient
  };
}
