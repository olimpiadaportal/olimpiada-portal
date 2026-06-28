import React, { createContext, useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertModal, AlertService, AlertType } from './AlertModal';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertConfig {
  title: string;
  message: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void;
  showSuccess: (title: string, message: string, onOk?: () => void) => void;
  showError: (title: string, message: string, onOk?: () => void) => void;
  showWarning: (title: string, message: string, onOk?: () => void) => void;
  showInfo: (title: string, message: string, onOk?: () => void) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string
  ) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

interface AlertProviderProps {
  children: React.ReactNode;
}

export const AlertProvider: React.FC<AlertProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    title: '',
    message: '',
    type: 'info',
    buttons: [{ text: 'OK' }],
  });

  const okText = t('common.ok');
  const confirmText = t('common.confirm');
  const cancelText = t('common.cancel');

  const showAlert = useCallback((config: AlertConfig) => {
    setAlertConfig({
      ...config,
      buttons: config.buttons || [{ text: okText }],
    });
    setVisible(true);
  }, [okText]);

  const hideAlert = useCallback(() => {
    setVisible(false);
  }, []);

  const showSuccess = useCallback((
    title: string,
    message: string,
    onOk?: () => void
  ) => {
    showAlert({
      title,
      message,
      type: 'success',
      buttons: [{ text: okText, onPress: onOk }],
    });
  }, [showAlert, okText]);

  const showError = useCallback((
    title: string,
    message: string,
    onOk?: () => void
  ) => {
    showAlert({
      title,
      message,
      type: 'error',
      buttons: [{ text: okText, onPress: onOk }],
    });
  }, [showAlert, okText]);

  const showWarning = useCallback((
    title: string,
    message: string,
    onOk?: () => void
  ) => {
    showAlert({
      title,
      message,
      type: 'warning',
      buttons: [{ text: okText, onPress: onOk }],
    });
  }, [showAlert, okText]);

  const showInfo = useCallback((
    title: string,
    message: string,
    onOk?: () => void
  ) => {
    showAlert({
      title,
      message,
      type: 'info',
      buttons: [{ text: okText, onPress: onOk }],
    });
  }, [showAlert, okText]);

  const showConfirm = useCallback((
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    customConfirmText?: string,
    customCancelText?: string
  ) => {
    showAlert({
      title,
      message,
      type: 'warning',
      buttons: [
        { text: customCancelText || cancelText, style: 'cancel', onPress: onCancel },
        { text: customConfirmText || confirmText, style: 'default', onPress: onConfirm },
      ],
    });
  }, [cancelText, confirmText, showAlert]);

  React.useEffect(() => {
    AlertService.setCallback(showAlert);
  }, [showAlert]);

  return (
    <AlertContext.Provider
      value={{
        showAlert,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showConfirm,
      }}
    >
      {children}
      <AlertModal
        visible={visible}
        onClose={hideAlert}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
      />
    </AlertContext.Provider>
  );
};

export default AlertProvider;
