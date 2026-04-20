import { useState } from 'react';

import { DailyQuestProgressCard } from '../components/DailyQuestProgressCard';
import { QuestSection } from '../components/QuestSection';
import { Screen } from '../components/Screen';
import { mockDailyQuests, mockWeeklyQuests } from '../data/mockQuests';
import { useDailyStreakAndPointsToday } from '../hooks/useDailyStreakAndPointsToday';
import { useAppTheme } from '../theme/ThemeProvider';

const allQuests = [...mockDailyQuests, ...mockWeeklyQuests];

export function MenuScreen() {
  const { colors } = useAppTheme();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const { streak, pointsToday, applyQuestToggle } = useDailyStreakAndPointsToday();

  const toggle = (id: string) => {
    const quest = allQuests.find((q) => q.id === id);
    if (!quest) return;

    setCompleted((prev) => {
      const nextCompleted = !prev[id];
      queueMicrotask(() => applyQuestToggle(quest, nextCompleted));
      return { ...prev, [id]: nextCompleted };
    });
  };

  return (
    <Screen>
      <DailyQuestProgressCard
        dailyQuests={mockDailyQuests}
        completed={completed}
        streak={streak}
        pointsToday={pointsToday}
        colors={colors}
      />

      <QuestSection
        title="Daily quests"
        quests={mockDailyQuests}
        completed={completed}
        onToggle={toggle}
      />
      <QuestSection
        title="Weekly quests"
        quests={mockWeeklyQuests}
        completed={completed}
        onToggle={toggle}
      />
    </Screen>
  );
}
