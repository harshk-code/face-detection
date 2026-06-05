import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {CaptureScreen} from '../components/CaptureScreen';
import {enqueueAuthEventFireAndForget} from '../faceAuth/authEventQueue';
import {generateFaceEmbedding} from '../faceAuth/embeddingModel';
import {matchFaceEmbedding} from '../faceAuth/matching';
import {createNormalizedFaceCrop} from '../faceAuth/preprocessing';
import {
  challengePrompt,
  evaluateLiveness,
  livenessChallengeType,
  pickLivenessChallenge,
  sampleLivenessFrame,
  type LivenessChallenge,
  type LivenessFrame,
} from '../faceAuth/verifyLiveness';
import type {CapturedFacePhoto, FaceTemplate} from '../faceAuth/types';
import {
  detectMediaPipeFaceMesh,
} from '../native/MediaPipeFaceMesh';
import {logError, logInfo} from '../utils/logError';

type Props = {
  localTemplate: FaceTemplate;
  onAuthenticated: () => void;
  onBack: () => void;
};

type Phase = 'liveness' | 'matching';
type MatchDisplay = 'confirming' | 'matched' | 'rejected' | null;

const CAMERA_SETTLE_MS = 300;
const LIVENESS_SAMPLE_DELAY_MS = 350;
const MATCH_RETRY_DELAY_MS = 650;
const MAX_LIVENESS_FRAMES = 14;
const GOOD_MATCH_WINDOW_SIZE = 3;
const REQUIRED_GOOD_MATCHES_IN_WINDOW = 2;
const STRONG_MATCH_THRESHOLD = 0.82;

