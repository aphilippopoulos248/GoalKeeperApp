import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';

import type { DailyQuestEntry } from '../context/QuestProgressContext';
import type { ThemeColors, ThemeMode } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import {
  clampScheduleStartMinute,
  formatMinuteLabel,
  formatScheduleRange,
  resolveQuestScheduleBlock,
} from '../utils/dailyQuestSchedule';

const MINUTES_PER_DAY = 24 * 60;
/** Vertical scale: hour spacing = 60 * this (was 0.72; 2× wider hour gaps). */
const PIXELS_PER_MINUTE = 1.44;
/** Viewport height for the day column; full day scrolls inside. */
const SCHEDULE_TIMELINE_MAX_HEIGHT = 400;
const GUTTER_WIDTH = 54;
const HOUR_COUNT = 24;
/** Show this time at the top of the scroll viewport initially (6:00 AM). */
const DEFAULT_SCROLL_START_MINUTE = 6 * 60;

type ScheduleBlock = {
  id: string;
  goalId: string;
  title: string;
  start: number;
  end: number;
  durationMinutes: number;
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
    const rawTitle = e.quest.title?.trim() ?? '';
    return {
      id: e.quest.id,
      goalId: e.goalId,
      title: rawTitle.length > 0 ? rawTitle : 'Daily quest',
      start: startMinute,
      end,
      durationMinutes,
      done: !!completed[e.quest.id],
    };
  });
  raw.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    const g = a.goalId.localeCompare(b.goalId);
    if (g !== 0) return g;
    return a.id.localeCompare(b.id);
  });
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

export type CommitScheduleFn = (
  goalId: string,
  questId: string,
  scheduleStartMinute: number,
  scheduleDurationMinutes: number,
) => void;

type ScheduleQuestBlockProps = {
  block: ScheduleBlock;
  isDark: boolean;
  colors: ThemeColors;
  snapMinutes: number;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onCommitSchedule?: CommitScheduleFn;
  onOpenQuestInMenu?: (questId: string) => void;
};

