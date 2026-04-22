import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AssistFullRecipe } from '../services/spoonacularRecipes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type AttachedRecipeModalProps = {
  recipe: AssistFullRecipe | null;
  onClose: () => void;
};

export function AttachedRecipeModal({ recipe, onClose }: AttachedRecipeModalProps) {
  const { colors } = useAppTheme();
  const visible = recipe !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {recipe ? (
        <SafeAreaView
          style={[styles.safe, { backgroundColor: colors.background }]}
          edges={['top', 'left', 'right', 'bottom']}
        >
          <View style={styles.headerBar}>
            <Pressable
              onPress={onClose}
              hitSlop={14}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.65 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Close recipe"
            >
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.headline, { color: colors.text }]}>{recipe.title}</Text>
            {recipe.image ? (
              <Image source={{ uri: recipe.image }} style={styles.hero} />
            ) : null}
            {recipe.servings != null || recipe.readyInMinutes != null ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {[
                  recipe.servings != null ? `${recipe.servings} servings` : null,
                  recipe.readyInMinutes != null ? `${recipe.readyInMinutes} min` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Ingredients</Text>
            {recipe.ingredientLines.map((line, i) => (
              <Text key={`ing-${i}`} style={[styles.line, { color: colors.text }]}>
                • {line}
              </Text>
            ))}
            <Text style={[styles.sectionLabel, styles.stepsLabel, { color: colors.text }]}>
              Steps
            </Text>
            {recipe.stepLines.map((line, i) => (
              <Text key={`st-${i}`} style={[styles.line, { color: colors.text }]}>
                {i + 1}. {line}
              </Text>
            ))}
            {recipe.sourceUrl ? (
              <Pressable onPress={() => void Linking.openURL(recipe.sourceUrl!)}>
                <Text style={[styles.link, { color: colors.primary }]}>Open original recipe</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerBar: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headline: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  hero: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    backgroundColor: '#e8e8e8',
  },
  meta: {
    fontSize: 14,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  stepsLabel: {
    marginTop: spacing.lg,
  },
  line: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
});
