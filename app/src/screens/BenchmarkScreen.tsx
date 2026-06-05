import React, {useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

import {ActionButton} from '../components/ActionButton';
import {CaptureScreen} from '../components/CaptureScreen';
import {generateFaceEmbedding} from '../faceAuth/embeddingModel';
import {matchFaceEmbedding} from '../faceAuth/matching';
import {createNormalizedFaceCrop} from '../faceAuth/preprocessing';
import {sampleLivenessFrame} from '../faceAuth/verifyLiveness';
import type {CapturedFacePhoto, FaceTemplate} from '../faceAuth/types';
import {detectMediaPipeFaceMesh} from '../native/MediaPipeFaceMesh';
import {
  summarizeTimings,
  timeStage,
  type StageSummary,
  type StageTimings,
} from '../dev/benchmark';
import {logInfo} from '../utils/logError';

type Props = {
  localTemplate: FaceTemplate;
  onBack: () => void;
};

const ITERATIONS = 20;

// Stage keys, ordered for display. "core" = detect + crop + infer + match,
// i.e. the recognition+liveness budget the spec caps at < 1 second (camera
// capture/settle excluded and reported separately).
const CORE_STAGES = ['detect', 'crop', 'infer', 'match'];

export function BenchmarkScreen({localTemplate, onBack}: Props) {
  const capturePhotoRef = useRef<(() => Promise<CapturedFacePhoto>) | null>(
    null,
  );
  const runningRef = useRef(false);
  const [status, setStatus] = useState(
    `Hold your face in frame, then run ${ITERATIONS} timed iterations.`,
  );
  const [progress, setProgress] = useState(0);
  const [summaries, setSummaries] = useState<StageSummary[] | null>(null);
  const [coreMedian, setCoreMedian] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function runBenchmark() {
    if (runningRef.current) {
      return;
    }
    if (!capturePhotoRef.current) {
      setStatus('Camera is not ready yet. Wait a moment and retry.');
      return;
    }

    runningRef.current = true;
    setIsRunning(true);
    setSummaries(null);
    setCoreMedian(null);

    const timings: StageTimings = {};
    const coreTotals: number[] = [];
    let completed = 0;

    try {
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        setStatus(`Running iteration ${iteration + 1} / ${ITERATIONS}...`);
        setProgress((iteration) / ITERATIONS);

        const capture = capturePhotoRef.current;
        if (!capture) {
          break;
        }

        const coreStart = Date.now();

        const photo = await timeStage(timings, 'capture', () => capture());

        const faceMesh = await timeStage(timings, 'detect', () =>
          detectMediaPipeFaceMesh(photo.path),
        );
        // Touch the liveness sampler so its cost is included in "detect".
        sampleLivenessFrame(faceMesh);

        const faceCrop = await timeStage(timings, 'crop', () =>
          createNormalizedFaceCrop({
            photoHeight: photo.photoHeight,
            photoPath: photo.path,
            photoWidth: photo.photoWidth,
          }),
        );

        const embedding = await timeStage(timings, 'infer', () =>
          generateFaceEmbedding(faceCrop),
        );

        await timeStage(timings, 'match', async () =>
          matchFaceEmbedding(embedding.vector, localTemplate),
        );

        // Core budget excludes the camera capture itself.
        const coreMs =
          Date.now() -
          coreStart -
          (timings.capture[timings.capture.length - 1] ?? 0);
        coreTotals.push(coreMs);
        completed += 1;
      }

      const stageSummaries = summarizeTimings(timings);
      const sortedCore = [...coreTotals].sort((a, b) => a - b);
      const medianCore = sortedCore.length
        ? sortedCore[Math.floor(sortedCore.length / 2)]
        : 0;

      setSummaries(stageSummaries);
      setCoreMedian(medianCore);
      setProgress(1);
      setStatus(
        `Done — ${completed} iterations. Core recognition+liveness median: ${medianCore} ms.`,
      );
      logInfo('benchmark:complete', {
        completed,
        coreMedianMs: medianCore,
        stages: stageSummaries,
      });
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Benchmark stopped: ${error.message}`
          : 'Benchmark stopped due to an error.',
      );
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }

  return (
    <CaptureScreen
      title="Benchmark"
      subtitle="On-device latency of the offline pipeline"
      primaryLabel=""
      enableLiveFaceDetector={false}
      primaryVisible={false}
      isBusy={isRunning}
      isFaceDetected
      onBack={onBack}
      onCapture={() => undefined}
      onCapturePhotoReady={capturePhoto => {
        capturePhotoRef.current = capturePhoto;
      }}
      onFaceDetectedChange={() => undefined}
      onFaceSnapshotChange={() => undefined}
      secondaryContent={
        <View style={styles.panel}>
          <Text style={styles.status}>{status}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]}
            />
          </View>

          {coreMedian !== null ? (
            <View
              style={[
                styles.verdict,
                coreMedian < 1000 ? styles.verdictPass : styles.verdictWarn,
              ]}>
              <Text style={styles.verdictText}>
                Core recognition + liveness: {coreMedian} ms median —{' '}
                {coreMedian < 1000 ? 'under 1s target ✓' : 'over 1s'}
              </Text>
            </View>
          ) : null}

          {summaries ? (
            <ScrollView style={styles.table} horizontal={false}>
              <Row
                bold
                cells={['Stage', 'min', 'med', 'p95', 'mean (ms)']}
              />
              {summaries
                .slice()
                .sort(
                  (a, b) =>
                    CORE_STAGES.indexOf(a.stage) - CORE_STAGES.indexOf(b.stage),
                )
                .map(summary => (
                  <Row
                    key={summary.stage}
                    cells={[
                      summary.stage,
                      String(summary.min),
                      String(summary.median),
                      String(summary.p95),
                      String(summary.mean),
                    ]}
                  />
                ))}
            </ScrollView>
          ) : null}

          <ActionButton
            label={isRunning ? 'Running…' : `Run ${ITERATIONS} iterations`}
            onPress={runBenchmark}
          />
        </View>
      }
    />
  );
}

function Row({cells, bold}: {cells: string[]; bold?: boolean}) {
  return (
    <View style={styles.row}>
      {cells.map((cell, index) => (
        <Text
          key={index}
          style={[
            styles.cell,
            index === 0 ? styles.cellStage : null,
            bold ? styles.cellBold : null,
          ]}>
          {cell}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 8,
  },
  status: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
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
  verdict: {
    borderRadius: 8,
    padding: 8,
  },
  verdictPass: {
    backgroundColor: 'rgba(22, 101, 52, 0.6)',
  },
  verdictWarn: {
    backgroundColor: 'rgba(127, 29, 29, 0.58)',
  },
  verdictText: {
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
  },
  table: {
    maxHeight: 180,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 6,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    color: '#e7edf5',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    paddingVertical: 2,
  },
  cellStage: {
    flex: 1.4,
    textAlign: 'left',
    textTransform: 'capitalize',
  },
  cellBold: {
    color: '#ffffff',
    fontWeight: '900',
  },
});
