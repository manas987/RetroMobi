import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ArrowRight, CalendarDays, ChevronRight, MapPin, Search, ShoppingBag } from "lucide-react-native";
import { Button, CITY_LIST, DateRangeSheet, Logo, Screen, Sheet, Text, colors, dateTimeLabel, radius, space, type DateWindow } from "@retromobi/mobile-shared";
import { useCart } from "../../state/cart";

const images = {
  Dehradun: require("../../../assets/images/dehradun.jpg"),
  Haridwar: require("../../../assets/images/haridwar.jpg"),
  Rishikesh: require("../../../assets/images/rishikesh.jpg"),
};

export default function Explore() {
  const router = useRouter();
  const cart = useCart();
  const [city, setCity] = useState("");
  const [window, setWindow] = useState<DateWindow>();
  const [picker, setPicker] = useState<"city" | "dates" | null>(null);
  const [destination, setDestination] = useState<string>();
  function search(next = city, dates = window) {
    if (!next) { setPicker("city"); return; }
    if (!dates) { setDestination(next); setPicker("dates"); return; }
    router.push({ pathname: "/browse", params: { city: next, ...dates } });
  }
  return <Screen contentStyle={styles.body}>
    <View style={styles.header}>
      <View style={styles.brand}><Logo size={26} color={colors.ink} /><Text size="lg" weight="bold">retromobi</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Cart, ${cart.totalUnits} vehicles`} style={styles.cart}
        onPress={() => router.push("/cart")}><ShoppingBag size={20} color={colors.ink} />{!!cart.totalUnits && <Text size="xs" weight="bold">{cart.totalUnits}</Text>}</Pressable>
    </View>
    <View style={styles.intro}>
      <Text size="display" weight="bold" accessibilityRole="header" style={{ letterSpacing: -1 }}>Find your ride</Text>
      <Text color="ink2">Rent scooters and motorcycles in Uttarakhand.</Text>
    </View>
    <View style={styles.search}>
      <Pressable accessibilityRole="button" accessibilityLabel={city || "Choose a city"} style={styles.field} onPress={() => setPicker("city")}>
        <MapPin size={20} color={colors.ink} />
        <View style={{ flex: 1 }}><Text size="xs" color="ink2">Pickup city</Text><Text weight="medium">{city || "Choose a city"}</Text></View>
        <ChevronRight size={16} color={colors.ink2} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose rental dates" style={[styles.field, styles.divider]} onPress={() => { setDestination(undefined); setPicker("dates"); }}>
        <CalendarDays size={20} color={colors.ink} />
        <View style={{ flex: 1 }}><Text size="xs" color="ink2">Rental dates</Text>
          <Text weight="medium">{window ? `${dateTimeLabel(window.pickupAt)} → ${dateTimeLabel(window.returnAt)}` : "Add dates"}</Text></View>
        <ChevronRight size={16} color={colors.ink2} />
      </Pressable>
      <Button label="Find vehicles" variant="primary" icon={Search} onPress={() => search()} />
    </View>
    <Text size="xl" weight="bold" accessibilityRole="header">Explore Uttarakhand</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: space[3], paddingRight: space[2] }}>
      {CITY_LIST.map(({ name }) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Find vehicles in ${name}`}
        style={styles.destination} onPress={() => { setCity(name); search(name); }}>
        <Image source={images[name]} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        <View style={styles.destinationLabel}>
          <Text size="md" weight="bold" style={{ flex: 1 }}>{name}</Text>
          <ArrowRight size={18} color={colors.ink} />
        </View>
      </Pressable>)}
    </ScrollView>
    <Button label="Help & policies" variant="ghost" onPress={() => router.push("/policies")} />
    {picker === "city" && <Sheet open title="Choose a pickup city" onClose={() => setPicker(null)}>
      {CITY_LIST.map(({ name, blurb }) => <Pressable key={name} accessibilityRole="radio" accessibilityState={{ checked: city === name }}
        style={styles.field} onPress={() => { setCity(name); setPicker(null); }}>
        <View style={{ flex: 1 }}><Text weight="bold">{name}</Text><Text size="sm" color="ink2">{blurb}</Text></View>
        <ChevronRight size={18} color={colors.ink} />
      </Pressable>)}
    </Sheet>}
    <DateRangeSheet monochrome open={picker === "dates"} onClose={() => setPicker(null)} value={window} onChange={(dates) => {
      setWindow(dates);
      if (destination) search(destination, dates);
    }} />
  </Screen>;
}

const styles = StyleSheet.create({
  body: { gap: space[4] },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: space[2] },
  cart: { backgroundColor: colors.surface3, borderRadius: radius.full, paddingHorizontal: space[3], minHeight: 48, minWidth: 48, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" },
  intro: { gap: space[1], paddingTop: space[1] },
  search: { backgroundColor: colors.surface2, borderRadius: radius.card, padding: space[3], gap: space[1] },
  field: { minHeight: 54, flexDirection: "row", gap: space[3], alignItems: "center", padding: space[2] },
  divider: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  destination: { width: 218, height: 212, borderRadius: 25, overflow: "hidden", backgroundColor: colors.surface3, justifyContent: "flex-end", padding: space[3] },
  destinationLabel: { backgroundColor: colors.white, borderRadius: radius.panel, padding: space[3], flexDirection: "row", alignItems: "center", gap: space[2] },
});
