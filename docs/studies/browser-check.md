# Browser check

Every registered effect, loaded in Google Chrome 156.0.8078.48 (headless, this machine's GPU) on 2026-10-29 by `npm run browser-check`.

Views per effect: `hero-light` (1280 × 900), `hero-dark` (1280 × 900), `cards-dark` (1280 × 900), `band-light` (1280 × 900), `backdrop-dark` (1280 × 900), `phone-light` (390 × 844 at 2x), `phone-dark` (390 × 844 at 2x), `hud-1080p` (1920 × 1080). The layouts are the mock pages of the effect page; "light" and "dark" are the page tone of the stage.

- **Started** counts the views in which the effect got a canvas and drew more than a flat fill, with no fallback notice and no console error.
- **Animates** means two captures a second apart differ by more than dither in at least one view.
- **HUD** is what the performance HUD showed on a 1920 × 1080 canvas: frames per second, and the GPU time of one frame as the browser reports it (first pass start to last pass end), as the median of several page loads with the range beside it. The range is wide for the lightest effects: when there is little to draw the GPU idles, and the same page reads either near the timing floor or about twice that from one load to the next.

The HUD time is not the number the cost studies report. It is one frame measured alone, through Chrome's coarse timestamps, on a GPU that idles between frames, so it carries a floor and reads higher than the per-frame cost in `docs/studies/epic-*.md`. It is here because it is what a visitor's browser actually does. This check says nothing about how an effect looks: the screenshots do.

| Effect | Started | Animates | HUD at 1080p |
| --- | ---: | --- | --- |
| data-galaxy | 8 of 8 | yes | 60 fps, 2.86 ms (2.60 to 2.98 over 3 loads) |
| deep-field | 8 of 8 | yes | 60 fps, 3.00 ms (2.91 to 3.17 over 3 loads) |
| galaxy-collision | 8 of 8 | yes | 60 fps, 1.84 ms (1.59 to 1.88 over 3 loads) |
| hello | 8 of 8 | yes | 60 fps, 0.33 ms (0.30 to 0.55 over 3 loads) |
| nebula | 8 of 8 | yes | 60 fps, 1.22 ms (0.81 to 1.42 over 3 loads) |
| nebula-volume | 8 of 8 | yes | 60 fps, 4.24 ms (3.66 to 4.65 over 3 loads) |
| real-sky | 8 of 8 | yes | 60 fps, 1.30 ms (1.16 to 1.47 over 3 loads) |
| spiral-galaxy | 8 of 8 | yes | 60 fps, 3.74 ms (3.18 to 4.15 over 3 loads) |
| star-splat | 8 of 8 | yes | 60 fps, 0.52 ms (0.51 to 0.63 over 3 loads) |
| star-trails | 8 of 8 | yes | 60 fps, 2.35 ms (2.22 to 2.58 over 3 loads) |

No view logged a console error.
