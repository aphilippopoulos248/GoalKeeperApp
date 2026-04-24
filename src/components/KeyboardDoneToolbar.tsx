import { useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
} from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';

const TOOLBAR_HEIGHT = 48;

/**
 * Renders a "Done" bar just above the software keyboard on iOS and Android.
 * Uses keyboard frame events so it works everywhere `InputAccessoryView` does not.
 */
export function KeyboardDoneToolbar() {
  const { colors } = useAppTheme();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  if (keyboardHeight <= 0) {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="box-none">
      <View
        style={[
          styles.toolbar,
          {
            height: TOOLBAR_HEIGHT,
            bottom: keyboardHeight,
            backgroundColor: colors.surfaceElevated,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => Keyboard.dismiss()}
          style={({ pressed }) => [styles.doneButton, pressed && { opacity: 0.65 }]}
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityHint="Closes the keyboard"
        >
          <Text style={[styles.doneLabel, { color: colors.primary }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    elevation: 100000,
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  doneButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  doneLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
});
