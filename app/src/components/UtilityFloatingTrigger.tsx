import React, {useCallback} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';

type Props = {
  onPress: () => void;
};

export function UtilityFloatingTrigger({onPress}: Props) {
  const handlePress = useCallback(() => {
    onPress();
  }, [onPress]);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable
        accessibilityLabel="Open API settings"
        accessibilityRole="button"
        hitSlop={16}
        onPress={handlePress}
        style={({pressed}) => [styles.dot, pressed && styles.pressed]}>
        <View style={styles.innerDot} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 2,
    bottom: 200,
    elevation: 9999,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: 20,
  },
  innerDot: {
    backgroundColor: '#38bdf8',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    elevation: 9999,
    zIndex: 9999,
  },
  pressed: {
    opacity: 0.7,
  },
});
