# Cost study: Epic 2

Measured 2026-10-29 on **Metal driver on macOS Version 26.6.2 (Build 25G83)** (unclassified), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect     | Configuration                   | Passes | Span (ms) | Per frame (ms) | Range (ms)    |
| ---------- | ------------------------------- | -----: | --------: | -------------: | ------------- |
| (floor)    | one constant-colour pass        |      1 |      0.07 |           0.07 | -0.07 to 0.50 |
| (tail)     | constant scene + bloom + output |     11 |      0.72 |           0.74 | 0.07 to 1.57  |
| deep-field | default                         |      3 |      0.46 |           1.03 | -0.13 to 1.29 |
| deep-field | preset deep field               |      3 |      0.26 |           0.22 | -0.13 to 0.61 |
| deep-field | preset stars only               |      3 |      0.52 |           0.81 | 0.13 to 1.31  |
| deep-field | preset hubble palette           |      3 |      0.52 |           0.39 | 0.02 to 1.07  |
| deep-field | preset dense and still          |      3 |      0.46 |           0.15 | -0.02 to 0.52 |
| star-splat | default                         |      2 |      0.39 |           0.22 | -0.04 to 1.11 |
| star-splat | preset as the eye sees          |      2 |      0.46 |           0.22 | -0.15 to 1.05 |
| star-splat | preset full colour              |      2 |      0.39 |           0.59 | -0.07 to 1.35 |
| star-splat | preset hubble                   |      2 |      0.46 |           0.72 | -0.26 to 1.27 |
| star-splat | preset disc spots               |      2 |      0.52 |           0.44 | 0.15 to 0.98  |
| deep-field | dose=0.1                        |      3 |      0.26 |           0.15 | -0.11 to 0.44 |
| deep-field | dose=0.35                       |      3 |      0.46 |           0.98 | -0.17 to 1.35 |
| deep-field | dose=0.7                        |      3 |      0.39 |           0.15 | -0.09 to 0.46 |
| deep-field | dose=1                          |      3 |      2.23 |          -0.17 | -0.20 to 0.22 |
| deep-field | nebula=0                        |      3 |      0.39 |           0.22 | -0.13 to 0.61 |
| star-splat | spot=gaussian                   |      2 |      0.46 |           0.63 | -0.35 to 1.29 |
| star-splat | spot=disc                       |      2 |      0.46 |           0.94 | -0.17 to 1.25 |
| star-splat | halo=0                          |      2 |      0.46 |           0.44 | -0.07 to 1.46 |
| star-splat | halo=0.05                       |      2 |      0.46 |           0.44 | -0.22 to 1.46 |
| star-splat | halo=0.2                        |      2 |      0.46 |           0.33 | -0.22 to 1.00 |

## 960 × 540

| Effect     | Configuration                   | Passes | Span (ms) | Per frame (ms) | Range (ms)    |
| ---------- | ------------------------------- | -----: | --------: | -------------: | ------------- |
| (floor)    | one constant-colour pass        |      1 |      0.07 |           0.07 | -0.02 to 0.31 |
| (tail)     | constant scene + bloom + output |      9 |      0.52 |           0.35 | -0.07 to 1.20 |
| deep-field | default                         |      3 |      0.72 |           0.09 | -0.28 to 0.87 |
| deep-field | preset deep field               |      3 |      1.11 |           0.02 | -0.22 to 1.16 |
| deep-field | preset stars only               |      3 |      0.26 |           0.17 | -0.35 to 0.92 |
| deep-field | preset hubble palette           |      3 |      0.33 |           0.15 | -0.28 to 1.11 |
| deep-field | preset dense and still          |      3 |      0.33 |           0.24 | -0.24 to 1.16 |
| star-splat | default                         |      2 |      0.85 |           0.11 | -0.28 to 0.72 |
| star-splat | preset as the eye sees          |      2 |      0.33 |           0.17 | -0.11 to 0.74 |
| star-splat | preset full colour              |      2 |      0.52 |           0.17 | -0.09 to 0.94 |
| star-splat | preset hubble                   |      2 |      0.52 |           0.09 | -0.31 to 0.79 |
| star-splat | preset disc spots               |      2 |      0.52 |           0.57 | 0.00 to 1.42  |
| deep-field | dose=0.1                        |      3 |      0.33 |           0.66 | -0.17 to 0.90 |
| deep-field | dose=0.35                       |      3 |      0.66 |           0.02 | -0.37 to 1.03 |
| deep-field | dose=0.7                        |      3 |      0.39 |           0.17 | -0.50 to 1.03 |
| deep-field | dose=1                          |      3 |      0.39 |           0.79 | 0.46 to 1.20  |
| deep-field | nebula=0                        |      3 |      0.92 |          -0.04 | -0.15 to 1.11 |
| star-splat | spot=gaussian                   |      2 |      0.46 |           0.15 | -0.42 to 1.27 |
| star-splat | spot=disc                       |      2 |      1.38 |           0.09 | -0.31 to 0.79 |
| star-splat | halo=0                          |      2 |      0.39 |           0.15 | -0.17 to 1.09 |
| star-splat | halo=0.05                       |      2 |      0.79 |           0.00 | -0.52 to 0.70 |
| star-splat | halo=0.2                        |      2 |      0.26 |           0.17 | 0.00 to 1.11  |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (7.0 kB gzipped, no shaders).

| Effect     | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| ---------- | -----: | ------------------: | --------------: |
| deep-field |     18 |                 3.0 |            42.0 |
| star-splat |     13 |                 3.7 |            33.8 |
