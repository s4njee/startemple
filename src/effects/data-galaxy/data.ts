import { createRandom } from '../../gpu/random.ts';

/*
 * The data a `data-galaxy` draws (story 3.7): points, each with a cluster, a value and a label. A
 * page hands its own through the library entry; the gallery shows a made-up set shaped like a
 * product's users or an embedding: a few clusters of very different sizes, and values with a long
 * tail (most small, a few large).
 */

export interface DataPoint {
  cluster: number;
  /** 0..1, how much the point matters: its brightness. */
  value: number;
  /** 0..1, where along its arm the point sits (an embedding's first axis, a date, a rank). */
  order: number;
  label: string;
}

export interface DataSet {
  points: DataPoint[];
  clusters: string[];
}

const CLUSTER_NAMES = ['Explorers', 'Builders', 'Readers', 'Night owls', 'Newcomers', 'Regulars'];

/** A made-up data set: `count` points in `clusters` clusters of uneven size. */
export function sampleData(count: number, clusters: number, seed: number): DataSet {
  const random = createRandom(seed);
  // Uneven cluster sizes: weights from a long-tailed draw.
  const weights = Array.from({ length: clusters }, () => 0.3 + random() ** 2 * 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    let u = random() * total;
    let cluster = 0;
    while (cluster < clusters - 1 && u > weights[cluster]!) u -= weights[cluster++]!;
    points.push({
      cluster,
      value: random() ** 3,
      order: random(),
      label: `${CLUSTER_NAMES[cluster % CLUSTER_NAMES.length]} · #${1000 + i}`,
    });
  }
  return { points, clusters: CLUSTER_NAMES.slice(0, clusters) };
}
