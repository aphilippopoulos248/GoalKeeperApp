import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import {
  type AvataaarsCustomization,
  AVATAAARS_ACCESSORIES,
  AVATAAARS_ACCESSORIES_COLOR,
  AVATAAARS_BACKGROUND_TYPE,
  AVATAAARS_CLOTHES_COLOR,
  AVATAAARS_CLOTHING,
  AVATAAARS_CLOTHING_GRAPHIC,
  AVATAAARS_EYEBROWS,
  AVATAAARS_EYES,
  AVATAAARS_FACIAL_HAIR,
  AVATAAARS_FACIAL_HAIR_COLOR,
  AVATAAARS_HAIR_COLOR,
  AVATAAARS_HAT_COLOR,
  AVATAAARS_MOUTH,
  AVATAAARS_SKIN_COLOR,
  AVATAAARS_TOP,
  buildAvataaarsPngUrl,
} from '../lib/avataaarsOptions';

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\d+/, (m) => `${m} `)
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const PROB_STEPS = [0, 25, 50, 75, 100] as const;

type OptionRowProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onPick: (v: T) => void;
  colors: ThemeColors;
};

function OptionRow<T extends string>({
  label,
  options,
  value,
  onPick,
  colors,
}: OptionRowProps<T>) {
  return (
    <View style={styles.rowSection}>
      <Text style={[styles.subheading, { color: colors.textSecondary }]}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onPick(opt)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected
                    ? colors.primaryMuted
                    : colors.surfaceElevated,
                },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.chipText,
                  { color: selected ? colors.primary : colors.text },
                ]}
              >
                {humanize(opt)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

type ColorRowProps = {
  label: string;
  options: readonly string[];
  value: string;
  onPick: (hex: string) => void;
  colors: ThemeColors;
};

function ColorRow({ label, options, value, onPick, colors }: ColorRowProps) {
  return (
    <View style={styles.rowSection}>
      <Text style={[styles.subheading, { color: colors.textSecondary }]}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {options.map((hex) => {
          const selected = value === hex;
          return (
            <Pressable
              key={hex}
              onPress={() => onPick(hex)}
              accessibilityLabel={`${label} color ${hex}`}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.colorSwatch,
                { backgroundColor: `#${hex}` },
                {
                  borderColor: selected ? colors.primary : colors.border,
                  borderWidth: selected ? 3 : 1,
                },
                pressed && { opacity: 0.9 },
              ]}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

type ProbRowProps = {
  label: string;
  value: number;
  onPick: (n: (typeof PROB_STEPS)[number]) => void;
  colors: ThemeColors;
};

function ProbRow({ label, value, onPick, colors }: ProbRowProps) {
  return (
    <View style={styles.rowSection}>
      <Text style={[styles.subheading, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.probRow}>
        {PROB_STEPS.map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => onPick(n)}
              accessibilityLabel={`${label} ${n} percent`}
              style={({ pressed }) => [
                styles.probChip,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primaryMuted : colors.surfaceElevated,
                },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text
                style={[
                  styles.probText,
                  { color: selected ? colors.primary : colors.text },
                ]}
              >
                {n}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type Props = {
  seed: string;
  value: AvataaarsCustomization;
  onChange: (next: AvataaarsCustomization) => void;
  colors: ThemeColors;
  previewSize?: number;
  onRandomizeAll: () => void;
  disabled?: boolean;
};

export function AvataaarsAvatarEditor({
  seed,
  value,
  onChange,
  colors,
  previewSize = 220,
  onRandomizeAll,
  disabled = false,
}: Props) {
  const set = (patch: Partial<AvataaarsCustomization>) => {
    onChange({ ...value, ...patch });
  };

  const uri = buildAvataaarsPngUrl(seed, previewSize, value);

  return (
    <View>
      <Text
        style={[
          styles.hint,
          { color: colors.textSecondary },
        ]}
      >
        Tune your Avataaars character below. You can also randomize everything for a
        quick start.
      </Text>
      <View
        style={[
          styles.previewRing,
          { borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <Image
          source={{ uri }}
          style={[styles.previewImage, { width: previewSize, height: previewSize }]}
          accessibilityLabel="Avatar preview"
        />
      </View>

      <View style={styles.toggleRow}>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>Frame</Text>
        <View style={styles.probRow}>
          {(
            [
              { k: 'default' as const, l: 'Default' },
              { k: 'circle' as const, l: 'Circle' },
            ] as const
          ).map(({ k, l }) => {
            const selected = value.style === k;
            return (
              <Pressable
                key={k}
                onPress={() => set({ style: k })}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.probChip,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primaryMuted
                      : colors.surfaceElevated,
                  },
                  disabled && { opacity: 0.5 },
                  pressed && !disabled && { opacity: 0.9 },
                ]}
              >
                <Text
                  style={[
                    styles.probText,
                    { color: selected ? colors.primary : colors.text },
                  ]}
                >
                  {l}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.toggleRow}>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>Flip</Text>
        <View style={styles.probRow}>
          {(
            [
              { v: false, l: 'No' },
              { v: true, l: 'Yes' },
            ] as const
          ).map(({ v, l }) => {
            const selected = value.flip === v;
            return (
              <Pressable
                key={l}
                onPress={() => set({ flip: v })}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.probChip,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primaryMuted
                      : colors.surfaceElevated,
                  },
                  disabled && { opacity: 0.5 },
                  pressed && !disabled && { opacity: 0.9 },
                ]}
              >
                <Text
                  style={[
                    styles.probText,
                    { color: selected ? colors.primary : colors.text },
                  ]}
                >
                  {l}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <OptionRow
        label="Background style"
        options={AVATAAARS_BACKGROUND_TYPE}
        value={value.backgroundType}
        onPick={(backgroundType) => set({ backgroundType })}
        colors={colors}
      />
      <ColorRow
        label="Background color"
        options={AVATAAARS_CLOTHES_COLOR}
        value={value.backgroundColor}
        onPick={(backgroundColor) => set({ backgroundColor })}
        colors={colors}
      />

      <OptionRow
        label="Hair or headwear"
        options={AVATAAARS_TOP}
        value={value.top}
        onPick={(top) => set({ top })}
        colors={colors}
      />
      <ProbRow
        label="Show hair (vs bare)"
        value={value.topProbability}
        onPick={(n) => set({ topProbability: n })}
        colors={colors}
      />
      <ColorRow
        label="Hat / band color (when used)"
        options={AVATAAARS_HAT_COLOR}
        value={value.hatColor}
        onPick={(hatColor) => set({ hatColor })}
        colors={colors}
      />

      <ColorRow
        label="Skin"
        options={AVATAAARS_SKIN_COLOR}
        value={value.skinColor}
        onPick={(skinColor) => set({ skinColor })}
        colors={colors}
      />
      <ColorRow
        label="Hair"
        options={AVATAAARS_HAIR_COLOR}
        value={value.hairColor}
        onPick={(hairColor) => set({ hairColor })}
        colors={colors}
      />

      <OptionRow
        label="Eyes"
        options={AVATAAARS_EYES}
        value={value.eyes}
        onPick={(eyes) => set({ eyes })}
        colors={colors}
      />
      <OptionRow
        label="Eyebrows"
        options={AVATAAARS_EYEBROWS}
        value={value.eyebrows}
        onPick={(eyebrows) => set({ eyebrows })}
        colors={colors}
      />
      <OptionRow
        label="Mouth"
        options={AVATAAARS_MOUTH}
        value={value.mouth}
        onPick={(mouth) => set({ mouth })}
        colors={colors}
      />

      <ProbRow
        label="Glasses (chance)"
        value={value.accessoriesProbability}
        onPick={(n) => set({ accessoriesProbability: n })}
        colors={colors}
      />
      <OptionRow
        label="Glasses"
        options={AVATAAARS_ACCESSORIES}
        value={value.accessories}
        onPick={(accessories) => set({ accessories })}
        colors={colors}
      />
      <ColorRow
        label="Glasses color"
        options={AVATAAARS_ACCESSORIES_COLOR}
        value={value.accessoriesColor}
        onPick={(accessoriesColor) => set({ accessoriesColor })}
        colors={colors}
      />

      <ProbRow
        label="Facial hair (chance)"
        value={value.facialHairProbability}
        onPick={(n) => set({ facialHairProbability: n })}
        colors={colors}
      />
      <OptionRow
        label="Facial hair"
        options={AVATAAARS_FACIAL_HAIR}
        value={value.facialHair}
        onPick={(facialHair) => set({ facialHair })}
        colors={colors}
      />
      <ColorRow
        label="Facial hair color"
        options={AVATAAARS_FACIAL_HAIR_COLOR}
        value={value.facialHairColor}
        onPick={(facialHairColor) => set({ facialHairColor })}
        colors={colors}
      />

      <OptionRow
        label="Clothing"
        options={AVATAAARS_CLOTHING}
        value={value.clothing}
        onPick={(clothing) => set({ clothing })}
        colors={colors}
      />
      {value.clothing === 'graphicShirt' ? (
        <OptionRow
          label="Shirt graphic"
          options={AVATAAARS_CLOTHING_GRAPHIC}
          value={value.clothingGraphic}
          onPick={(clothingGraphic) => set({ clothingGraphic })}
          colors={colors}
        />
      ) : null}
      <ColorRow
        label="Clothes"
        options={AVATAAARS_CLOTHES_COLOR}
        value={value.clothesColor}
        onPick={(clothesColor) => set({ clothesColor })}
        colors={colors}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Randomize all avatar options"
        onPress={onRandomizeAll}
        disabled={disabled}
        style={({ pressed }) => [
          styles.randomButton,
          { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
          disabled && { opacity: 0.5 },
          pressed && !disabled && { opacity: 0.9 },
        ]}
      >
        <Text style={[styles.randomLabel, { color: colors.text }]}>
          Randomize everything
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  previewRing: {
    alignSelf: 'center',
    borderRadius: 9999,
    borderWidth: 2,
    padding: 6,
    marginBottom: spacing.lg,
  },
  previewImage: {
    borderRadius: 9999,
  },
  rowSection: {
    marginBottom: spacing.md,
  },
  subheading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    borderWidth: 2,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 200,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  probRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  probChip: {
    borderWidth: 2,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  probText: {
    fontSize: 15,
    fontWeight: '700',
  },
  toggleRow: {
    marginBottom: spacing.md,
  },
  randomButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  randomLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});
