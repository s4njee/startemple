# A starfield five ways (story 2.7)

Measured 2026-10-29 by `node experiments/star-compare.mjs`, in headless Chrome at 1280 × 720 on this machine (an Apple M1 Max), 5 s per row after 2.5 s to settle. Main thread and style come from Chrome's Performance metrics; compositor and GPU process are the busy time of those threads in a trace. All in milliseconds of work per second of wall time: 1000 would be a thread that is never idle.

| Method                           | Stars | fps | Main thread (ms/s) | of which style | Compositor (ms/s) | GPU process (ms/s) |
| -------------------------------- | ----: | --: | -----------------: | -------------: | ----------------: | -----------------: |
| nothing (the page alone)         |     0 |  61 |                9.7 |            0.0 |               5.6 |                5.5 |
| CSS keyframes, an element a star |   100 |  60 |               49.4 |           19.0 |              32.9 |               52.4 |
| elements moved from script       |   100 |  60 |               50.5 |           10.8 |              44.5 |               71.0 |
| 2D canvas, arc() a star          |   100 |  60 |               24.4 |            0.0 |              37.2 |               53.0 |
| CSS keyframes, an element a star |   400 |  60 |              131.9 |           53.8 |              75.4 |              150.7 |
| elements moved from script       |   400 |  60 |               97.4 |           22.4 |              96.0 |              148.0 |
| 2D canvas, arc() a star          |   400 |  60 |               26.3 |            0.0 |              21.0 |               54.1 |
| CSS keyframes, an element a star |  1600 |  60 |              455.8 |          188.7 |             294.8 |              511.1 |
| elements moved from script       |  1600 |  60 |              319.7 |           72.4 |             413.5 |              517.2 |
| 2D canvas, arc() a star          |  1600 |  60 |               56.3 |            0.0 |              25.7 |               98.9 |
| CSS keyframes, an element a star |  6400 |  16 |              670.8 |          281.9 |             895.0 |             1206.3 |
| elements moved from script       |  6400 |   4 |              856.0 |           19.8 |             711.3 |              881.1 |
| 2D canvas, arc() a star          |  6400 |  60 |              119.3 |            0.0 |              13.2 |              227.1 |
| box-shadow, three layers         |   400 |  60 |               19.2 |            4.6 |              16.0 |               39.3 |
| box-shadow, three layers         |  1600 |  60 |               16.5 |            3.7 |              13.2 |               31.5 |
| box-shadow, three layers         |  6400 |  60 |               16.7 |            3.8 |              13.0 |               29.8 |
| box-shadow, three layers         | 25600 |  60 |               16.3 |            3.7 |              13.5 |               28.9 |
| WebGPU `deep-field`, stars only  |  1029 |  60 |               35.4 |            0.0 |              15.9 |               48.3 |
| WebGPU `deep-field`, stars only  |  3600 |  60 |               54.5 |            0.0 |              14.2 |               41.7 |
| WebGPU `deep-field`, stars only  |  4892 |  60 |               68.1 |            0.0 |              15.2 |               46.2 |
| WebGPU `deep-field`, stars only  |  6000 |  60 |               73.7 |            0.0 |              13.6 |               42.3 |

WebGPU's star count is how many `deep-field` shows at doses 0.1, 0.35, 0.7 and 1, with its nebula off.

## Findings

- **Box-shadow stars cost nothing, at any count.** Three layers of one element each, with a shadow per star, slid on a loop: 16 to 19 ms a second of main thread from 400 to 25 600 stars, no more than the page alone plus a little. Each layer is drawn once and then moved as one picture by the compositor. For a field that drifts in a few rigid layers, this is the right answer, and the classic CSS starfield is classic for a reason.
- **An element a star does not scale.** CSS keyframes and elements moved from script both cost main-thread, compositor and GPU-process time per star: about 100 to 130 ms a second at 400 stars, 320 to 460 at 1 600, and at 6 400 the page drops to 16 and 4 fps. This is Snow Temple's crossover (a few dozen elements) again.
- **A 2D canvas is cheap for a few thousand.** `arc()` a star every frame cost 26 ms a second at 400 stars and 119 at 6 400, all on the main thread, at a full 60 fps.
- **WebGPU's cost here is its script, not its GPU.** `deep-field` with no nebula cost 35 to 74 ms a second of main thread for 1 000 to 6 000 stars, and 42 to 48 ms of GPU process at any count: that is the `PointList` refilled every frame (docs/studies/splat-cost.md), which a larger field moves to the GPU.
- **So what does WebGPU earn?** Not a cheaper drifting field. Box-shadow stars move with sub-pixel transforms resampled by the compositor, in gamma space, and nothing in them conserves a star's light: they are this study's cheapest and, by 2.3's measure, of the naive kind. WebGPU earns its place for what CSS cannot do at all: stars that keep their light as they move (2.3), colours and magnitudes from the sky's statistics, halos and spikes in HDR, a nebula behind them, per-star motion (trails, a turning sky, parallax by depth for every star), and later the real sky and galaxies.
- **Not measured:** how box-shadow and canvas stars shimmer when they move, which needs frames captured from the compositor. The `none` row's one console error is the page's missing favicon.
