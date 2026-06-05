/* eslint-env jest */

jest.mock('react-native-vision-camera', () => ({
  Camera: props => {
    const React = require('react');
    const {View} = require('react-native');

    return React.createElement(View, props);
  },
  useCameraDevice: () => ({id: 'front-camera'}),
  useCameraPermission: () => ({
    hasPermission: true,
    requestPermission: jest.fn(() => Promise.resolve(true)),
  }),
  usePhotoOutput: () => ({
    capturePhoto: jest.fn(() =>
      Promise.resolve({
        saveToTemporaryFileAsync: jest.fn(() =>
          Promise.resolve('/tmp/morth-capture.jpg'),
        ),
        dispose: jest.fn(),
      },
      ),
    ),
  }),
}));

jest.mock('react-native-device-info', () => ({
  getDeviceName: jest.fn(() => Promise.resolve('Test Device')),
  getVersion: jest.fn(() => '0.0.1'),
}));
