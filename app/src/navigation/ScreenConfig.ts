import type {ComponentType} from 'react';
import type {NativeStackNavigationOptions} from '@react-navigation/native-stack';

import {
  HomeRoute,
  IntroRoute,
  LoginRoute,
  OnboardFormRoute,
  OnboardScanRoute,
  ProfileRoute,
} from './routes';
import {Screens} from './constants';

import type {RootStackParamList} from './types';

export interface RootScreenConfigItem<
  Name extends keyof RootStackParamList = keyof RootStackParamList,
> {
  component: ComponentType<any>;
  name: Name;
  options?: NativeStackNavigationOptions;
}

export const ROOT_SCREENS_CONFIG: RootScreenConfigItem[] = [
  {
    name: Screens.Intro,
    component: IntroRoute,
  },
  {
    name: Screens.OnboardScan,
    component: OnboardScanRoute,
  },
  {
    name: Screens.OnboardForm,
    component: OnboardFormRoute,
  },
  {
    name: Screens.Home,
    component: HomeRoute,
  },
  {
    name: Screens.Login,
    component: LoginRoute,
  },
  {
    name: Screens.Profile,
    component: ProfileRoute,
  },
];
