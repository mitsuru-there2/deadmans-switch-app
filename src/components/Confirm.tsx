import { Alert, Platform } from "react-native";
export function confirmAction(title: string, description: string, action: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n${description}`)) action();
  } else
    Alert.alert(title, description, [
      { text: "戻る", style: "cancel" },
      { text: "続ける", onPress: action },
    ]);
}
