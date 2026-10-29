# Shimmer: how small can a star be?

Story 2.3. research.md asked: what is the smallest star spot that stays stable when panning at DPR 1? A star that moves by a fraction of a pixel lands on a different mix of pixels, and if what the screen shows of it changes with that mix, a panning field crawls and twinkles. This is the most common failure of web starfields.

Measured 2026-10-29 on Dawn (Apple M1 Max) by `experiments/shimmer.test.ts`; the numbers are in [shimmer.json](shimmer.json). Device pixels throughout, so the answer holds at any DPR: at DPR 2 the same spot is half as wide in CSS pixels.

## Method

Every sub-pixel position a panning star passes through is drawn at once: one star in each 32 px cell of a 16 × 16 grid, at phases spread evenly over the pixel in both directions, into `rgba16float` as the effects' scenes are. Three ways of drawing a star:

- **naive**: `hello`'s disc, a fixed radius with a soft rim, its light not normalised. Most web starfields draw stars this way, or as a single pixel.
- **disc**: Moon Temple's point layer (`src/gpu/points.ts`), which lights each pixel by the exact area of a disc inside it, so the total light is conserved.
- **gauss**: the star spot (`src/gpu/stars/spot.ts`), a Gaussian integrated over each pixel's square, also conserving the light.

Over all the phases, each column is the spread (largest minus smallest, over the mean) of:

- **total light**: the star's linear light, summed over its pixels;
- **peak pixel**: its brightest pixel;
- **shown**: what the screen emits, summed. Each pixel is clipped to 1, or put through the tail's ACES tonemap, then encoded to 8-bit sRGB and decoded back to linear. Stars of total light 0.3 (faint), 3 (bright) and 30 (very bright).

The shown light is the number that matters. A star is smaller than the eye can resolve, so the eye sees its total light, not its shape. Linear light can be conserved and the shown light still not be, because clipping and the tonemap are not linear: a narrow star whose peak goes over 1 loses more light when centred on a pixel than when spread over four.

## Results

| Method | Size (px) | Total light | Peak pixel | Peak share | Shown, faint | Shown, bright, clipped | Shown, bright, ACES | Shown, very bright, ACES |
| ------ | --------: | ----------: | ---------: | ---------: | -----------: | ---------------------: | ------------------: | -----------------------: |
| naive  |       0.6 |      154.0% |     111.4% |       0.89 |       153.8% |                 155.5% |              149.5% |                    85.7% |
| naive  |       1.2 |        7.7% |       0.0% |       0.25 |         7.5% |                   7.6% |               18.1% |                    45.5% |
| naive  |         2 |       12.8% |       0.0% |       0.09 |        13.2% |                  13.3% |               15.6% |                    13.1% |
| disc   |       0.5 |        0.1% |     112.1% |       0.62 |         1.4% |                  92.4% |               94.1% |                    66.0% |
| disc   |      0.75 |        0.1% |      63.7% |       0.45 |         1.5% |                  26.7% |               17.2% |                    34.4% |
| disc   |         1 |        0.0% |      16.8% |       0.31 |         1.4% |                   0.5% |               14.9% |                    56.3% |
| disc   |       1.5 |        0.0% |       0.0% |       0.14 |         1.0% |                   0.5% |                3.1% |                    25.3% |
| disc   |         2 |        0.0% |       0.0% |       0.08 |         0.9% |                   0.4% |                4.6% |                    16.6% |
| gauss  |       0.3 |        0.1% |      90.1% |       0.58 |         1.8% |                  64.9% |               55.5% |                    19.3% |
| gauss  |       0.4 |        0.1% |      74.2% |       0.47 |         1.4% |                  33.6% |               16.9% |                    28.6% |
| gauss  |       0.5 |        0.0% |      58.1% |       0.37 |         1.5% |                  14.1% |                1.3% |                     4.7% |
| gauss  |       0.6 |        0.0% |      45.4% |       0.30 |         1.7% |                   2.2% |                5.3% |                     8.8% |
| gauss  |       0.7 |        0.0% |      35.9% |       0.24 |         1.6% |                   0.6% |                3.6% |                     4.1% |
| gauss  |       0.8 |        0.0% |      29.0% |       0.20 |         2.1% |                   0.7% |                2.3% |                     1.3% |
| gauss  |         1 |        0.0% |      19.7% |       0.14 |         1.3% |                   0.6% |                0.4% |                     0.5% |

Size is the disc's radius for naive and disc, and the Gaussian's standard deviation for gauss. Peak share is the brightest pixel's share of the star's light, on average: how sharp the star looks.

## Findings

- **A naive star shimmers at every size.** `hello`'s 1.2 px disc changes its shown light by 8 to 46% as it moves, and its small version by 150%. Its light is not normalised, so the number of pixel centres inside the disc changes the total.
- **Conserving the light is not enough.** The point layer's disc and the Gaussian both keep the linear total within 0.1%, but a narrow one still changes its shown light by tens of per cent once it is bright, because its peak clips or bends in the tonemap. The faint column, under 2% for every conserving method, is the 8-bit quantisation alone.
- **A Gaussian beats a disc at the same sharpness.** At a peak share of 0.20 to 0.30 (as sharp as a 1 px disc), the Gaussian's shown light changes by under 9% at every brightness, the disc's by up to 56%. A disc has a hard edge, which crosses pixel boundaries all at once; a Gaussian has none.
- **The answer: a Gaussian of σ = 0.8 device pixels.** It is the narrowest spot under 2.5% at every brightness measured, clipped or tonemapped, with its brightest pixel holding a fifth of its light. At σ = 1 it is under 1.3%, softer. Below σ = 0.5 no method holds a bright star steady. 0.8 is `star-splat`'s default and `deep-field`'s, and a star spot is never drawn narrower than 0.5.
- **The shimmer has a frequency.** A star panning at v pixels a frame cycles through its phases 60 v times a second: at 0.1 px a frame, six times a second, inside the range the flash rule counts. Across a field of naive stars that is a texture of small flashes. The conserving spots remove the amplitude, so the frequency stops mattering.
- **DPR 2 hides it, DPR 1 does not.** The numbers are in device pixels. A 1.2 CSS-pixel star at DPR 2 is 2.4 device pixels across and shimmers less; on a DPR 1 screen the same CSS size is the bad row of the table. Story 10.2 checks a real DPR 1 screen.

## Limits

The measure is the summed light, which is what the eye sees of a point too small to resolve. A star large enough to resolve, or one with spikes, is judged by its shape as well, and the peak-pixel column says how much that changes. The tonemap is ACES on the linear light alone, without bloom; bloom spreads a bright star's light further and makes every row steadier.
