import {Camera} from 'react-native-vision-camera';

export type AppCameraPermissionStatus = {
  canRequestPermission: boolean;
  hasPermission: boolean;
  status?: string;
};

export async function getCameraPermissionStatus() {
  return toPermissionPayload(Camera.getCameraPermissionStatus());
}

export async function requestCameraPermission() {
  const status = await Camera.requestCameraPermission();

  return toPermissionPayload(status);
}

function toPermissionPayload(status: string): AppCameraPermissionStatus {
  return {
    canRequestPermission: status === 'not-determined',
    hasPermission: status === 'authorized' || status === 'granted',
    status,
  };
}
