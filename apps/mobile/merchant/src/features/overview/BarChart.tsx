import { View } from "react-native";
import Svg, { Line as GridLine, Rect, Text as SvgText } from "react-native-svg";
import { Line, Text, colors, groupDigits, space, useT } from "@retromobi/mobile-shared";

import { Disclosure } from "../../ui/Disclosure";
import { counter } from "../../ui/Counter";

const lightSeries = [counter.navy, colors.verified];
const darkSeries = [colors.amber, colors.verifiedSoft];

export function BarChart({ data, series, format = groupDigits, dark }: {
  data: { label: string; values: number[] }[]; series: string[]; format?: (n: number) => string; /** On the navy hero card. */ dark?: boolean;
}) {
  const { t } = useT();
  const seriesColors = dark ? darkSeries : lightSeries;
  const muted = dark ? "ink4" : "ink2";
  const strong = dark ? "surface" : "ink";
  const grid = dark ? "rgba(255,255,255,0.12)" : colors.line;
  const max = Math.max(1, ...data.map((d) => d.values.reduce((sum, n) => sum + Math.max(0, n), 0)));
  const width = 400;
  const height = 120;
  const top = 18; // room for the value label over the tallest bar
  const sums = data.map((d) => d.values.reduce((sum, n) => sum + Math.max(0, n), 0));
  const peak = sums.indexOf(Math.max(...sums));
  const cell = width / Math.max(1, data.length);
  const bar = Math.max(1, Math.min(24, cell * 0.74));
  const tickCount = data.length <= 8 ? data.length : 6; // a week shows every day
  const ticks = Array.from({ length: tickCount }, (_, tick) => Math.round(tick * (data.length - 1) / Math.max(1, tickCount - 1)));
  return <View style={{ gap: space[2] }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
      {series.map((label, i) => <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: seriesColors[i % seriesColors.length] }} />
        <Text size="xs" color={muted}>{label}</Text>
      </View>)}
    </View>
    {data.length > 0 && <Svg width="100%" height={height + top} viewBox={`0 0 ${width} ${height + top}`} preserveAspectRatio="none" accessible={false}>
      {[0.3, 0.65, 0.99].map((y) => <GridLine key={y} x1={0} x2={width} y1={top + height * y} y2={top + height * y} stroke={grid} strokeDasharray="4 4" />)}
      {data.map((d, i) => {
        let bottom = top + height;
        return d.values.map((value, j) => {
          const segment = Math.max(0, value / max) * height;
          bottom -= segment;
          return segment ? <Rect key={`${i}-${j}`} rx={Math.min(6, bar / 2)} x={i * cell + (cell - bar) / 2} y={bottom}
            width={bar} height={Math.max(1, segment - 2)} fill={seriesColors[j % seriesColors.length]} /> : null;
        });
      })}
      {sums[peak]! > 0 && <SvgText x={peak * cell + cell / 2} y={top + height - (sums[peak]! / max) * height - 6} fontSize={13} fontWeight="700"
        textAnchor="middle" fill={dark ? colors.surface : counter.navy}>{format(sums[peak]!)}</SvgText>}
    </Svg>}
    <View style={{ minHeight: 28 }} accessible={false}>
      {ticks.map((i) => {
        const center = 100 * (i + 0.5) / data.length;
        return <Text key={i} numberOfLines={1} size="xs" color={muted} center
          style={{ position: "absolute", left: `${Math.max(0, Math.min(84, center - 8))}%`, width: "16%" }}>{data[i]!.label}</Text>;
      })}
    </View>
    <Disclosure dark={dark} label={t("common.seeNumbers")}>
      {data.map((d, i) => <View key={i} style={{ gap: space[1] }}>
        {i > 0 && !dark && <Line />}
        <Text weight="bold" size="sm" color={strong}>{d.label}</Text>
        {d.values.map((value, j) => <View key={j} style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }}>
          <Text size="sm" color={muted} style={{ flex: 1 }}>{series[j]}</Text><Text size="sm" weight="medium" color={strong} tnum>{format(value)}</Text>
        </View>)}
      </View>)}
    </Disclosure>
  </View>;
}
