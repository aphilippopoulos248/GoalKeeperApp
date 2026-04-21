import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';

const TYPE_MS = 42;
const HOLD_MS = 800;
const ENTER_MS = 320;
const EXIT_MS = 450;

type Props = {
  visible: boolean;
  displayName: string;
  onFinished: () => void;
};

export function PostLoginGreetingOverlay({
  visible,
  displayName,
  onFinished,
}: Props) {
  const { colors } = useAppTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const [shownText, setShownText] = useState('');
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!visible) {
      setShownText('');
      fade.setValue(0);
      scale.setValue(0.92);
      return;
    }

    let cancelled = false;
    const message = `Hello ${displayName}, its nice to see you`;
    setShownText('');
    fade.setValue(0);
    scale.setValue(0.92);

    let typeInterval: ReturnType<typeof setInterval> | null = null;
    let holdTimeout: ReturnType<typeof setTimeout> | null = null;

    const enter = Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
    ]);

    enter.start(({ finished }) => {
      if (cancelled || !finished) return;
      let i = 0;
      typeInterval = setInterval(() => {
        if (cancelled) return;
        i += 1;
        setShownText(message.slice(0, i));
        if (i >= message.length) {
          if (typeInterval) clearInterval(typeInterval);
          typeInterval = null;
          holdTimeout = setTimeout(() => {
            if (cancelled) return;
            Animated.timing(fade, {
              toValue: 0,
              duration: EXIT_MS,
              useNativeDriver: true,
            }).start(({ finished: exitFinished }) => {
              if (cancelled || !exitFinished) return;
              onFinishedRef.current();
            });
          }, HOLD_MS);
        }
      }, TYPE_MS);
    });

    return () => {
      cancelled = true;
      enter.stop();
      if (typeInterval) clearInterval(typeInterval);
      if (holdTimeout) clearTimeout(holdTimeout);
    };
  }, [visible, displayName, fade, scale]);

  if (!visible) {
    return null;
  }

  const backdropStyle: ViewStyle = {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 999,
  };

  return (
    <Animated.View
      style={[backdropStyle, { opacity: fade }]}
      pointerEvents="auto"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Text
          style={[styles.message, { color: colors.text }]}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          {shownText}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 30,
  },
});
