import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { COUNTRIES, type Country } from "../lib/countries";
import { colors, font, radius, space, text } from "../theme";
import { Input } from "./basics";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

/**
 * Country code + mobile number. Digits only, 12 at most (as on the website's
 * PhoneInput). The parent joins them: `${country.dial}${value}`.
 */
export function PhoneField({ value, onChange, country, onCountryChange, autoFocus, onSubmit }: {
  value: string;
  onChange: (digits: string) => void;
  country: Country;
  onCountryChange: (c: Country) => void;
  autoFocus?: boolean;
  /** The keyboard's "done" key. */
  onSubmit?: () => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.phone}>
      <Pressable onPress={() => setPicking(true)} style={styles.dial} accessibilityRole="button" accessibilityLabel={`Country code, ${country.name} ${country.dial}`}>
        <Text size="md">{country.flag} {country.dial}</Text>
        <ChevronDown size={16} color={colors.ink3} />
      </Pressable>
      <Input
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 12))}
        keyboardType="number-pad"
        textContentType="telephoneNumber"
        autoComplete="tel-national"
        placeholder="Mobile number"
        accessibilityLabel="Mobile number"
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        style={styles.phoneInput}
      />
      <Sheet open={picking} onClose={() => setPicking(false)} title="Country code">
        {COUNTRIES.map((c) => (
          <Pressable key={c.code} onPress={() => { onCountryChange(c); setPicking(false); }} style={styles.country}
            accessibilityRole="button" accessibilityState={{ selected: c.code === country.code }}>
            <Text size="md" weight={c.code === country.code ? "bold" : "regular"}>{c.flag}  {c.dial} · {c.name}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

/**
 * The 6-digit code as ONE field, not six boxes: SMS autofill (Android) and the
 * iOS keyboard suggestion both fill a single field reliably, and paste just works.
 */
export function OtpField({ value, onChange, length = 6, onComplete }: {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  /** Fired when the last digit lands, so the screen can submit without a tap. */
  onComplete?: (code: string) => void;
}) {
  return (
    <Input
      value={value}
      onChangeText={(v) => {
        const code = v.replace(/\D/g, "").slice(0, length);
        onChange(code);
        if (code.length === length && code !== value) onComplete?.(code);
      }}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="sms-otp"
      maxLength={length}
      autoFocus
      accessibilityLabel={`${length}-digit code`}
      style={styles.otp}
    />
  );
}

const styles = StyleSheet.create({
  phone: { flexDirection: "row", gap: space[2] },
  dial: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[1], paddingHorizontal: space[3], borderRadius: radius.button, borderWidth: 1, borderColor: colors.lineStrong },
  phoneInput: { flex: 1 },
  country: { minHeight: 48, justifyContent: "center" },
  otp: { fontFamily: font.bold, fontSize: text.xl, letterSpacing: 10, textAlign: "center" },
});
