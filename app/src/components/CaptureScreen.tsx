import React, {type ReactNode} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {ActionButton} from './ActionButton';
import {CameraPanel} from './CameraPanel';
import type {CapturedFacePhoto, DetectedFaceSnapshot} from '../faceAuth/types';
import {traceNative} from '../utils/nativeTrace';

type Props = {
  title: string;
  subtitle: string;
  cameraActive?: boolean;
  primaryLabel: string;
  enableLiveFaceDetector?: boolean;
  primaryVisible?: boolean;
  secondaryContent?: ReactNode;
  isBusy: boolean;
  isFaceDetected: boolean;
  onBack: () => void;
  onCapture: () => void;
  onCapturePhotoReady: (
    capturePhoto: (() => Promise<CapturedFacePhoto>) | null,
  ) => void;
  onFaceDetectedChange: (isDetected: boolean) => void;
  onFaceSnapshotChange: (face: DetectedFaceSnapshot | null) => void;
};

export function CaptureScreen({
  title,
  subtitle,
  cameraActive = true,
  primaryLabel,
  enableLiveFaceDetector = true,
  primaryVisible = true,
  secondaryContent,
  isBusy,
  isFaceDetected,
  onBack,
  onCapture,
  onCapturePhotoReady,
  onFaceDetectedChange,
  onFaceSnapshotChange,
}: Props) {
  traceNative('capture-screen-render', {
    enableLiveFaceDetector,
    primaryVisible,
    title,
  });

  return (
    <View style={styles.container}>
      <CameraPanel
        active={cameraActive}
        enableLiveFaceDetector={enableLiveFaceDetector}
        onCapturePhotoReady={onCapturePhotoReady}
        onFaceDetectedChange={onFaceDetectedChange}
        onFaceSnapshotChange={onFaceSnapshotChange}
      />

      <View pointerEvents="box-none" style={styles.topBar}>
        <ActionButton label="Back" variant="secondary" onPress={onBack} />
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <View pointerEvents="box-none" style={styles.bottomBar}>
        {secondaryContent ? (
          <View style={styles.secondaryContent}>{secondaryContent}</View>
        ) : null}
        {primaryVisible ? (
          <ActionButton
            label={isBusy ? 'Processing...' : primaryLabel}
            disabled={isBusy || !isFaceDetected}
            onPress={onCapture}
            style={styles.captureButton}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 18,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    padding: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: '#d7dde8',
    marginTop: 2,
    fontSize: 12,
  },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    gap: 12,
  },
  secondaryContent: {
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    padding: 12,
  },
  captureButton: {
    minHeight: 60,
  },
});
