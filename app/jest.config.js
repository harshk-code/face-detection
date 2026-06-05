module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  watchman: false,
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?@?react-native|@react-native-community|@react-navigation|react-native-.*)/',
  ],
};
