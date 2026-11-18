import { ShopProvider } from "../../state/shop";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { colors, font, useT } from "@retromobi/mobile-shared";
import { IconAction } from "../../ui/Counter";

function Back() {
  const router = useRouter();
  const { lang } = useT();
  return <IconAction icon={ArrowLeft} label={lang === "hi" ? "वापस" : "Back"} onPress={() => router.back()} />;
}

export default function AppLayout() {
  return (
    <ShopProvider>
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerBackButtonDisplayMode: "minimal",
        headerLeft: ({ canGoBack }) => canGoBack ? <Back /> : null,
        headerTitleStyle: { fontFamily: font.bold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
    </ShopProvider>
  );
}
