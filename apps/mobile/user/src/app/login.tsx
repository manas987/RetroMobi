import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import {
  ApiError, Button, ErrorNote, Field, Input, Logo, OtpField, PhoneField, Screen, Text,
  api, DEFAULT_COUNTRY, errorMessage, getDeviceId, setSession, space, useCountdown, validPhone,
} from "@retromobi/mobile-shared";
import { Card } from "../features/RiderSurface";

type Step = "phone" | "otp" | "email" | "emailOtp" | "name";
const titles: Record<Step, string> = {
  phone: "Welcome to RetroMobi", otp: "Verify your number", email: "Verify your email", emailOtp: "Verify your email", name: "Almost there",
};
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const hasGoogle = !!webClientId && (Platform.OS === "android" || (Platform.OS === "ios" && !!iosClientId?.endsWith(".apps.googleusercontent.com")));
const emailLooksValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [signup, setSignup] = useState("");
  const [emailTicket, setEmailTicket] = useState("");
  const [googleTicket, setGoogleTicket] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const resend = useCountdown(30);
  const phone = country.dial + digits;
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };
  const set = (value: Step) => { setError(null); setStep(value); };

  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { await fn(); }
    catch (err) {
      if (err instanceof ApiError && err.status === 429) resend.start(err.retryAfterSeconds ?? 30);
      setError(errorMessage(err, "Something went wrong."));
    }
    finally { lock.current = false; setBusy(false); }
  }

  function finish(value: unknown) {
    const tokens = value as { accessToken?: unknown; refreshToken?: unknown } | undefined;
    if (typeof tokens?.accessToken !== "string" || !tokens.accessToken || typeof tokens.refreshToken !== "string" || !tokens.refreshToken) {
      throw new ApiError(502, "Couldn't sign in. Try again.");
    }
    setSession({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    close();
  }

  const sendPhone = () => { if (validPhone(phone)) void run(async () => {
    await api("/auth/otp/send", { method: "POST", auth: false, body: { phone } });
    setCode(""); set("otp"); resend.start();
  }); };
  const verifyPhone = (value = code) => { if (value.length === 6) void run(async () => {
    const result = await api<{ status?: string; signupTicket?: string }>("/auth/otp/verify", {
      method: "POST", auth: false, body: { phone, code: value, deviceId: getDeviceId() },
    });
    if (result?.status === "SIGNUP_REQUIRED" && typeof result.signupTicket === "string" && result.signupTicket) {
      setSignup(result.signupTicket); setEmail(""); setEmailTicket(""); setGoogleTicket(""); setName(""); set("email");
    } else finish(result);
  }); };
  const sendEmail = () => { if (emailLooksValid(email)) void run(async () => {
    await api("/auth/email-otp/send", { method: "POST", auth: false, body: { signupTicket: signup, email: email.trim() } });
    setEmailCode(""); set("emailOtp"); resend.start();
  }); };
  const verifyEmail = (value = emailCode) => { if (value.length === 6) void run(async () => {
    const result = await api<{ emailVerificationTicket?: string }>("/auth/email-otp/verify", {
      method: "POST", auth: false, body: { signupTicket: signup, email: email.trim(), code: value },
    });
    if (typeof result?.emailVerificationTicket !== "string" || !result.emailVerificationTicket) throw new ApiError(502, "Couldn't verify your email. Try again.");
    setEmailTicket(result.emailVerificationTicket); setGoogleTicket(""); set("name");
  }); };
  async function complete(displayName: string, google?: string) {
    const result = await api("/auth/signup/complete", {
      method: "POST", auth: false, body: { signupTicket: signup, deviceId: getDeviceId(), name: displayName.trim(),
        ...(google ? { googlePrefillTicket: google } : { emailVerificationTicket: emailTicket }) },
    });
    finish(result);
  }
  const google = () => {
    if (!hasGoogle) return;
    void run(async () => {
      GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
      if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (!isSuccessResponse(result)) return;
      if (!result.data.idToken) throw new ApiError(502, "Google sign-in didn't complete. Try again or verify your email.");
      const prefill = await api<{ googlePrefillTicket?: string; name?: string; email?: string }>("/auth/google",
        { method: "POST", auth: false, body: { idToken: result.data.idToken } });
      if (!prefill?.googlePrefillTicket) throw new ApiError(502, "Google sign-in didn't complete. Try again or verify your email.");
      if (prefill.email) setEmail(prefill.email);
      if (prefill.name?.trim()) await complete(prefill.name, prefill.googlePrefillTicket);
      else { setGoogleTicket(prefill.googlePrefillTicket); set("name"); }
    });
  };

  const label = step === "phone" ? "Continue" : step === "email" ? "Send code" : step === "name" ? "Create account" : "Verify";
  const enabled = step === "phone" ? validPhone(phone) : step === "otp" ? code.length === 6
    : step === "email" ? emailLooksValid(email) : step === "emailOtp" ? emailCode.length === 6 : !!name.trim();
  function submit() {
    if (!enabled) return;
    if (step === "phone") sendPhone();
    else if (step === "otp") verifyPhone();
    else if (step === "email") sendEmail();
    else if (step === "emailOtp") verifyEmail();
    else void run(() => complete(name, googleTicket));
  }
  const description = step === "phone" ? "Sign in or create an account with your phone number."
    : step === "otp" ? `We sent a 6-digit code to ${phone}.`
    : step === "email" ? "New number — we also verify an email before you can book."
    : step === "emailOtp" ? `Code sent to ${email}.` : googleTicket && email ? `Signing up with ${email}.` : "What should we call you?";
  const back = () => {
    if (step === "name") { setEmailCode(""); set(googleTicket ? "email" : "emailOtp"); }
    else if (step === "emailOtp") { setEmailCode(""); set("email"); }
    else { setCode(""); setSignup(""); set("phone"); }
  };

  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[4] }}
    footer={<Button label={label} variant="primary" size="lg" full busy={busy} disabled={!enabled} onPress={submit} />}>
    <Stack.Screen options={{ title: "Sign in" }} />
    <Logo size={34} />
    <Text size="xl" weight="bold">Ride the road less ordinary.</Text>
    <Text color="ink2">Licensed scooters and motorcycles across Dehradun, Haridwar and Rishikesh.</Text>
    <Card title={titles[step]}>
      <View style={{ gap: space[3] }}>
        <Text color="ink2">{description}</Text>
        {step !== "phone" && <Button variant="ghost" label="Back" disabled={busy} onPress={back} />}
        {error && <ErrorNote text={error} />}
        {step === "phone" && <PhoneField value={digits} onChange={setDigits} country={country} onCountryChange={setCountry} autoFocus onSubmit={sendPhone} />}
        {step === "otp" && <OtpField key="phone-code" value={code} onChange={setCode} onComplete={verifyPhone} />}
        {step === "email" && <>
          <Field label="Email address"><Input onSubmitEditing={sendEmail} accessibilityLabel="Email address" value={email}
            onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" autoCapitalize="none" returnKeyType="go" /></Field>
          {hasGoogle && <>
            <Button label="Continue with Google" disabled={busy} onPress={google} />
            <Text size="sm" color="ink2">Google confirms your email, so there&apos;s no code to enter.</Text>
          </>}
        </>}
        {step === "emailOtp" && <OtpField key="email-code" value={emailCode} onChange={setEmailCode} onComplete={verifyEmail} />}
        {step === "name" && <Field label="Your name"><Input accessibilityLabel="Your name" value={name} onChangeText={setName}
          autoComplete="name" textContentType="name" returnKeyType="done" onSubmitEditing={submit} /></Field>}
        {(step === "otp" || step === "emailOtp") && <Button label={resend.remaining ? `Resend code in ${resend.remaining}s` : "Resend code"}
          variant="ghost" disabled={busy || resend.remaining > 0} onPress={step === "otp" ? sendPhone : sendEmail} />}
        {step === "phone" && <Text color="ink2" size="xs">By continuing, you agree to RetroMobi&apos;s Terms and Privacy notice.</Text>}
      </View>
    </Card>
  </Screen>;
}
