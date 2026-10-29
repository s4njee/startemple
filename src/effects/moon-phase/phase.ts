/*
 * The Moon's phase as a value (story 5.6).
 *
 * `phase` runs 0 (new) to 0.5 (full) to 1 (new again), as Moon Temple's moon.wgsl has it: the angle
 * between the sun and the viewer, seen from the Moon, is 2π · phase from new. The lit part of the
 * disc is then (1 − cos 2π·phase) / 2 of it. That is not linear: a progress bar whose phase angle
 * grew evenly would show 15% lit a quarter of the way through and 85% three quarters through, so a
 * loader maps progress to the lit area, not to the angle.
 *
 * The shape of the light is exact in two pieces: the half of the limb towards the sun, and the
 * terminator, which seen from far off is half an ellipse whose half-width is |cos 2π·phase| of the
 * radius. CSS can draw that with a half disc and a scaled ellipse. The common two-circle version,
 * a dark disc slid over a light one, cannot: its inner edge is an arc of a circle, which is right
 * only at new and full (`twoCircleError` measures how far it is from the true crescent).
 */

export function litFraction(phase: number): number {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/** The waxing phase (0 to 0.5) for `progress` 0 to 1, by lit area or by phase angle. */
export function phaseForProgress(progress: number, byArea = true): number {
  const p = Math.min(1, Math.max(0, progress));
  return byArea ? Math.acos(1 - 2 * p) / (2 * Math.PI) : p / 2;
}

/** Whether the point (x, y) on a unit disc is lit at `phase`, waxing lit on the right. */
export function isLit(x: number, y: number, phase: number): boolean {
  if (x * x + y * y > 1) return false;
  // The terminator on this row: cos(2π·phase) of the half-chord, from the right edge at new to
  // the left edge at full.
  const terminator = Math.cos(2 * Math.PI * phase) * Math.sqrt(1 - y * y);
  return phase % 1 < 0.5 ? x > terminator : x < -terminator;
}

/**
 * The share of the disc that a two-circle crescent gets wrong: a dark disc of the same radius slid
 * across a light one by the offset that lights the same area, against the true crescent of `phase`
 * (waxing). 0 at new and full, most at the quarters, where the true terminator is a straight line.
 */
export function twoCircleError(phase: number, grid = 400): number {
  const want = litFraction(phase);
  // The two-circle crescent lights the part of the light disc outside the dark one, offset d to
  // the left; its lit area grows from 0 at d = 0 to all of it at d = 2. Bisect for the area.
  const lit = (d: number) => {
    let inside = 0;
    let total = 0;
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const x = -1 + (2 * (i + 0.5)) / grid;
        const y = -1 + (2 * (j + 0.5)) / grid;
        if (x * x + y * y > 1) continue;
        total++;
        if ((x + d) * (x + d) + y * y > 1) inside++;
      }
    }
    return inside / total;
  };
  let lo = 0;
  let hi = 2;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (lit(mid) < want) lo = mid;
    else hi = mid;
  }
  const d = (lo + hi) / 2;
  let wrong = 0;
  let total = 0;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const x = -1 + (2 * (i + 0.5)) / grid;
      const y = -1 + (2 * (j + 0.5)) / grid;
      if (x * x + y * y > 1) continue;
      total++;
      const circles = (x + d) * (x + d) + y * y > 1;
      if (circles !== isLit(x, y, phase)) wrong++;
    }
  }
  return wrong / total;
}
