import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import {
  VictoryChart,
  VictoryAxis,
  VictoryBar,
  VictoryCandlestick,
  VictoryTheme,
} from 'victory-native';
import { colors, spacing, typography } from '../theme';
import type { OHLCVCandle } from '../types';
import { format } from 'date-fns';

interface Props {
  candles: OHLCVCandle[];
  width?: number;
  height?: number;
  showVolume?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DEFAULT_HEIGHT = 300;
const VOLUME_HEIGHT = 80;

interface CandleData {
  x: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumeData {
  x: Date;
  y: number;
  fill: string;
}

const CandlestickChart: React.FC<Props> = ({
  candles,
  width = SCREEN_WIDTH - spacing.md * 2,
  height = DEFAULT_HEIGHT,
  showVolume = true,
}) => {
  const { candleData, volumeData, yDomain, minTime, maxTime } = useMemo(() => {
    if (!candles || candles.length === 0) {
      return {
        candleData: [],
        volumeData: [],
        yDomain: [0, 1] as [number, number],
        minTime: new Date(),
        maxTime: new Date(),
      };
    }

    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    const last = sorted.slice(-80); // Show up to 80 candles

    const cd: CandleData[] = last.map(c => ({
      x: new Date(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const vd: VolumeData[] = last.map(c => ({
      x: new Date(c.timestamp),
      y: c.volume,
      fill: c.close >= c.open ? colors.buy + '80' : colors.sell + '80',
    }));

    const highs = last.map(c => c.high);
    const lows = last.map(c => c.low);
    const maxH = Math.max(...highs);
    const minL = Math.min(...lows);
    const pad = (maxH - minL) * 0.05;

    return {
      candleData: cd,
      volumeData: vd,
      yDomain: [minL - pad, maxH + pad] as [number, number],
      minTime: new Date(last[0].timestamp),
      maxTime: new Date(last[last.length - 1].timestamp),
    };
  }, [candles]);

  if (!candles || candles.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>No chart data available</Text>
      </View>
    );
  }

  const chartTheme = {
    ...VictoryTheme.grayscale,
    axis: {
      ...VictoryTheme.grayscale.axis,
      style: {
        axis: { stroke: colors.border },
        tickLabels: {
          fill: colors.textMuted,
          fontSize: 8,
          fontFamily: 'monospace',
        },
        grid: { stroke: colors.border + '40', strokeDasharray: '4,4' },
      },
    },
  };

  const tickCount = Math.min(5, candleData.length);
  const timeTickValues = candleData
    .filter((_, i) => i % Math.floor(candleData.length / tickCount) === 0)
    .map(d => d.x);

  const priceTickCount = 5;

  return (
    <View style={styles.container}>
      {/* Candlestick chart */}
      <VictoryChart
        width={width}
        height={showVolume ? height - VOLUME_HEIGHT : height}
        padding={{ top: 16, bottom: 24, left: 8, right: 64 }}
        domain={{ x: [minTime, maxTime], y: yDomain }}
        scale={{ x: 'time' }}
        theme={chartTheme}
      >
        <VictoryAxis
          scale="time"
          tickValues={timeTickValues}
          tickFormat={t => format(new Date(t), 'HH:mm')}
          style={{
            axis: { stroke: colors.border },
            tickLabels: { fill: colors.textMuted, fontSize: 8 },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryAxis
          dependentAxis
          orientation="right"
          tickCount={priceTickCount}
          tickFormat={t => {
            if (t >= 10000) return `${(t / 1000).toFixed(0)}k`;
            if (t >= 1000) return t.toFixed(0);
            if (t >= 1) return t.toFixed(2);
            return t.toFixed(4);
          }}
          style={{
            axis: { stroke: colors.border },
            tickLabels: { fill: colors.textMuted, fontSize: 8 },
            grid: { stroke: colors.border + '30', strokeDasharray: '4,4' },
          }}
        />
        <VictoryCandlestick
          data={candleData}
          candleColors={{
            positive: colors.buy,
            negative: colors.sell,
          }}
          style={{
            data: {
              stroke: ({ datum }: { datum: CandleData }) =>
                datum.close >= datum.open ? colors.buy : colors.sell,
              strokeWidth: 1,
            },
          }}
        />
      </VictoryChart>

      {/* Volume chart */}
      {showVolume ? (
        <VictoryChart
          width={width}
          height={VOLUME_HEIGHT + 24}
          padding={{ top: 0, bottom: 24, left: 8, right: 64 }}
          domain={{ x: [minTime, maxTime] }}
          scale={{ x: 'time' }}
          theme={chartTheme}
        >
          <VictoryAxis
            scale="time"
            tickValues={timeTickValues}
            tickFormat={t => format(new Date(t), 'HH:mm')}
            style={{
              axis: { stroke: colors.border },
              tickLabels: { fill: colors.textMuted, fontSize: 8 },
              grid: { stroke: 'transparent' },
            }}
          />
          <VictoryAxis
            dependentAxis
            orientation="right"
            tickCount={2}
            tickFormat={t => {
              if (t >= 1e9) return `${(t / 1e9).toFixed(1)}B`;
              if (t >= 1e6) return `${(t / 1e6).toFixed(1)}M`;
              if (t >= 1e3) return `${(t / 1e3).toFixed(1)}K`;
              return t.toFixed(0);
            }}
            style={{
              axis: { stroke: colors.border },
              tickLabels: { fill: colors.textMuted, fontSize: 8 },
              grid: { stroke: 'transparent' },
            }}
          />
          <VictoryBar
            data={volumeData}
            style={{
              data: {
                fill: ({ datum }: { datum: VolumeData }) => datum.fill,
                width: Math.max(1, (width - 72) / candleData.length - 1),
              },
            }}
          />
        </VictoryChart>
      ) : null}

      <Text style={styles.volumeLabel}>Volume</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
  },
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.md,
  },
  volumeLabel: {
    position: 'absolute',
    bottom: 28,
    right: 4,
    fontSize: 8,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default CandlestickChart;
