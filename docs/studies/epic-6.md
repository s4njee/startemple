# Cost study: Epic 6

Measured 2026-10-29 on **Metal driver on macOS Version 26.6.2 (Build 25G83)** (unclassified), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.04 to 0.15 |
| (tail) | constant scene + bloom + output | 11 | 0.52 | 0.46 | 0.37 to 0.85 |
| eclipse | default | 11 | 0.85 | 0.83 | 0.66 to 0.96 |
| eclipse | preset countdown | 11 | 0.92 | 0.74 | 0.46 to 0.98 |
| eclipse | preset totality | 11 | 1.44 | 1.20 | 0.90 to 1.38 |
| eclipse | preset solar maximum | 11 | 1.51 | 1.27 | 1.20 to 1.81 |
| eclipse | preset partial phase | 11 | 0.72 | 0.57 | 0.33 to 0.74 |
| solar-surface | default | 11 | 1.57 | 1.27 | 1.09 to 2.21 |
| solar-surface | preset the disc | 11 | 1.44 | 1.33 | 1.14 to 1.51 |
| solar-surface | preset close up | 11 | 2.10 | 1.94 | 1.79 to 2.64 |
| solar-surface | preset quiet sun | 11 | 1.25 | 1.27 | 1.14 to 1.29 |
| solar-surface | preset white light | 11 | 1.51 | 1.31 | 1.16 to 1.57 |
| solar-surface | preset through a filter | 11 | 1.31 | 1.27 | 0.92 to 1.68 |
| solar-surface | granules=150 | 11 | 1.64 | 1.33 | 1.18 to 1.53 |
| solar-surface | granules=600 | 11 | 1.51 | 1.46 | 1.09 to 1.70 |
| solar-surface | granules=1200 | 11 | 1.64 | 1.31 | 1.11 to 1.66 |
| solar-surface | beyond=0 | 11 | 1.64 | 1.22 | 1.05 to 1.75 |
| eclipse | run=false progress=0.3 | 11 | 0.52 | 0.42 | 0.35 to 0.50 |
| eclipse | run=false progress=0.5 | 11 | 1.11 | 1.33 | 0.98 to 2.75 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | -0.02 to 0.09 |
| (tail) | constant scene + bloom + output | 9 | 0.46 | 0.33 | 0.15 to 0.44 |
| eclipse | default | 9 | 0.46 | 0.37 | 0.22 to 0.57 |
| eclipse | preset countdown | 9 | 0.46 | 0.35 | 0.33 to 0.59 |
| eclipse | preset totality | 9 | 0.79 | 0.76 | 0.46 to 0.98 |
| eclipse | preset solar maximum | 9 | 0.72 | 0.70 | 0.52 to 0.94 |
| eclipse | preset partial phase | 9 | 0.52 | 0.35 | 0.24 to 0.55 |
| solar-surface | default | 9 | 0.79 | 0.76 | 0.46 to 1.49 |
| solar-surface | preset the disc | 9 | 1.05 | 0.92 | 0.76 to 1.33 |
| solar-surface | preset close up | 9 | 0.92 | 0.92 | 0.70 to 1.77 |
| solar-surface | preset quiet sun | 9 | 0.85 | 0.72 | 0.48 to 0.81 |
| solar-surface | preset white light | 9 | 0.98 | 0.94 | 0.72 to 1.20 |
| solar-surface | preset through a filter | 9 | 1.05 | 0.92 | 0.70 to 1.22 |
| solar-surface | granules=150 | 9 | 0.66 | 0.70 | 0.50 to 1.18 |
| solar-surface | granules=600 | 9 | 1.11 | 1.27 | 0.83 to 1.49 |
| solar-surface | granules=1200 | 9 | 1.05 | 1.05 | 0.70 to 1.40 |
| solar-surface | beyond=0 | 9 | 1.05 | 1.14 | 0.72 to 1.25 |
| eclipse | run=false progress=0.3 | 9 | 0.46 | 0.35 | 0.31 to 0.55 |
| eclipse | run=false progress=0.5 | 9 | 0.66 | 0.74 | 0.44 to 1.00 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (21.9 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| eclipse | 19 | 1.7 | 40.1 |
| solar-surface | 19 | 1.6 | 40.3 |
