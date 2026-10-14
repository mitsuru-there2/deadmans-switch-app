import type { PropsWithChildren } from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  TextInput,
  Pressable,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
} from "react-native";
import { Host, Button as ExpoButton } from "@expo/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { mode } from "../api/config";
export function usePalette() {
  return useColorScheme() === "dark"
    ? {
        bg: "#151817",
        surface: "#222725",
        text: "#F0F4F1",
        muted: "#AEBAB4",
        line: "#39433E",
        accent: "#98D8BB",
        tint: "#263F34",
        danger: "#FFB4A9",
      }
    : {
        bg: "#F7F8F5",
        surface: "#FFFFFF",
        text: "#1C3027",
        muted: "#5F7067",
        line: "#DCE4DC",
        accent: "#27634A",
        tint: "#E8F1E9",
        danger: "#AE3024",
      };
}
export function Screen({ children }: PropsWithChildren) {
  const p = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={96}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 18,
          paddingBottom: Math.max(inset.bottom, 24) + 30,
          gap: 24,
          maxWidth: 720,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {mode === "demo" && (
          <View style={[s.banner, { backgroundColor: p.tint }]}>
            <Text style={{ color: p.accent, fontWeight: "600", fontSize: 13 }}>
              開発用デモ · 通知・送信・見守りは行いません
            </Text>
          </View>
        )}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Title({ children, subtitle }: PropsWithChildren<{ subtitle?: string }>) {
  const p = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ color: p.text, fontSize: 30, fontWeight: "700", lineHeight: 42 }}
      >
        {children}
      </Text>
      {!!subtitle && <Body muted>{subtitle}</Body>}
    </View>
  );
}
export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  const p = usePalette();
  return (
    <Text style={{ color: muted ? p.muted : p.text, fontSize: 16, lineHeight: 25 }}>
      {children}
    </Text>
  );
}
export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const p = usePalette();
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: p.muted, fontSize: 13, fontWeight: "600" }}>
        {title}
      </Text>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}
export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={{ color: error ? p.danger : p.muted, fontSize: 14, lineHeight: 22 }}
    >
      {children}
    </Text>
  );
}
export function Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const p = usePalette();
  return (
    <Host matchContents={{ vertical: true }} seedColor={p.accent} style={{ minHeight: 48 }}>
      <ExpoButton
        label={label}
        onPress={onPress}
        disabled={disabled}
        variant={secondary ? "outlined" : "filled"}
        style={{ height: 52, width: "100%" }}
      />
    </Host>
  );
}
export function Row({
  title,
  detail,
  onPress,
  trailing,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  trailing?: string;
}) {
  const p = usePalette();
  const content = (
    <>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: "600" }}>{title}</Text>
        {!!detail && <Text style={{ color: p.muted, fontSize: 14, lineHeight: 21 }}>{detail}</Text>}
      </View>
      {!!trailing && <Text style={{ color: p.accent, fontSize: 13 }}>{trailing}</Text>}
      {onPress && <Text style={{ color: p.muted, fontSize: 24 }}>›</Text>}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: p.line,
    minHeight: 64,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, detail, trailing].filter(Boolean).join("、")}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: p.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={p.muted}
        selectionColor={p.accent}
        {...props}
        style={[
          {
            color: p.text,
            backgroundColor: p.surface,
            borderWidth: 1,
            borderColor: p.line,
            borderRadius: Platform.OS === "ios" ? 10 : 4,
            padding: 14,
            fontSize: 17,
            lineHeight: 26,
            minHeight: props.multiline ? 140 : 52,
            textAlignVertical: "top",
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Reveal({ children }: PropsWithChildren) {
  if (Platform.OS === "web") return <View style={{ gap: 18 }}>{children}</View>;
  return (
    <Animated.View
      entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
      style={{ gap: 18 }}
    >
      {children}
    </Animated.View>
  );
}
const s = StyleSheet.create({ banner: { padding: 12, borderRadius: 8 } });
