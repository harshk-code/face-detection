export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

export function l2Normalize(vector: number[]) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    throw new Error('Cannot normalize an empty vector.');
  }

  return vector.map(value => value / magnitude);
}

export function createCentroidEmbedding(vectors: number[][]) {
  if (!vectors.length) {
    throw new Error('Cannot create centroid without enrollment samples.');
  }

  const vectorLength = vectors[0].length;
  const centroid = new Array(vectorLength).fill(0);

  for (const vector of vectors) {
    if (vector.length !== vectorLength) {
      throw new Error('Enrollment sample dimensions do not match.');
    }

    for (let index = 0; index < vectorLength; index += 1) {
      centroid[index] += vector[index];
    }
  }

  for (let index = 0; index < vectorLength; index += 1) {
    centroid[index] /= vectors.length;
  }

  return l2Normalize(centroid);
}
