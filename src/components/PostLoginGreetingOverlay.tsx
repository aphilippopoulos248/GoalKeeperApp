import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';

const TYPE_MS = 38;
const ENTER_MS = 320;
const EXIT_MS = 450;

function holdMsForMessage(message: string): number {
  return Math.min(2600, 650 + message.length * 11);
}

type Props = {
  visible: boolean;
  /** Goals still loading from storage — show a short wait state. */
  preparing: boolean;
  message: string;
  onFinished: () => void;
};

export function PostLoginGreetingOverlay({
  visible,
  preparing,
  message,
  onFinished,
}: Props) {
  const { colors } = useAppTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const [shownText, setShownText] = useState('');
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!visible || preparing || !message) {
      setShownText('');
      fade.setValue(0);
      scale.setValue(0.92);
      return;
    }

    let cancelled = false;
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
          }, holdMsForMessage(message));
        }
      }, TYPE_MS);
    });

    return () => {
      cancelled = true;
      enter.stop();
      if (typeInterval) clearInterval(typeInterval);
      if (holdTimeout) clearTimeout(holdTimeout);
    };
  }, [visible, preparing, message, fade, scale]);

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

  if (preparing) {
    return (
      <View style={backdropStyle} pointerEvents="auto">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const fontSize = message.length > 300 ? 16 : message.length > 220 ? 18 : 22;
  const lineHeight = fontSize + 8;

  return (
    <Animated.View
      style={[backdropStyle, { opacity: fade }]}
      pointerEvents="auto"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Text
          style={[styles.message, { color: colors.text, fontSize, lineHeight }]}
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
    fontWeight: '600',
    textAlign: 'center',
  },
});
