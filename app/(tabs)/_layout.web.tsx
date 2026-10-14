import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePalette } from "../../src/components/ui";
export default function Layout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.accent,
        tabBarStyle: { backgroundColor: p.surface, height: 68 },
        tabBarLabelStyle: { fontSize: 13, marginBottom: 8 },
      }}
    >
      {(
        [
          { name: "index", label: "ホーム", icon: "home-outline" },
          { name: "recipients", label: "宛先", icon: "people-outline" },
          { name: "drafts", label: "下書き", icon: "create-outline" },
          { name: "settings", label: "設定", icon: "settings-outline" },
        ] as const
      ).map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
