import { useState } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Button, Text, chartSeries, groupDigits, space, useT } from "@retromobi/mobile-shared";

export function BarChart({ data, series, format = groupDigits }: {
  data: { label: string; values: number[] }[]; series: string[]; format?: (n: number) => string;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const width = 400;
  const height = 120;
  const cell = width / Math.max(1, data.length);
  const bar = Math.min(24, cell / (series.length + 1));
  return <View style={{ gap: space[2] }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
      {series.map((label, i) => <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: chartSeries[i % chartSeries.length] }} />
        <Text size="xs" color="ink2">{label}</Text>
      </View>)}
    </View>
    {data.length > 0 && <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" accessible={false}>
      {data.map((d, i) => d.values.map((value, j) => <Rect key={`${i}-${j}`} rx={2}
        x={i * cell + (cell - d.values.length * bar) / 2 + j * bar} y={height - Math.max(0, value / max) * height}
        width={Math.max(1, bar - 2)} height={Math.max(0, value / max) * height} fill={chartSeries[j % chartSeries.length]} />))}
    </Svg>}
    <View style={{ flexDirection: "row" }} accessible={false}>
      {data.map((d, i) => <Text key={i} style={{ flex: 1 }} center size="xs" color="ink2">{d.label}</Text>)}
    </View>
    <Button label={t("common.seeNumbers")} variant="ghost" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} />
    {expanded && data.map((d, i) => <View key={i} style={{ gap: space[1] }}>
      <Text weight="bold" size="sm">{d.label}</Text>
      {d.values.map((value, j) => <Text key={j} size="sm" color="ink2">{series[j]}: {format(value)}</Text>)}
    </View>)}
  </View>;
}
