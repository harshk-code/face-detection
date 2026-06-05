export const ROOT_STACK_SCREENS = {
  Home: 'Home',
  Intro: 'Intro',
  Login: 'Login',
  OnboardForm: 'OnboardForm',
  OnboardScan: 'OnboardScan',
  Profile: 'Profile',
  SyncStatus: 'SyncStatus',
} as const;

export const Screens = {
  ...ROOT_STACK_SCREENS,
} as const;
