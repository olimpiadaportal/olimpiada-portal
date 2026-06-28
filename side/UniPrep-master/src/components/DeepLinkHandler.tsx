import { useEffect } from 'react';
import { useDeepLinking } from '../hooks/useDeepLinking';

/**
 * Component to handle deep linking
 * Must be rendered inside NavigationContainer
 */
export const DeepLinkHandler = () => {
  useDeepLinking();
  return null;
};
