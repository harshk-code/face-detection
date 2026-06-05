import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {CaptureScreen} from '../components/CaptureScreen';
import {generateFaceEmbedding} from '../faceAuth/embeddingModel';
import {matchFaceEmbedding} from '../faceAuth/matching';
import {createNormalizedFaceCrop} from '../faceAuth/preprocessing';
import type {
  CapturedFacePhoto,
  DetectedFaceSnapshot,
  FaceTemplate,
} from '../faceAuth/types';
import {logError, logInfo} from '../utils/logError';

type Props = {
  localTemplate: FaceTemplate;
  onAuthenticated: () => void;
  onBack: () => void;
};

type MatchDisplay = 'matched' | 'rejected' | null;

const AUTO_CAPTURE_DELAY_MS = 900;
const CAMERA_SETTLE_MS = 650;
const RETRY_DELAY_MS = 1400;

export function VerifyFaceScreen({
  localTemplate,
  onAuthenticated,
  onBack,
}: Props) {
  const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isCaptureInFlightRef = useRef(false);
  const latestFaceRef = useRef<DetectedFaceSnapshot | null>(null);
  const capturePhotoRef = useRef<(() => Promise<CapturedFacePhoto>) | null>(
    null,
  );
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [matchDisplay, setMatchDisplay] = useState<MatchDisplay>(null);
  const [toast, setToast] = useState('Look at the camera');

  useEffect(() => {
    return () => {
      if (autoCaptureTimeoutRef.current) {
        clearTimeout(autoCaptureTimeoutRef.current);
      }
    };
  }, []);

  const handleFaceSnapshotChange = useCallback(
    (face: DetectedFaceSnapshot | null) => {
      latestFaceRef.current = face;
    },
    [],
  );

  useEffect(() => {
    if (!isFaceDetected || isCapturing || isCaptureInFlightRef.current) {
      return;
    }

    setToast('Face detected. Matching...');
    autoCaptureTimeoutRef.current = setTimeout(() => {
      void handleAutoCapture();
    }, AUTO_CAPTURE_DELAY_MS);

    return () => {
      if (autoCaptureTimeoutRef.current) {
        clearTimeout(autoCaptureTimeoutRef.current);
      }
    };
    // handleAutoCapture intentionally reads refs and stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCapturing, isFaceDetected]);

  async function handleAutoCapture() {
    if (isCaptureInFlightRef.current) {
      return;
    }

    isCaptureInFlightRef.current = true;
    setIsCapturing(true);
    let authenticated = false;

    try {
      setMatchDisplay(null);
      await delay(CAMERA_SETTLE_MS);

      if (!capturePhotoRef.current) {
        throw new Error('Camera is not ready yet. Please try again.');
      }

      const {path, photoHeight, photoWidth} = await capturePhotoRef.current();

      const faceCrop = await createNormalizedFaceCrop({
        detectedFace: latestFaceRef.current,
        photoHeight,
        photoPath: path,
        photoWidth,
      });
      const liveEmbedding = await generateFaceEmbedding(faceCrop);
      const result = matchFaceEmbedding(liveEmbedding.vector, localTemplate);
      setMatchDisplay(result.matched ? 'matched' : 'rejected');

      if (result.matched) {
        setToast('Face matched. Logging you in...');
        authenticated = true;
        return;
      }

      setToast('Face did not match. Please try again.');
      await delay(RETRY_DELAY_MS);
    } catch (captureError) {
      logError('VerifyFaceScreen.handleAutoCapture', captureError);
      setToast(
        captureError instanceof Error
          ? captureError.message
          : 'Unable to match face.',
      );
      await delay(RETRY_DELAY_MS);
    } finally {
      setIsCapturing(false);
      isCaptureInFlightRef.current = false;

      if (authenticated) {
        onAuthenticated();
      }
    }
  }

  return (
    <CaptureScreen
      title="Login"
      subtitle="Face match starts automatically"
      primaryLabel="Matching"
      enableLiveFaceDetector={false}
      primaryVisible={false}
      isBusy={isCapturing}
      isFaceDetected={isFaceDetected}
      onBack={onBack}
      onCapture={() => undefined}
      onCapturePhotoReady={capturePhoto => {
        capturePhotoRef.current = capturePhoto;
      }}
      onFaceDetectedChange={setIsFaceDetected}
      onFaceSnapshotChange={handleFaceSnapshotChange}
      secondaryContent={
        <View
          style={[
            styles.statusCard,
            matchDisplay === 'matched'
              ? styles.statusMatched
              : matchDisplay
                ? styles.statusRejected
                : null,
          ]}>
          <Text style={styles.statusTitle}>{toast}</Text>
          {matchDisplay ? (
            <Text style={styles.statusMeta}>
              {matchDisplay === 'matched'
                ? 'Authentication successful'
                : 'Keep your face centered and try again'}
            </Text>
          ) : (
            <Text style={styles.statusMeta}>
              Waiting for a clear face to compare with {localTemplate.personnelId}
            </Text>
          )}
        </View>
      }
    />
  );
}

function delay(durationMs: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, durationMs);
  });
}

const styles = StyleSheet.create({
  statusCard: {
    minHeight: 64,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    padding: 12,
    gap: 4,
  },
  statusMatched: {
    borderColor: 'rgba(110, 231, 168, 0.55)',
    backgroundColor: 'rgba(22, 101, 52, 0.6)',
  },
  statusRejected: {
    borderColor: 'rgba(255, 180, 180, 0.55)',
    backgroundColor: 'rgba(127, 29, 29, 0.58)',
  },
  statusTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusMeta: {
    color: '#e7edf5',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
