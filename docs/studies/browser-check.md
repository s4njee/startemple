# Browser check

Every registered effect, loaded in Google Chrome 156.0.8078.48 (headless, this machine's GPU) on 2026-10-29 by `npm run browser-check`.

Views per effect: `hero-light` (1280 × 900), `hero-dark` (1280 × 900), `cards-dark` (1280 × 900), `band-light` (1280 × 900), `backdrop-dark` (1280 × 900), `phone-light` (390 × 844 at 2x), `phone-dark` (390 × 844 at 2x), `hud-1080p` (1920 × 1080). The layouts are the mock pages of the effect page; "light" and "dark" are the page tone of the stage.

- **Started** counts the views in which the effect got a canvas and drew more than a flat fill, with no fallback notice and no console error.
- **Animates** means two captures a second apart differ by more than dither in at least one view.
- **HUD** is what the performance HUD showed on a 1920 × 1080 canvas: frames per second, and the GPU time of one frame as the browser reports it (first pass start to last pass end), as the median of several page loads with the range beside it. The range is wide for the lightest effects: when there is little to draw the GPU idles, and the same page reads either near the timing floor or about twice that from one load to the next.

The HUD time is not the number the cost studies report. It is one frame measured alone, through Chrome's coarse timestamps, on a GPU that idles between frames, so it carries a floor and reads higher than the per-frame cost in `docs/studies/epic-*.md`. It is here because it is what a visitor's browser actually does. This check says nothing about how an effect looks: the screenshots do.

| Effect | Started | Animates | HUD at 1080p |
| --- | ---: | --- | --- |
| black-hole | 8 of 8 | yes | 60 fps, 5.54 ms (5.45 to 5.70 over 3 loads) |
| data-galaxy | 8 of 8 | yes | 60 fps, 1.12 ms (1.02 to 1.14 over 3 loads) |
| deep-field | 8 of 8 | yes | 60 fps, 0.47 ms (0.47 to 0.48 over 3 loads) |
| eclipse | 8 of 8 | yes | 60 fps, 1.16 ms (1.00 to 1.19 over 3 loads) |
| galaxy-collision | 8 of 8 | yes | 60 fps, 2.41 ms (2.19 to 2.43 over 3 loads) |
| gas-giant | 8 of 8 | yes | 60 fps, 4.49 ms (4.15 to 5.22 over 3 loads) |
| hello | 8 of 8 | yes | 60 fps, 0.33 ms (0.33 to 0.34 over 3 loads) |
| lens-cursor | 8 of 8 | yes | 60 fps, 0.41 ms (0.33 to 0.68 over 3 loads) |
| moon-phase | 8 of 8 | yes | 60 fps, 1.67 ms (1.65 to 1.77 over 3 loads) |
| nebula | 8 of 8 | yes | 60 fps, 0.76 ms (0.72 to 0.78 over 3 loads) |
| nebula-volume | 8 of 8 | yes | 60 fps, 5.47 ms (5.36 to 5.53 over 3 loads) |
| orbits | 8 of 8 | yes | 60 fps, 1.25 ms (1.19 to 1.35 over 3 loads) |
| planet | 8 of 8 | yes | 60 fps, 3.07 ms (3.07 to 3.12 over 3 loads) |
| real-sky | 8 of 8 | yes | 60 fps, 1.90 ms (1.89 to 2.04 over 3 loads) |
| solar-surface | 8 of 8 | yes | 60 fps, 4.12 ms (3.44 to 4.21 over 3 loads) |
| spiral-galaxy | 8 of 8 | yes | 60 fps, 2.60 ms (2.53 to 3.17 over 3 loads) |
| star-splat | 8 of 8 | yes | 60 fps, 0.77 ms (0.67 to 1.31 over 3 loads) |
| star-trails | 8 of 8 | yes | 60 fps, 1.31 ms (1.23 to 1.55 over 3 loads) |

No view logged a console error.