export function VerifyFaceScreen({
  localTemplate,
  onAuthenticated,
  onBack,
}: Props) {
  const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isCaptureInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const isCompletedRef = useRef(false);
  const capturePhotoRef = useRef<(() => Promise<CapturedFacePhoto>) | null>(
    null,
  );
  const livenessFramesRef = useRef<LivenessFrame[]>([]);
  const livenessPassedRef = useRef(false);
  const livenessSignalRef = useRef<LivenessChallenge | null>(null);
  // One challenge is drawn at random per login attempt. Only this challenge is
  // accepted, so a recording of a different gesture cannot be replayed.
  const livenessChallengeRef = useRef<LivenessChallenge>(pickLivenessChallenge());
  const recentScoresRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);

  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [phase, setPhase] = useState<Phase>('liveness');
  const [progress, setProgress] = useState(0);
  const [matchDisplay, setMatchDisplay] = useState<MatchDisplay>(null);
  const [toast, setToast] = useState(() =>
    challengePrompt(livenessChallengeRef.current),
  );

  useEffect(() => {
    isMountedRef.current = true;
    startedAtRef.current = Date.now();
    scheduleAutoCapture(CAMERA_SETTLE_MS);

    return () => {
      isMountedRef.current = false;
      clearAutoCaptureTimer();
    };
    // The capture loop reads refs so it can keep sampling across prompts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAutoCaptureTimer() {
    if (autoCaptureTimeoutRef.current) {
      clearTimeout(autoCaptureTimeoutRef.current);
      autoCaptureTimeoutRef.current = null;
    }
  }

  function scheduleAutoCapture(delayMs: number) {
    if (!isMountedRef.current || isCompletedRef.current) {
      return;
    }
    clearAutoCaptureTimer();
    autoCaptureTimeoutRef.current = setTimeout(() => {
      void handleAutoCapture();
    }, delayMs);
  }

  async function handleAutoCapture() {
    if (isCaptureInFlightRef.current || isCompletedRef.current) {
      return;
    }
    if (!capturePhotoRef.current) {
      scheduleAutoCapture(MATCH_RETRY_DELAY_MS);
      return;
    }

    isCaptureInFlightRef.current = true;
    setIsCapturing(true);
    let authenticated = false;

    try {
      const {path, photoHeight, photoWidth} = await capturePhotoRef.current();

      // Phase 1: gate the match behind an offline liveness check.
      if (!livenessPassedRef.current) {
        const faceMesh = await detectMediaPipeFaceMesh(path);
        livenessFramesRef.current = [
          ...livenessFramesRef.current,
          sampleLivenessFrame(faceMesh),
        ].slice(-MAX_LIVENESS_FRAMES);

        const challenge = livenessChallengeRef.current;
        const liveness = evaluateLiveness(livenessFramesRef.current, challenge);
        setProgress(liveness.progress);

        if (!liveness.passed) {
          setToast(challengePrompt(challenge));
          scheduleAutoCapture(LIVENESS_SAMPLE_DELAY_MS);
          return;
        }

        livenessPassedRef.current = true;
        livenessSignalRef.current = liveness.signal;
        setPhase('matching');
        setProgress(1);
        setToast('Liveness confirmed. Matching...');
        logInfo('face-auth:verify:liveness-passed', {
          frames: livenessFramesRef.current.length,
          signal: liveness.signal,
        });
        // Fall through and match on this capture.
      }

      // Phase 2: recognition.
      const faceCrop = await createNormalizedFaceCrop({
        photoHeight,
        photoPath: path,
        photoWidth,
      });
      const liveEmbedding = await generateFaceEmbedding(faceCrop);
      const result = matchFaceEmbedding(liveEmbedding.vector, localTemplate);

      enqueueAuthEventFireAndForget({
        capturedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAtRef.current,
        liveness: {
          passed: true,
          type: livenessChallengeType(livenessSignalRef.current),
        },
        matchResult: result,
        template: localTemplate,
      });

      if (result.matched) {
        const decision = recordMatchScore(result.score, result.threshold);
        logInfo('face-auth:verify:sample-accepted', {
          decision,
          livenessSignal: livenessSignalRef.current,
          score: Number(result.score.toFixed(6)),
          threshold: result.threshold,
        });

        if (decision.authenticated) {
          isCompletedRef.current = true;
          setMatchDisplay('matched');
          setToast('Face matched. Logging you in...');
          authenticated = true;
          return;
        }

        setMatchDisplay('confirming');
        setToast('Face matched. Hold still for confirmation...');
        scheduleAutoCapture(MATCH_RETRY_DELAY_MS);
        return;
      }

      recordMatchScore(result.score, result.threshold);
      setMatchDisplay('rejected');
      logInfo('face-auth:verify:sample-rejected', {
        score: Number(result.score.toFixed(6)),
        threshold: result.threshold,
      });
      setToast('Face did not match. Please try again.');
      scheduleAutoCapture(MATCH_RETRY_DELAY_MS);
    } catch (captureError) {
      logError('VerifyFaceScreen.handleAutoCapture', captureError);
      setToast(
        captureError instanceof Error
          ? captureError.message
          : 'Unable to match face.',
      );
      scheduleAutoCapture(MATCH_RETRY_DELAY_MS);
    } finally {
      if (isMountedRef.current && !isCompletedRef.current) {
        setIsCapturing(false);
        isCaptureInFlightRef.current = false;
      }
      if (authenticated) {
        onAuthenticated();
      }
    }
  }

  function recordMatchScore(score: number, threshold: number) {
    const recentScores = [...recentScoresRef.current, score].slice(
      -GOOD_MATCH_WINDOW_SIZE,
    );
    recentScoresRef.current = recentScores;
    const goodMatchCount = recentScores.filter(
      recentScore => recentScore >= threshold,
    ).length;
    const strongMatch = score >= STRONG_MATCH_THRESHOLD;

    return {
      authenticated:
        strongMatch || goodMatchCount >= REQUIRED_GOOD_MATCHES_IN_WINDOW,
      goodMatchCount,
      reason: strongMatch ? 'strong-match' : 'rolling-window',
      strongMatch,
    };
  }

  return (
    <CaptureScreen
      title="Login"
      subtitle="Liveness check, then face match — both run automatically"
      primaryLabel="Matching"
      enableLiveFaceDetector={false}
      primaryVisible={false}
      isBusy={isCapturing}
      isFaceDetected={isFaceDetected}
      onBack={onBack}
      onCapture={() => undefined}
      onCapturePhotoReady={capturePhoto => {
        capturePhotoRef.current = capturePhoto;
        if (capturePhoto) {
          scheduleAutoCapture(CAMERA_SETTLE_MS);
        }
      }}
      onFaceDetectedChange={setIsFaceDetected}
      onFaceSnapshotChange={() => undefined}
      secondaryContent={
        <View
          style={[
            styles.statusCard,
            matchDisplay === 'matched'
              ? styles.statusMatched
              : matchDisplay === 'confirming'
                ? styles.statusConfirming
                : matchDisplay
                  ? styles.statusRejected
                  : null,
          ]}>
          <Text style={styles.statusLabel}>
            {phase === 'matching' ? 'Recognition' : 'Liveness check'}
          </Text>
          <Text style={styles.statusTitle}>{toast}</Text>
          {phase === 'liveness' && !matchDisplay ? (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {width: `${Math.round(Math.min(1, progress) * 100)}%`},
                ]}
              />
            </View>
          ) : null}
          <Text style={styles.statusMeta}>
            {matchDisplay === 'matched'
              ? 'Authentication successful'
              : matchDisplay === 'rejected'
                ? 'Keep your face centered and try again'
                : `Verifying against ${localTemplate.personnelId}`}
          </Text>
        </View>
      }
    />
  );
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
    gap: 6,
  },
  statusMatched: {
    borderColor: 'rgba(110, 231, 168, 0.55)',
    backgroundColor: 'rgba(22, 101, 52, 0.6)',
  },
  statusConfirming: {
    borderColor: 'rgba(125, 211, 252, 0.55)',
    backgroundColor: 'rgba(14, 116, 144, 0.58)',
  },
  statusRejected: {
    borderColor: 'rgba(255, 180, 180, 0.55)',
    backgroundColor: 'rgba(127, 29, 29, 0.58)',
  },
  statusLabel: {
    color: '#d7dde8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
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
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#4f9dff',
  },
});