function ScheduleQuestBlock({
  block,
  isDark,
  colors,
  snapMinutes,
  draggingId,
  onDragStart,
  onDragEnd,
  onCommitSchedule,
  onOpenQuestInMenu,
}: ScheduleQuestBlockProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const canDrag = !!onCommitSchedule && block.goalId.length > 0;

  const doubleTapGesture = useMemo(() => {
    if (!onOpenQuestInMenu) return null;
    return Gesture.Tap()
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd(() => {
        onOpenQuestInMenu(block.id);
      });
  }, [block.id, onOpenQuestInMenu]);

  const panGesture = useMemo(() => {
    if (!canDrag || !onCommitSchedule) return null;

    return Gesture.Pan()
      .activateAfterLongPress(450)
      .runOnJS(true)
      .onStart(() => {
        onDragStart(block.id);
      })
      .onUpdate((e) => {
        translateY.setValue(e.translationY);
      })
      .onEnd((e) => {
        const deltaMin = Math.round(e.translationY / PIXELS_PER_MINUTE);
        let next = block.start + deltaMin;
        if (snapMinutes > 1) {
          next = Math.round(next / snapMinutes) * snapMinutes;
        }
        const clamped = clampScheduleStartMinute(next, block.durationMinutes);
        onCommitSchedule(block.goalId, block.id, clamped, block.durationMinutes);
      })
      .onFinalize(() => {
        translateY.setValue(0);
        onDragEnd();
      });
  }, [
    block.durationMinutes,
    block.goalId,
    block.id,
    block.start,
    canDrag,
    onCommitSchedule,
    onDragEnd,
    onDragStart,
    snapMinutes,
  ]);

  const rootGesture = useMemo(() => {
    if (doubleTapGesture && panGesture) {
      return Gesture.Simultaneous(doubleTapGesture, panGesture);
    }
    if (doubleTapGesture) return doubleTapGesture;
    if (panGesture) return panGesture;
    return null;
  }, [doubleTapGesture, panGesture]);

  const top = block.start * PIXELS_PER_MINUTE;
  const height = Math.max((block.end - block.start) * PIXELS_PER_MINUTE, 1);
  const compact = height < 26;
  const laneW = 100 / block.laneCount;
  const leftPct = (block.lane / block.laneCount) * 100;
  const accent = accentForGoal(block.goalId, colors.primary, isDark);
  const range = formatScheduleRange(block.start, block.end);
  const isDragging = draggingId === block.id;

  const layoutStyle = {
    top,
    height,
    left: `${leftPct}%` as const,
    width: `${laneW}%` as const,
    paddingRight: 3,
    opacity: block.done ? 0.55 : 1,
    zIndex: isDragging ? 20 : 1,
  };

  const inner = (
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
              shadowOpacity: compact ? 0.04 : isDragging ? 0.14 : 0.08,
              shadowRadius: isDragging ? 6 : 2,
            },
            android: { elevation: compact ? 1 : isDragging ? 6 : 2 },
            default: {},
          }),
        },
      ]}
    >
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <View
        style={[styles.blockTextWrap, compact && styles.blockTextWrapCompact]}
      >
        <View style={styles.blockTitleCell}>
          <Text
            style={[
              styles.blockTitle,
              compact && styles.blockTitleCompact,
              {
                color: colors.text,
                textDecorationLine: block.done ? 'line-through' : 'none',
              },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...Platform.select({
              android: { includeFontPadding: false },
              default: {},
            })}
          >
            {block.title}
          </Text>
        </View>
        <Text
          style={[
            styles.blockTimeRight,
            compact && styles.blockTimeRightCompact,
            { color: colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {range}
        </Text>
      </View>
    </View>
  );

  const a11yHint = [
    onCommitSchedule && block.goalId.length > 0
      ? 'Long-press, then drag up or down to change the time on your schedule'
      : null,
    onOpenQuestInMenu ? 'Double-tap to open this quest on the Menu' : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (!rootGesture) {
    return (
      <View
        style={[styles.block, layoutStyle]}
        accessibilityRole="text"
        accessibilityLabel={`${block.title}, ${range}`}
        accessibilityHint={a11yHint || undefined}
      >
        {inner}
      </View>
    );
  }

  const outer = panGesture ? (
    <Animated.View
      style={[styles.block, layoutStyle, { transform: [{ translateY }] }]}
      accessibilityRole="button"
      accessibilityLabel={`${block.title}, ${range}`}
      accessibilityHint={a11yHint || undefined}
    >
      {inner}
    </Animated.View>
  ) : (
    <View
      style={[styles.block, layoutStyle]}
      accessibilityRole="button"
      accessibilityLabel={`${block.title}, ${range}`}
      accessibilityHint={a11yHint || undefined}
    >
      {inner}
    </View>
  );

  return <GestureDetector gesture={rootGesture}>{outer}</GestureDetector>;
}

type Props = {
  entries: DailyQuestEntry[];
  completed: Record<string, boolean>;
  colors: ThemeColors;
  mode: ThemeMode;
  /** Snap dropped start times to this many minutes (e.g. 15). */
  snapMinutes?: number;
  onCommitSchedule?: CommitScheduleFn;
  /** Double-tap block: navigate to Menu and scroll this quest into view. */
  onOpenQuestInMenu?: (questId: string) => void;
};

export function DailyQuestDaySchedule({
  entries,
  completed,
  colors,
  mode,
  snapMinutes = 15,
  onCommitSchedule,
  onOpenQuestInMenu,
}: Props) {
  const isDark = mode === 'dark';
  const dayHeight = MINUTES_PER_DAY * PIXELS_PER_MINUTE;
  const scrollRef = useRef<ScrollView>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const defaultScrollY = useMemo(
    () => DEFAULT_SCROLL_START_MINUTE * PIXELS_PER_MINUTE,
    [],
  );

  const { blocks, dayLabel } = useMemo(() => {
    const dayLabelStr = new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return { blocks: buildLayout(entries, completed), dayLabel: dayLabelStr };
  }, [entries, completed]);

  const scrollToDefaultMorning = useCallback(() => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, defaultScrollY),
      animated: false,
    });
  }, [defaultScrollY]);

  /** Only auto-scroll to 6:00 once when the timeline first gets content; not on every entries/completed update (e.g. drag-drop). */
  const initialScrollDoneRef = useRef(false);

  const tryInitialScrollToMorning = useCallback(() => {
    if (initialScrollDoneRef.current || blocks.length === 0) return;
    scrollToDefaultMorning();
    initialScrollDoneRef.current = true;
  }, [blocks.length, scrollToDefaultMorning]);

  useEffect(() => {
    if (blocks.length === 0) {
      initialScrollDoneRef.current = false;
    }
  }, [blocks.length]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(tryInitialScrollToMorning);
    });
    return () => cancelAnimationFrame(id);
  }, [blocks.length, tryInitialScrollToMorning]);

  const onDragStart = useCallback((id: string) => {
    setDraggingId(id);
    setScrollEnabled(false);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setScrollEnabled(true);
  }, []);

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
        {onCommitSchedule ? ' · Long-press a block to move it' : ''}
      </Text>
      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: SCHEDULE_TIMELINE_MAX_HEIGHT }}
        contentContainerStyle={styles.timelineScrollContent}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
        onContentSizeChange={tryInitialScrollToMorning}
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
            {blocks.map((b) => (
              <ScheduleQuestBlock
                key={b.id}
                block={b}
                isDark={isDark}
                colors={colors}
                snapMinutes={snapMinutes}
                draggingId={draggingId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onCommitSchedule={onCommitSchedule}
                onOpenQuestInMenu={onOpenQuestInMenu}
              />
            ))}
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
    overflow: 'visible',
  },
  blockInner: {
    height: '100%',
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'visible',
    flexDirection: 'row',
  },
  accentBar: {
    width: 4,
  },
  blockTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  blockTextWrapCompact: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  blockTitleCell: {
    flex: 1,
    minWidth: 0,
  },
  blockTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  blockTitleCompact: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
  blockTimeRight: {
    flexShrink: 0,
    marginLeft: 12,
    fontSize: 11,
    fontWeight: '500',
  },
  blockTimeRightCompact: {
    marginLeft: 8,
    fontSize: 9,
    fontWeight: '500',
  },
});
