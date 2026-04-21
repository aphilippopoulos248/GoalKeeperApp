import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DailyQuestEntry } from '../context/QuestProgressContext';
import type { ThemeColors, ThemeMode } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import {
  formatScheduleRange,
  formatMinuteLabel,
  resolveQuestScheduleBlock,
} from '../utils/dailyQuestSchedule';

const MINUTES_PER_DAY = 24 * 60;
const PIXELS_PER_MINUTE = 0.72;
/** Viewport height for the day column; full day scrolls inside. */
const SCHEDULE_TIMELINE_MAX_HEIGHT = 400;
const GUTTER_WIDTH = 54;
const HOUR_COUNT = 24;

type ScheduleBlock = {
  id: string;
  goalId: string;
  title: string;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
  done: boolean;
};

function accentForGoal(goalId: string, primary: string, isDark: boolean): string {
  if (!goalId) return primary;
  let h = 0;
  for (let i = 0; i < goalId.length; i += 1) {
    h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const sat = isDark ? 62 : 72;
  const light = isDark ? 58 : 42;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function buildLayout(
  entries: DailyQuestEntry[],
  completed: Record<string, boolean>,
): ScheduleBlock[] {
  const total = entries.length;
  const raw = entries.map((e, i) => {
    const { startMinute, durationMinutes } = resolveQuestScheduleBlock(
      e.quest,
      i,
      total,
    );
    const end = Math.min(MINUTES_PER_DAY, startMinute + durationMinutes);
    return {
      id: e.quest.id,
      goalId: e.goalId,
      title: e.quest.title,
      start: startMinute,
      end,
      done: !!completed[e.quest.id],
    };
  });
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const withLanes = raw.map((b) => {
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else {
      laneEnds[lane] = b.end;
    }
    return { ...b, lane };
  });
  return withLanes.map((b) => {
    const overlapping = withLanes.filter((o) => o.start < b.end && o.end > b.start);
    const laneCount = Math.max(...overlapping.map((o) => o.lane)) + 1;
    return { ...b, laneCount };
  });
}

type Props = {
  entries: DailyQuestEntry[];
  completed: Record<string, boolean>;
  colors: ThemeColors;
  mode: ThemeMode;
};

export function DailyQuestDaySchedule({
  entries,
  completed,
  colors,
  mode,
}: Props) {
  const isDark = mode === 'dark';
  const dayHeight = MINUTES_PER_DAY * PIXELS_PER_MINUTE;

  const { blocks, dayLabel } = useMemo(() => {
    const dayLabelStr = new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return { blocks: buildLayout(entries, completed), dayLabel: dayLabelStr };
  }, [entries, completed]);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.dayTitle, { color: colors.text }]}>{dayLabel}</Text>
      <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
        12:00 AM – 11:59 PM
      </Text>
      <ScrollView
        style={{ maxHeight: SCHEDULE_TIMELINE_MAX_HEIGHT }}
        contentContainerStyle={styles.timelineScrollContent}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.row}>
          <View style={[styles.gutter, { width: GUTTER_WIDTH }]}>
            {Array.from({ length: HOUR_COUNT }, (_, h) => (
              <Text
                key={h}
                style={[
                  styles.hourLabel,
                  {
                    top: h * 60 * PIXELS_PER_MINUTE - 6,
                    color: colors.textSecondary,
                  },
                ]}
              >
                {formatMinuteLabel(h * 60)}
              </Text>
            ))}
          </View>
          <View
            style={[
              styles.gridColumn,
              {
                height: dayHeight,
                borderLeftColor: colors.border,
              },
            ]}
          >
            {Array.from({ length: HOUR_COUNT }, (_, h) => (
              <View
                key={h}
                style={[
                  styles.hourLine,
                  {
                    top: h * 60 * PIXELS_PER_MINUTE,
                    borderTopColor: colors.border,
                  },
                ]}
              />
            ))}
            {blocks.map((b) => {
              const top = b.start * PIXELS_PER_MINUTE;
              const height = Math.max(
                (b.end - b.start) * PIXELS_PER_MINUTE,
                1,
              );
              const laneW = 100 / b.laneCount;
              const leftPct = (b.lane / b.laneCount) * 100;
              const accent = accentForGoal(b.goalId, colors.primary, isDark);
              const range = formatScheduleRange(b.start, b.end);
              return (
                <View
                  key={b.id}
                  pointerEvents="none"
                  style={[
                    styles.block,
                    {
                      top,
                      height,
                      left: `${leftPct}%`,
                      width: `${laneW}%`,
                      paddingRight: 3,
                      opacity: b.done ? 0.55 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.blockInner,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        ...Platform.select({
                          ios: {
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.08,
                            shadowRadius: 2,
                          },
                          android: { elevation: 2 },
                          default: {},
                        }),
                      },
                    ]}
                  >
                    <View style={[styles.accentBar, { backgroundColor: accent }]} />
                    <View style={styles.blockTextWrap}>
                      <Text
                        style={[
                          styles.blockTitle,
                          {
                            color: colors.text,
                            textDecorationLine: b.done ? 'line-through' : 'none',
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {b.title}
                      </Text>
                      <Text
                        style={[styles.blockTime, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {range}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  subTitle: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  timelineScrollContent: {
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  gutter: {
    position: 'relative',
    minHeight: MINUTES_PER_DAY * PIXELS_PER_MINUTE,
  },
  hourLabel: {
    position: 'absolute',
    right: 6,
    fontSize: 11,
    fontWeight: '500',
  },
  gridColumn: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  block: {
    position: 'absolute',
    paddingLeft: 4,
  },
  blockInner: {
    height: '100%',
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  accentBar: {
    width: 4,
  },
  blockTextWrap: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  blockTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  blockTime: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});
