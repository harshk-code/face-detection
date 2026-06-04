import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {ActionButton} from '../components/ActionButton';
import {logInfo} from '../utils/logError';

const introImage = require('../assets/images/intro.png');

type Props = {
  onOnboard: () => void;
  permissionMessage?: string | null;
};

export function IntroScreen({onOnboard, permissionMessage}: Props) {
  const {width, height} = useWindowDimensions();
  const imageHeight = Math.min(height * 0.68, width * 1.72);

  function handleOnboardPress() {
    logInfo('intro:onboard-press', {
      imageHeight,
      screenHeight: height,
      screenWidth: width,
    });
    onOnboard();
  }

  return (
    <View style={styles.container}>
      <View style={styles.imageWrap}>
        <Image
          source={introImage}
          resizeMode="cover"
          style={[
            styles.image,
            {
              height: imageHeight,
              width,
            },
          ]}
        />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>Offline Face Auth</Text>
        <Text style={styles.subtitle}>
          Secure field personnel onboarding and login for zero-network zones.
        </Text>
        {permissionMessage ? (
          <Text style={styles.permissionMessage}>{permissionMessage}</Text>
        ) : null}
      </View>

      <View style={styles.bottomBar}>
        <ActionButton
          label="Onboard"
          onPress={handleOnboardPress}
          style={styles.onboardButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fa',
  },
  imageWrap: {
    overflow: 'hidden',
    backgroundColor: '#dbe5f0',
  },
  image: {
    alignSelf: 'center',
  },
  copy: {
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  title: {
    color: '#172033',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: '#526173',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  permissionMessage: {
    color: '#9f3a22',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 12,
  },
  bottomBar: {
    marginTop: 'auto',
    padding: 20,
    paddingBottom: 28,
  },
  onboardButton: {
    minHeight: 58,
  },
});
