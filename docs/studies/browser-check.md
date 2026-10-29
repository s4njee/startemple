# Browser check

Every registered effect, loaded in Google Chrome 156.0.8078.48 (headless, this machine's GPU) on 2026-10-29 by `npm run browser-check`.

Views per effect: `hero-light` (1280 × 900), `hero-dark` (1280 × 900), `cards-dark` (1280 × 900), `band-light` (1280 × 900), `backdrop-dark` (1280 × 900), `phone-light` (390 × 844 at 2x), `phone-dark` (390 × 844 at 2x), `hud-1080p` (1920 × 1080). The layouts are the mock pages of the effect page; "light" and "dark" are the page tone of the stage.

- **Started** counts the views in which the effect got a canvas and drew more than a flat fill, with no fallback notice and no console error.
- **Animates** means two captures a second apart differ by more than dither in at least one view.
- **HUD** is what the performance HUD showed on a 1920 × 1080 canvas: frames per second, and the GPU time of one frame as the browser reports it (first pass start to last pass end), as the median of several page loads with the range beside it. The range is wide for the lightest effects: when there is little to draw the GPU idles, and the same page reads either near the timing floor or about twice that from one load to the next.

The HUD time is not the number the cost studies report. It is one frame measured alone, through Chrome's coarse timestamps, on a GPU that idles between frames, so it carries a floor and reads higher than the per-frame cost in `docs/studies/epic-*.md`. It is here because it is what a visitor's browser actually does. This check says nothing about how an effect looks: the screenshots do.

| Effect | Started | Animates | HUD at 1080p |
| --- | ---: | --- | --- |
| black-hole | 8 of 8 | yes | 60 fps, 6.02 ms (5.83 to 6.04 over 3 loads) |
| data-galaxy | 8 of 8 | yes | 60 fps, 1.36 ms (1.23 to 1.36 over 3 loads) |
| deep-field | 8 of 8 | yes | 60 fps, 0.61 ms (0.53 to 0.63 over 3 loads) |
| galaxy-collision | 8 of 8 | yes | 60 fps, 2.38 ms (2.19 to 2.41 over 3 loads) |
| hello | 8 of 8 | yes | 60 fps, 0.42 ms (0.36 to 0.43 over 3 loads) |
| lens-cursor | 8 of 8 | yes | 60 fps, 0.46 ms (0.43 to 0.52 over 3 loads) |
| nebula | 8 of 8 | yes | 60 fps, 0.73 ms (0.72 to 0.73 over 3 loads) |
| nebula-volume | 8 of 8 | yes | 60 fps, 4.95 ms (4.76 to 5.26 over 3 loads) |
| orbits | 8 of 8 | yes | 60 fps, 1.35 ms (1.33 to 1.37 over 3 loads) |
| real-sky | 8 of 8 | yes | 60 fps, 2.13 ms (2.11 to 2.20 over 3 loads) |
| spiral-galaxy | 8 of 8 | yes | 60 fps, 4.79 ms (4.70 to 4.80 over 3 loads) |
| star-splat | 8 of 8 | yes | 60 fps, 0.57 ms (0.52 to 0.61 over 3 loads) |
| star-trails | 8 of 8 | yes | 60 fps, 2.15 ms (2.08 to 2.19 over 3 loads) |

No view logged a console error.
