import React from 'react';
import {StyleSheet, View} from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {useFaceAuth} from '../app/FaceAuthContext';
import {UtilityFloatingTrigger} from '../components/UtilityFloatingTrigger';
import {ROOT_SCREENS_CONFIG, type RootScreenConfigItem} from './ScreenConfig';
import {Screens} from './constants';

import type {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function registerScreen({component, name, options}: RootScreenConfigItem) {
  return (
    <Stack.Screen
      key={name}
      name={name}
      component={component}
      options={{
        animation: 'slide_from_right',
        headerShown: false,
        ...options,
      }}
    />
  );
}

export function AppNavigator() {
  const {localTemplate} = useFaceAuth();

  return (
    <View style={styles.container}>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={localTemplate ? Screens.Home : Screens.Intro}
          screenOptions={{headerShown: false}}>
          {ROOT_SCREENS_CONFIG.map(registerScreen)}
        </Stack.Navigator>
      </NavigationContainer>
      <UtilityFloatingTrigger
        onPress={() => {
          if (!navigationRef.isReady()) {
            return;
          }

          if (navigationRef.getCurrentRoute()?.name === Screens.ApiSettings) {
            return;
          }

          navigationRef.navigate(Screens.ApiSettings);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
