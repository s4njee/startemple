# Cost study: Epic 2

Measured 2026-10-29 on **Metal driver on macOS Version 26.6.2 (Build 25G83)** (unclassified), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect      | Configuration                     | Passes | Span (ms) | Per frame (ms) | Range (ms)    |
| ----------- | --------------------------------- | -----: | --------: | -------------: | ------------- |
| (floor)     | one constant-colour pass          |      1 |      0.07 |           0.04 | -1.14 to 0.07 |
| (tail)      | constant scene + bloom + output   |     11 |      0.72 |           0.33 | -0.46 to 1.53 |
| deep-field  | default                           |      3 |      0.26 |           0.94 | -1.00 to 1.59 |
| deep-field  | preset deep field                 |      3 |      0.26 |           0.17 | -1.18 to 1.77 |
| deep-field  | preset stars only                 |      3 |      0.26 |           1.18 | 0.20 to 1.55  |
| deep-field  | preset hubble palette             |      3 |      0.46 |           0.07 | -1.07 to 1.29 |
| deep-field  | preset dense and still            |      3 |      3.34 |           0.00 | -0.98 to 1.44 |
| deep-field  | preset living hubble              |      4 |      4.13 |           3.32 | 2.45 to 4.70  |
| deep-field  | preset twinkling                  |      3 |      0.26 |           0.85 | 0.17 to 1.53  |
| real-sky    | default                           |      3 |      0.85 |           0.79 | -0.33 to 1.68 |
| real-sky    | preset tonight, facing south      |      3 |      0.72 |           0.74 | -0.33 to 1.66 |
| real-sky    | preset facing north               |      3 |      0.72 |           0.76 | -0.22 to 1.73 |
| real-sky    | preset whole sky                  |      3 |      0.85 |           0.81 | -0.31 to 1.70 |
| real-sky    | preset still air                  |      3 |      2.82 |           0.52 | -0.28 to 1.57 |
| real-sky    | preset from Sydney                |      3 |      2.36 |           0.04 | -0.44 to 1.70 |
| star-splat  | default                           |      2 |      0.20 |           0.17 | -0.63 to 1.20 |
| star-splat  | preset as the eye sees            |      2 |      0.33 |           0.15 | -1.00 to 1.92 |
| star-splat  | preset full colour                |      2 |      0.26 |           0.66 | 0.11 to 1.51  |
| star-splat  | preset hubble                     |      2 |      0.26 |           1.09 | -0.52 to 1.90 |
| star-splat  | preset disc spots                 |      2 |      3.67 |          -0.35 | -1.07 to 0.83 |
| star-trails | default                           |      4 |      1.90 |           0.17 | -0.48 to 1.64 |
| star-trails | preset an hour and three quarters |      4 |      0.66 |           1.35 | -0.22 to 1.70 |
| star-trails | preset all night                  |      4 |      0.72 |           1.44 | -0.20 to 1.77 |
| star-trails | preset a short one                |      4 |      0.72 |           1.42 | -0.09 to 1.79 |
| star-trails | preset pole overhead              |      4 |      0.79 |           1.14 | -0.35 to 1.62 |
| deep-field  | dose=0.1                          |      3 |      0.26 |           0.59 | -0.79 to 1.42 |
| deep-field  | dose=0.35                         |      3 |      0.33 |           1.25 | 0.02 to 2.69  |
| deep-field  | dose=0.7                          |      3 |      0.20 |           1.22 | 0.55 to 1.53  |
| deep-field  | dose=1                            |      3 |      2.95 |           0.24 | -1.07 to 1.46 |
| deep-field  | nebula=0                          |      3 |      0.26 |           0.63 | -0.76 to 1.59 |
| star-splat  | spot=gaussian                     |      2 |      0.33 |           0.26 | -1.00 to 2.03 |
| star-splat  | spot=disc                         |      2 |      3.08 |          -0.72 | -1.16 to 0.63 |
| star-splat  | halo=0                            |      2 |      0.33 |           0.33 | -1.09 to 1.64 |
| star-splat  | halo=0.05                         |      2 |      0.33 |           0.79 | -1.16 to 1.53 |
| star-splat  | halo=0.2                          |      2 |      0.52 |           0.17 | -0.72 to 1.29 |
| star-trails | dose=0.35                         |      4 |      0.66 |           0.68 | 0.02 to 1.64  |
| star-trails | dose=1                            |      4 |      0.98 |           1.00 | -0.11 to 1.75 |
| real-sky    | limit=4                           |      3 |      0.66 |           1.42 | -0.39 to 1.64 |
| real-sky    | limit=6.5                         |      3 |      2.82 |           0.00 | -0.35 to 1.94 |
| real-sky    | limit=8                           |      3 |      0.98 |           1.51 | 0.17 to 1.81  |

## 960 × 540

