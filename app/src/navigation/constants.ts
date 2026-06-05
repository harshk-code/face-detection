export const ROOT_STACK_SCREENS = {
  ApiSettings: 'ApiSettings',
  Home: 'Home',
  Intro: 'Intro',
  Login: 'Login',
  NetworkLogger: 'NetworkLogger',
  OnboardForm: 'OnboardForm',
  OnboardScan: 'OnboardScan',
  Profile: 'Profile',
  SyncStatus: 'SyncStatus',
} as const;

export const Screens = {
  ...ROOT_STACK_SCREENS,
} as const;
