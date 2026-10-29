## How it works

The Moon as a body, its phase the value. A sphere seen from far off, lit from the direction the phase puts the sun in: behind the Moon at new, beside it at the quarters, behind us at full. Its face scatters by Lommel-Seeliger, μ0 / (μ0 + μ), as Moon Temple's `moon.wgsl` does, so a full moon is a flat coin and not a ball, with the same maria (`src/wgsl/moon.wgsl`, copied from Moon Temple's committed tree). On top of that:

- **Progress is the lit area.** The lit share of the disc is (1 − cos 2π·phase) / 2, which is not linear in the phase: a loader whose phase angle grew evenly would show 15% lit a quarter of the way through. `progress is the lit area` maps progress p to the phase acos(1 − 2p) / 2π, so the light grows evenly; `phase angle` keeps the angle linear.
- **A soft terminator**: μ0 eased through zero (a softplus over `softness`) instead of clipped, so the edge of the light is a gradient a loader sweeps smoothly.
- **Craters** along it: a little relief, which only the low sun at the terminator picks out.
- **Earthshine**: the dark part lit by the Earth, which is full when the Moon is new, so it is strongest in a thin crescent and gone at full, and bluish.

`run through the month` sweeps a whole lunation, waxing lit on the right and waning on the left, so the loop never jumps from full back to new.

## Against Moon Temple's moon and CSS

The `moon temple` preset draws Moon Temple's `moon_disc` in its place: the same face and maria, with a terminator one pixel wide, which steps visibly as it crosses a large disc slowly. The soft terminator costs nothing measurable (0.50 ms against 0.42 for the whole frame, tail included).

In CSS the exact shape of the light is two pieces: half a disc on the sun's side, and half an ellipse whose half-width is |cos 2π·phase| of the radius, dark for a crescent and light for a gibbous moon. That is exact, because a sphere's terminator seen from far off is a half ellipse. What CSS cannot do is the shading: the flat face, the soft edge, the maria and earthshine. The common two-circle version, a dark disc slid over a light one, is wrong except near new and full: at a quarter it gets 8% or more of the disc wrong (`tests/moon-phase.test.ts`), since its inner edge is an arc of a circle where the true terminator is a straight line.

## Cost

0.5 ms a frame at 1920 × 1080 on Dawn, almost all of it the HDR tail; 1.7 in Chrome. Tier A. See the Scorecard tab and [docs/studies/epic-5.md](../../../docs/studies/epic-5.md).

## Pitfalls

- **Softplus overflows.** w log(1 + e^(x/w)) is infinite in f32 once x/w passes about 88, which a sharp edge reaches across half the disc; written as max(x, 0) + w log(1 + e^(−|x|/w)), it cannot.
- **The terminator sweeping is motion.** A month of 16 seconds moved the edge fast enough at the strong dose that the motion check read it as zoom and drift; a month is now 24 seconds, and the hard-edged presets are held still.
- **Earthshine is faint.** Through the tonemap's toe a little goes a long way; 0.03 of the full Moon looked like a grey disc with a lit rim.

## Safety

Flash `none`, pattern `none`, motion inside the caps at the defaults and at the strong dose. Every preset passes (`npm test`).

## When to use it

A loader or a progress indicator (it is story 8.3's), or tonight's Moon in a date widget. Where WebGPU is missing, the half-disc and half-ellipse CSS version.

## References

- Moon Temple's `moon.wgsl`, for the Lommel-Seeliger face and the maria.
- Star Temple [plan.md](../../../plan.md), story 5.6.
