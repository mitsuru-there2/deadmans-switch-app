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
            <Stack.Screen
              name="about"
              options={{ title: "このアプリについて", presentation: "modal" }}
            />
          </Stack>
        </PrivacyGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
