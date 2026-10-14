import { StorageDiagnostic } from "../src/components/StorageDiagnostic";
import { mode } from "../src/api/config";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { PrivacyGate } from "../src/components/PrivacyGate";
import { usePalette } from "../src/components/ui";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
export default function Layout() {
  const p = usePalette();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PrivacyGate>
          <StatusBar style="auto" />
          {__DEV__ && mode === "demo" && process.env.EXPO_PUBLIC_STORAGE_DIAGNOSTIC === "1" ? (
            <StorageDiagnostic />
          ) : (
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: p.bg },
                headerTintColor: p.accent,
                contentStyle: { backgroundColor: p.bg },
                headerShadowVisible: false,
                headerBackButtonDisplayMode: "minimal",
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="recipient/new"
                options={{ title: "宛先を追加", presentation: "modal" }}
              />
              <Stack.Screen name="message/[id]" options={{ title: "伝言を編集" }} />
              <Stack.Screen name="recipient/[id]" options={{ title: "宛先の状態" }} />
              <Stack.Screen name="contact" options={{ title: "本人メール" }} />
              <Stack.Screen name="activate" options={{ title: "見守りの条件" }} />
              <Stack.Screen name="deliveries" options={{ title: "通知と配信" }} />
              <Stack.Screen
                name="about"
                options={{ title: "このアプリについて", presentation: "modal" }}
              />
            </Stack>
          )}
        </PrivacyGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
