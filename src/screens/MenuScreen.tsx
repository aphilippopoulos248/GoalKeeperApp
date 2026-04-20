import { DailyQuestProgressCard } from '../components/DailyQuestProgressCard';
import { QuestSection } from '../components/QuestSection';
import { Screen } from '../components/Screen';
import { useQuestProgress } from '../context/QuestProgressContext';
import { useAppTheme } from '../theme/ThemeProvider';

export function MenuScreen() {
  const { colors } = useAppTheme();
  const { completed, toggleQuest, streak, pointsToday, dailyQuests, weeklyQuests } =
    useQuestProgress();

  return (
    <Screen>
      <DailyQuestProgressCard
        dailyQuests={dailyQuests}
        completed={completed}
        streak={streak}
        pointsToday={pointsToday}
        colors={colors}
      />

      <QuestSection
        title="Daily quests"
        quests={dailyQuests}
        completed={completed}
        onToggle={toggleQuest}
      />
      <QuestSection
        title="Weekly quests"
        quests={weeklyQuests}
        completed={completed}
        onToggle={toggleQuest}
      />
    </Screen>
  );
}
