import { DailyQuestProgressCard } from '../components/DailyQuestProgressCard';
import { QuestSection } from '../components/QuestSection';
import { Screen } from '../components/Screen';
import { useQuestProgress } from '../context/QuestProgressContext';
import { mockDailyQuests, mockWeeklyQuests } from '../data/mockQuests';
import { useAppTheme } from '../theme/ThemeProvider';

export function MenuScreen() {
  const { colors } = useAppTheme();
  const { completed, toggleQuest, streak, pointsToday } = useQuestProgress();

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
        onToggle={toggleQuest}
      />
      <QuestSection
        title="Weekly quests"
        quests={mockWeeklyQuests}
        completed={completed}
        onToggle={toggleQuest}
      />
    </Screen>
  );
}