| Effect      | Configuration                     | Passes | Span (ms) | Per frame (ms) | Range (ms)    |
| ----------- | --------------------------------- | -----: | --------: | -------------: | ------------- |
| (floor)     | one constant-colour pass          |      1 |      0.07 |           0.04 | -0.59 to 1.00 |
| (tail)      | constant scene + bloom + output   |      9 |      0.85 |           0.15 | -0.72 to 1.25 |
| deep-field  | default                           |      3 |      0.20 |           0.87 | -0.94 to 1.68 |
| deep-field  | preset deep field                 |      3 |      0.26 |           0.85 | -1.18 to 1.70 |
| deep-field  | preset stars only                 |      3 |      0.26 |           0.13 | -0.81 to 1.14 |
| deep-field  | preset hubble palette             |      3 |      0.20 |           0.85 | -0.83 to 1.27 |
| deep-field  | preset dense and still            |      3 |      0.20 |           0.63 | 0.11 to 1.46  |
| deep-field  | preset living hubble              |      4 |      1.25 |           1.22 | 0.81 to 3.04  |
| deep-field  | preset twinkling                  |      3 |      0.20 |           0.87 | 0.07 to 1.07  |
| real-sky    | default                           |      3 |      0.52 |           0.28 | -0.70 to 1.55 |
| real-sky    | preset tonight, facing south      |      3 |      0.33 |           0.33 | -0.66 to 1.29 |
| real-sky    | preset facing north               |      3 |      0.39 |           0.22 | -0.68 to 1.31 |
| real-sky    | preset whole sky                  |      3 |      0.46 |           0.44 | -0.81 to 1.35 |
| real-sky    | preset still air                  |      3 |      0.39 |           0.28 | -0.52 to 1.29 |
| real-sky    | preset from Sydney                |      3 |      0.39 |           0.37 | -1.00 to 1.66 |
| star-splat  | default                           |      2 |      3.47 |          -0.66 | -1.09 to 0.63 |
| star-splat  | preset as the eye sees            |      2 |      0.20 |           1.27 | 0.15 to 1.53  |
| star-splat  | preset full colour                |      2 |      0.26 |           1.05 | -0.68 to 1.92 |
| star-splat  | preset hubble                     |      2 |      0.26 |           0.22 | -1.03 to 1.25 |
| star-splat  | preset disc spots                 |      2 |      2.03 |           0.00 | -1.09 to 1.62 |
| star-trails | default                           |      4 |      0.52 |           0.24 | -0.63 to 1.29 |
| star-trails | preset an hour and three quarters |      4 |      0.39 |           0.33 | -0.61 to 1.27 |
| star-trails | preset all night                  |      4 |      0.39 |           0.31 | -0.68 to 1.33 |
| star-trails | preset a short one                |      4 |      0.46 |           0.26 | -0.85 to 1.33 |
| star-trails | preset pole overhead              |      4 |      1.05 |           0.17 | -0.81 to 1.35 |
| deep-field  | dose=0.1                          |      3 |      0.33 |           0.04 | -1.18 to 1.29 |
| deep-field  | dose=0.35                         |      3 |      0.20 |           1.35 | -1.22 to 1.68 |
| deep-field  | dose=0.7                          |      3 |      0.20 |           0.11 | -1.09 to 1.29 |
| deep-field  | dose=1                            |      3 |      0.39 |           0.42 | -1.03 to 1.55 |
| deep-field  | nebula=0                          |      3 |      0.26 |           0.09 | -1.18 to 1.49 |
| star-splat  | spot=gaussian                     |      2 |      0.20 |           1.27 | 1.03 to 1.62  |
| star-splat  | spot=disc                         |      2 |      0.20 |           1.27 | 0.17 to 3.15  |
| star-splat  | halo=0                            |      2 |      0.26 |           0.17 | -0.98 to 1.97 |
| star-splat  | halo=0.05                         |      2 |      0.26 |           0.20 | -0.61 to 1.55 |
| star-splat  | halo=0.2                          |      2 |      0.26 |           1.49 | 0.37 to 1.66  |
| star-trails | dose=0.35                         |      4 |      0.52 |           0.22 | -1.05 to 1.90 |
| star-trails | dose=1                            |      4 |      0.52 |           1.11 | -0.63 to 1.35 |
| real-sky    | limit=4                           |      3 |      0.26 |           0.17 | -0.76 to 1.11 |
| real-sky    | limit=6.5                         |      3 |      0.39 |           0.33 | -0.87 to 1.59 |
| real-sky    | limit=8                           |      3 |      0.39 |           0.37 | -0.61 to 1.62 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (16.4 kB gzipped, no shaders).

| Effect      | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| ----------- | -----: | ------------------: | --------------: |
| deep-field  |     18 |                 3.5 |            42.9 |
| real-sky    |     16 |                57.8 |            92.9 |
| star-splat  |     12 |                 3.7 |            33.1 |
| star-trails |     15 |                 1.9 |            33.3 |
