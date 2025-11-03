'use client';

import { PeraWalletConnect } from '@perawallet/connect';
import { createContext, useContext, useState, ReactNode } from 'react';

interface WalletContextType {
  peraWallet: PeraWalletConnect;
  accountAddress: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const peraWallet = new PeraWalletConnect();

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountAddress, setAccountAddress] = useState<string | null>(null);

  const connect = async () => {
    try {
      const newAccounts = await peraWallet.connect();
      setAccountAddress(newAccounts[0]);
    } catch (error) {
      if (error instanceof Error && 'data' in error) {
        // Check if error is an instance of PeraConnectError
        // and handle specific connection errors
        console.error('Could not connect to Pera Wallet', error);
      }
    }
  };

  const disconnect = async () => {
    await peraWallet.disconnect();
    setAccountAddress(null);
  };

  return (
    <WalletContext.Provider value={{ peraWallet, accountAddress, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
