import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {useFaceAuth} from '../app/FaceAuthContext';
import {ROOT_SCREENS_CONFIG, type RootScreenConfigItem} from './ScreenConfig';
import {Screens} from './constants';

import type {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={localTemplate ? Screens.Home : Screens.Intro}
        screenOptions={{headerShown: false}}>
        {ROOT_SCREENS_CONFIG.map(registerScreen)}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
