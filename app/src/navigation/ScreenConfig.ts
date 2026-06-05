import type {ComponentType} from 'react';
import type {NativeStackNavigationOptions} from '@react-navigation/native-stack';

import {
  BenchmarkRoute,
  HomeRoute,
  IntroRoute,
  LoginRoute,
  NetworkLoggerRoute,
  OnboardFormRoute,
  OnboardScanRoute,
  ProfileRoute,
  SyncStatusRoute,
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

const DEV_SCREENS_CONFIG: RootScreenConfigItem[] = __DEV__
  ? [
      {
        name: Screens.NetworkLogger,
        component: NetworkLoggerRoute,
      },
      {
        name: Screens.Benchmark,
        component: BenchmarkRoute,
      },
    ]
  : [];

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
  {
    name: Screens.SyncStatus,
    component: SyncStatusRoute,
  },
  ...DEV_SCREENS_CONFIG,
];
