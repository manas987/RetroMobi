import { useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { shouldRetry } from "./api/client";
import { hydrateSession } from "./api/session";
import { hydrateLang } from "./i18n";
import { ToastProvider } from "./ui/Toast";

/** Same defaults as the website (frontend.tsx), plus retry rules for patchy data. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry },
    // Never retry a write on its own: a repeated POST can double-submit.
    mutations: { retry: false },
  },
});

// Coming back to the app (from the payment app, from the home screen) counts as
// "window focus": stale queries refetch. Polling stops while in the background.
AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));

// Queries pause while offline and resume on reconnect instead of failing.
onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false));
  return () => sub.remove();
});

/**
 * Loads what must be in memory before the first screen draws: the saved
 * session and the saved language. Keep the splash screen up until this is true.
 */
export function useAppReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.all([hydrateSession(), hydrateLang()]).finally(() => setReady(true));
  }, []);
  return ready;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export { queryClient };
