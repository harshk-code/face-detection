import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import {ActionButton} from './ActionButton';
import type {CapturedFacePhoto} from '../faceAuth/types';
import {logError, logInfo} from '../utils/logError';
import {traceNative} from '../utils/nativeTrace';

type Props = {
  active: boolean;
  enableLiveFaceDetector?: boolean;
  onCapturePhotoReady?: (
    capturePhoto: (() => Promise<CapturedFacePhoto>) | null,
  ) => void;
  onFaceDetectedChange?: (isDetected: boolean) => void;
  onFaceSnapshotChange?: (face: null) => void;
};

export function CameraPanel({
  active,
  enableLiveFaceDetector = true,
  onCapturePhotoReady,
  onFaceDetectedChange,
  onFaceSnapshotChange,
}: Props) {
  traceNative('camera-panel-render-start', {active, enableLiveFaceDetector});
  const cameraRef = React.useRef<Camera>(null);
  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();

  React.useEffect(() => {
    logInfo('camera:panel:render-state', {
      active,
      deviceId: device?.id ?? null,
      deviceName: device?.name ?? null,
      hasPermission,
    });
  }, [active, device?.id, device?.name, hasPermission]);

  React.useEffect(() => {
    onFaceDetectedChange?.(true);
    onFaceSnapshotChange?.(null);
  }, [onFaceDetectedChange, onFaceSnapshotChange]);

  const capturePhoto = React.useCallback(async () => {
    const camera = cameraRef.current;

    if (!camera) {
      throw new Error('Camera is not ready yet. Please wait for preview.');
    }

    const photo = await camera.takePhoto({
      enableShutterSound: false,
      flash: 'off',
    });
    return {
      path: normalizePhotoPath(photo.path),
      photoHeight: photo.height,
      photoWidth: photo.width,
    };
  }, []);

  React.useEffect(() => {
    onCapturePhotoReady?.(capturePhoto);

    return () => {
      onCapturePhotoReady?.(null);
    };
  }, [capturePhoto, onCapturePhotoReady]);

  if (!hasPermission) {
    traceNative('camera-panel-render-permission-fallback', {});
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>Camera permission required</Text>
        <Text style={styles.copy}>
          Camera access is needed to capture a verification photo.
        </Text>
        <ActionButton label="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  if (!device) {
    traceNative('camera-panel-render-no-device', {});
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>No front camera found</Text>
        <Text style={styles.copy}>
          Use a device or simulator profile with a front camera.
        </Text>
      </View>
    );
  }

  traceNative('camera-panel-render-camera', {
    deviceId: device.id,
    deviceName: device.name,
  });

  return (
    <View style={styles.preview}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={active}
        photo
        onInitialized={() => {
          logInfo('camera:v4:initialized', {
            deviceId: device.id,
            deviceName: device.name,
          });
        }}
        onPreviewStarted={() => {
          logInfo('camera:v4:preview-started', {
            deviceId: device.id,
            deviceName: device.name,
          });
        }}
        onPreviewStopped={() => {
          logInfo('camera:v4:preview-stopped', {
            deviceId: device.id,
            deviceName: device.name,
          });
        }}
        onError={error => {
          logError('camera:v4:error', error);
        }}
      />
      <View pointerEvents="none" style={[styles.faceBox, styles.staticFaceBox]} />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Position face in frame</Text>
      </View>
    </View>
  );
}

function normalizePhotoPath(path: string) {
  return path.startsWith('file://') ? path.replace('file://', '') : path;
}

const styles = StyleSheet.create({
  preview: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  overlay: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 144,
    minHeight: 40,
    minWidth: 140,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
  },
  overlayText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  faceBox: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#19b86a',
    backgroundColor: 'transparent',
  },
  staticFaceBox: {
    alignSelf: 'center',
    top: '22%',
    width: '58%',
    aspectRatio: 1,
  },
  fallback: {
    flex: 1,
    backgroundColor: '#e7edf5',
    justifyContent: 'center',
    padding: 20,
    gap: 14,
  },
  title: {
    color: '#172033',
    fontSize: 18,
    fontWeight: '800',
  },
  copy: {
    color: '#526173',
    fontSize: 14,
    lineHeight: 20,
  },
});
