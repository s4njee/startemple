# Quads against a compute splat

Story 2.4. research.md asked: at what star count does drawing each star as a quad stop being cheap, and does a compute splat into a buffer beat it?

Measured 2026-10-29 on Dawn (Apple M1 Max, Metal) by `experiments/splat-cost.test.ts`, at 1920 × 1080; the numbers are in [splat-cost.json](splat-cost.json). GPU times are the per-frame slope of the bench harness (`tests/bench.ts`): the cost of one more frame of the same work, with the timing floor cancelled. Stars are spread uniformly with mostly faint light, σ = 0.8 px (docs/studies/shimmer.md).

## Method

- **Quads**: the star spot (`src/gpu/stars/spot.ts`), one instanced quad a star, its pixel-integrated Gaussian added by blending.
- **Splat 7 × 7**: one compute invocation a star, adding the same integrated Gaussian over its 7 × 7 pixels into a fixed-point `u32` buffer with `atomicAdd` (three channels), then a fullscreen pass that turns the buffer into the scene. The 25 MB buffer is cleared every frame, and that is part of the cost.
- **Splat 1 px**: the same, with each star's whole light added to its nearest pixel: the cheapest splat, and the one that shimmers.
- **CPU fill**: refilling a `PointList` with every star's position from script, as `star-splat` and `deep-field` do every frame. Wall time in Node.

## Results

| Stars     | Quads (ms) | Splat 7 × 7 (ms) | Splat 1 px (ms) | CPU fill (ms) | Star buffer (MB) |
| --------- | ---------: | ---------------: | --------------: | ------------: | ---------------: |
| 1 000     |       0.07 |             0.46 |            0.24 |          0.17 |             0.03 |
| 10 000    |       0.11 |             0.66 |            0.17 |          1.11 |             0.32 |
| 100 000   |       0.44 |             2.67 |            0.22 |          5.22 |              3.2 |
| 300 000   |       1.94 |             7.47 |            0.35 |         15.13 |              9.6 |
| 1 000 000 |       9.79 |            24.01 |            0.85 |         49.36 |               32 |

## Findings

- **Quads win at every count, for stars that keep their light.** A star spot as an instanced quad costs 0.11 ms for 10 000 stars and 0.44 ms for 100 000. The compute splat of the same Gaussian costs six times as much at 100 000: 49 atomic adds a star, three channels each, contend for the same memory, where blending is the hardware's own job. The atomics are cheapest when they do least, which is the one-pixel splat.
- **The one-pixel splat is only for huge counts of stars nobody looks at.** It is flat (0.85 ms at a million) because each star is one atomic add a channel, but it is the naive single-pixel star whose shown light swings with its position (docs/studies/shimmer.md). A galaxy of a million points, seen as a haze rather than as stars, could use it; nothing that pans slowly should.
- **The quads cross the Tier A budget at about 200 000 stars** on this machine (1.94 ms at 300 000), and it is overdraw that costs: each σ = 0.8 quad covers 58 pixels. On an integrated GPU, with a budget set for one, the line will sit lower; 10.3 measures it.
- **The real limit is the CPU, far sooner.** Refilling the star list from script costs 1.1 ms at 10 000 stars and 5.2 ms at 100 000: a field that moves every star from JavaScript is CPU-bound past a few thousand. So fields of up to about 10 000 stars (`deep-field`, `star-splat`) can be fed from script, and anything larger must compute positions on the GPU from a static buffer: the parallax offset as a uniform, read in the vertex shader. That is the method for `real-sky`, `spiral-galaxy` and `data-galaxy`.
- **The splat's buffer is memory a quad does not need.** Three `u32` channels per pixel is 25 MB at 1080p, cleared every frame; the quads need only the stars.

## What it sets

- Stars are drawn as instanced quads through the spot layer, at any count up to about 200 000.
- Past about 10 000 stars their positions come from the GPU, not from a `PointList` filled each frame. The spot layer will take a position transform as a uniform when 2.6 needs it.
- A compute splat is kept for a million-point haze, at one pixel a point, where shimmer does not matter.
