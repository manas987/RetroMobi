import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { Text, colors, rupees, space, useT } from "@retromobi/mobile-shared";

import { counter } from "../../ui/Counter";
import { Disclosure } from "../../ui/Disclosure";

export function RunningTotalChart({ current, previous, labels }: { current: number[]; previous: number[]; labels: readonly [string, string] }) {
  const { t } = useT();
  const width = 320;
  const height = 140;
  const padding = space[2];
  const n = Math.max(current.length, previous.length, 2) - 1;
  const max = Math.max(...current, ...previous, 1);
  const points = (series: number[]) => series.map((value, i) => `${padding + (i / n) * (width - 2 * padding)},${height - padding - value / max * (height - 2 * padding)}`).join(" ");
  return <View style={{ gap: space[2] }}>
    <View style={{ flexDirection: "row", gap: space[2] }}>
      <View style={{ justifyContent: "space-between", height }}>
        {[max, max / 2, 0].map((value) => <Text key={value} size="xs" color="ink2" tnum>{rupees(value)}</Text>)}
      </View>
      <View style={{ flex: 1 }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" accessible={false}>
          {[0, 1, 2].map((i) => <Line key={i} x1={padding} x2={width - padding} y1={padding + (height - 2 * padding) * i / 2} y2={padding + (height - 2 * padding) * i / 2}
            stroke={colors.line} strokeWidth={1} />)}
          <Polyline points={points(previous)} stroke={colors.ink3} fill="none" strokeWidth={2} />
          <Polyline points={points(current)} stroke={counter.navy} fill="none" strokeWidth={2} />
          {current.length > 0 && <Circle cx={padding + (current.length - 1) / n * (width - 2 * padding)}
            cy={height - padding - (current.at(-1) ?? 0) / max * (height - 2 * padding)} r={4}
            fill={counter.navy} stroke={colors.surface} strokeWidth={2} />}
        </Svg>
      </View>
    </View>
    {[current, previous].map((series, i) => <View key={labels[i]} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <View style={{ width: space[3], height: 3, backgroundColor: i ? colors.ink3 : counter.navy }} />
      <Text size="sm" color="ink2">{labels[i]} · {rupees(series.at(-1) ?? 0)}</Text>
    </View>)}
    <Text size="xs" color="ink2">{t("money.runningCaption")}</Text>
    <Disclosure label={t("common.seeNumbers")}>{Array.from({ length: n + 1 }, (_, i) => <Text size="xs" color="ink2" key={i}>
      {i + 1} · {labels[0]}: {current[i] === undefined ? "—" : rupees(current[i])} · {labels[1]}: {previous[i] === undefined ? "—" : rupees(previous[i])}
    </Text>)}</Disclosure>
  </View>;
}
