import { Switch as NativeSwitch, type SwitchProps } from "react-native";
import { colors } from "../theme";

export function Switch(props: Omit<SwitchProps, "trackColor"> & { accessibilityLabel: string }) {
  return <NativeSwitch {...props} trackColor={{ false: colors.lineStrong, true: colors.verified }} />;
}
