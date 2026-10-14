import { NativeTabs } from "expo-router/unstable-native-tabs";
import { usePalette } from "../../src/components/ui";
export default function TabLayout() {
  const p = usePalette();
  return (
    <NativeTabs tintColor={p.accent} backgroundColor={p.bg}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="house" md="home" />
        <NativeTabs.Trigger.Label>ホーム</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="recipients">
        <NativeTabs.Trigger.Icon sf="person.2" md="group" />
        <NativeTabs.Trigger.Label>宛先</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="drafts">
        <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit_note" />
        <NativeTabs.Trigger.Label>下書き</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        <NativeTabs.Trigger.Label>設定</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
