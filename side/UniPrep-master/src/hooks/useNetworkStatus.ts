import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_MODE_KEY = 'test_offline_mode';

export const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean>(true);
  const [forceOffline, setForceOffline] = useState<boolean>(false);

  useEffect(() => {
    // Load saved offline mode preference
    AsyncStorage.getItem(OFFLINE_MODE_KEY).then(value => {
      if (value === 'true') {
        setForceOffline(true);
      }
    });

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? true);
      setIsInternetReachable(state.isInternetReachable ?? true);
    });

    // Get initial state
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected ?? true);
      setIsInternetReachable(state.isInternetReachable ?? true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isOnline = forceOffline ? false : (isConnected && isInternetReachable);

  const setOfflineMode = async (offline: boolean) => {
    setForceOffline(offline);
    await AsyncStorage.setItem(OFFLINE_MODE_KEY, offline.toString());
  };

  return {
    isOnline,
    isConnected,
    isInternetReachable,
    forceOffline,
    setOfflineMode,
  };
};
