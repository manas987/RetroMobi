import { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { ChevronLeft } from "lucide-react-native";
import {
  Button, DEFAULT_COUNTRY, ErrorNote, Logo, OtpField, PhoneField, Screen, Text,
  api, colors, errorMessage, getDeviceId, radius, setSession, space, useCountdown, type Country,
} from "@retromobi/mobile-shared";

import { LabelInput } from "../features/fleet/tabs/Fields";
import { PageTitle, counter, counterStyles } from "../ui/Counter";

type Step = "phone" | "otp" | "signup";

/** Mirrors MerchantLoginResult / MerchantSignupRequiredResult in the backend's merchantAuthService.ts. */
type VerifyResult =
  | { status: "LOGIN"; accessToken: string; refreshToken: string }
  | { status: "SIGNUP_REQUIRED"; signupTicket: string; ticketExpiresInSeconds: number };

/**
 * Phone → code → (new number only) name. Same three calls and the same
 * wording as the website's pages/merchant/Login.tsx.
 */
export default function Login() {
  const resend = useCountdown(30);
  const [step, setStepRaw] = useState<Step>("phone");
  // An error belongs to the step it happened on.
  const setStep = (next: Step) => { setError(null); setStepRaw(next); };
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const phone = `${country.dial}${localPhone}`;
  const [code, setCode] = useState("");
  const [signupTicket, setSignupTicket] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const sendOtp = () =>
    run(async () => {
      await api("/auth/otp/send", { method: "POST", body: { phone }, auth: false });
      setCode("");
      resend.start();
      setStep("otp");
    });

  const verifyOtp = (entered = code) =>
    run(async () => {
      const result = await api<VerifyResult>("/auth/otp/verify", { method: "POST", body: { phone, code: entered, deviceId: getDeviceId() }, auth: false });
      if (result.status === "SIGNUP_REQUIRED") {
        setSignupTicket(result.signupTicket);
        setStep("signup");
      } else {
        // The root layout sees the session and switches to the signed-in screens.
        setSession(result);
      }
    });

  const completeSignup = () =>
    run(async () => {
      const result = await api<{ accessToken: string; refreshToken: string }>("/auth/signup/complete", {
        method: "POST", body: { signupTicket, deviceId: getDeviceId(), name: name.trim() }, auth: false,
      });
      setSession(result);
    });

  const back = (
    <Pressable onPress={() => setStep("phone")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back"
      style={{ flexDirection: "row", alignItems: "center", gap: space[1], minHeight: 44, alignSelf: "flex-start" }}>
      <ChevronLeft size={18} color={colors.ink3} />
      <Text size="sm" color="ink3">Back</Text>
    </Pressable>
  );

  return (
    <Screen background="canvas" edges={["top", "bottom", "left", "right"]} contentStyle={{ paddingTop: space[6], gap: space[5] }}>
      <View style={{ borderRadius: radius.hero, overflow: "hidden", backgroundColor: counter.navy }}>
        {step === "phone" && <Image source={require("../../assets/images/ui/login-hero.jpg")} contentFit="cover" accessible={false} style={{ height: 230 }} />}
        <View style={{ ...counterStyles.row, padding: space[4] }}>
          <Logo size={32} color={colors.amber} />
          <View style={{ flex: 1 }}>
            <Text size="xl" weight="bold" color="surface">RetroMobi</Text>
            <Text size="sm" style={{ color: counter.muted }}>For rental shops</Text>
          </View>
        </View>
      </View>

      {step === "phone" && (
        <View style={{ gap: space[3], padding: space[4], borderRadius: radius.card, backgroundColor: colors.surface }}>
          <PageTitle title="Merchant sign-in" subtitle="Sign in or set up your shop with your phone number." />
          {error && <View style={{ marginBottom: space[4] }}><ErrorNote text={error} /></View>}
          <PhoneField value={localPhone} onChange={setLocalPhone} country={country} onCountryChange={setCountry}
            onSubmit={() => { if (localPhone.length >= 10) void sendOtp(); }} />
          <Button label="Continue" variant="primary" size="lg" full busy={busy} disabled={localPhone.length < 10} onPress={() => void sendOtp()} style={{ marginTop: space[4] }} />
        </View>
      )}

      {step === "otp" && (
        <View style={{ gap: space[3] }}>
          {back}
          <PageTitle title="Verify your number" subtitle={`We sent a 6-digit code to ${phone}.`} />
          {error && <View style={{ marginBottom: space[4] }}><ErrorNote text={error} /></View>}
          <OtpField value={code} onChange={setCode} onComplete={(entered) => void verifyOtp(entered)} />
          <Button label="Verify" variant="primary" size="lg" full busy={busy} disabled={code.length < 6} onPress={() => void verifyOtp()} style={{ marginTop: space[4] }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], marginTop: space[4], minHeight: 44 }}>
            <Text size="sm" color="ink3">{"Didn't get it?"}</Text>
            {resend.remaining > 0 ? (
              <Text size="sm" color="ink4" tnum>Resend in 00:{String(resend.remaining).padStart(2, "0")}</Text>
            ) : (
              <Pressable onPress={() => void sendOtp()} hitSlop={12} accessibilityRole="button">
                <Text size="sm" weight="medium" style={{ textDecorationLine: "underline" }}>Resend code</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {step === "signup" && (
        <View style={{ gap: space[3] }}>
          {back}
          <PageTitle title="Create your account" subtitle="Enter the name you use at your shop." />
          {error && <View style={{ marginBottom: space[4] }}><ErrorNote text={error} /></View>}
          <LabelInput label="Your name" value={name} onChangeText={setName} autoFocus autoComplete="name" textContentType="name" returnKeyType="done"
            onSubmitEditing={() => { if (name.trim()) void completeSignup(); }} />
          <Button label="Create account" variant="primary" size="lg" full busy={busy} disabled={!name.trim()} onPress={() => void completeSignup()} />
        </View>
      )}
    </Screen>
  );
}
