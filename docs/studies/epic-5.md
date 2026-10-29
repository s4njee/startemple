# Cost study: Epic 5

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.04 to 0.59 |
| (tail) | constant scene + bloom + output | 11 | 0.72 | 0.42 | 0.17 to 1.11 |
| gas-giant | default | 12 | 2.10 | 2.25 | 1.64 to 3.25 |
| gas-giant | preset jupiter | 12 | 2.03 | 2.23 | 1.73 to 2.49 |
| gas-giant | preset saturn | 12 | 1.31 | 1.29 | 1.00 to 1.46 |
| gas-giant | preset saturn lit from behind | 12 | 1.31 | 1.25 | 1.09 to 1.53 |
| gas-giant | preset neptune | 12 | 2.03 | 2.18 | 1.75 to 2.38 |
| gas-giant | preset jupiter, close | 12 | 6.68 | 6.44 | 6.31 to 7.38 |
| moon-phase | default | 11 | 0.59 | 0.50 | 0.31 to 0.74 |
| moon-phase | preset a month | 11 | 0.52 | 0.55 | 0.42 to 0.72 |
| moon-phase | preset progress bar | 11 | 0.52 | 0.52 | 0.44 to 0.74 |
| moon-phase | preset thin crescent | 11 | 0.52 | 0.55 | 0.46 to 0.76 |
| moon-phase | preset hard edge | 11 | 0.79 | 0.76 | -0.20 to 1.53 |
| moon-phase | preset moon temple | 11 | 0.59 | 0.39 | 0.07 to 0.68 |
| planet | default | 12 | 0.92 | 0.90 | 0.59 to 1.16 |
| planet | preset from orbit | 12 | 0.98 | 0.85 | 0.66 to 1.14 |
| planet | preset dusk | 12 | 1.25 | 1.09 | 0.83 to 1.35 |
| planet | preset night side | 12 | 1.51 | 1.35 | 1.25 to 1.62 |
| planet | preset sunset from the ground | 13 | 0.79 | 0.85 | 0.72 to 0.96 |
| planet | preset noon from the ground | 13 | 0.72 | 0.63 | 0.42 to 0.72 |
| planet | preset a dry world | 12 | 0.92 | 0.87 | 0.76 to 1.14 |
| planet | atmosphere=closed form | 12 | 1.11 | 0.96 | 0.81 to 1.25 |
| planet | atmosphere=tables | 12 | 0.92 | 0.94 | 0.81 to 1.00 |
| planet | atmosphere=reference | 12 | 18.09 | 17.15 | 15.47 to 19.44 |
| planet | steps=4 | 12 | 0.59 | 0.55 | 0.50 to 0.70 |
| planet | steps=8 | 12 | 0.79 | 0.68 | 0.63 to 0.87 |
| planet | steps=24 | 12 | 1.44 | 1.38 | 1.31 to 2.14 |
| planet | view=ground atmosphere=closed form | 12 | 1.70 | 1.59 | 1.29 to 1.81 |
| planet | view=ground atmosphere=tables | 13 | 0.72 | 0.61 | 0.33 to 0.85 |
| gas-giant | world=saturn rings=off | 12 | 2.10 | 2.10 | 1.97 to 2.38 |
| gas-giant | world=saturn rings=on | 12 | 1.31 | 1.29 | 0.98 to 1.40 |
| moon-phase | shading=soft terminator | 11 | 0.66 | 0.50 | 0.42 to 0.68 |
| moon-phase | shading=moon temple | 11 | 0.59 | 0.42 | 0.33 to 0.55 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | -0.04 to 0.20 |
| (tail) | constant scene + bloom + output | 9 | 0.46 | 0.33 | -0.13 to 0.76 |
| gas-giant | default | 10 | 1.18 | 1.42 | 1.20 to 1.62 |
| gas-giant | preset jupiter | 10 | 0.98 | 1.09 | 0.79 to 1.59 |
| gas-giant | preset saturn | 10 | 0.59 | 0.55 | 0.28 to 0.81 |
| gas-giant | preset saturn lit from behind | 10 | 0.72 | 0.72 | 0.20 to 1.62 |
| gas-giant | preset neptune | 10 | 1.57 | 1.49 | 1.07 to 1.94 |
| gas-giant | preset jupiter, close | 10 | 1.70 | 1.64 | 1.55 to 2.42 |
| moon-phase | default | 9 | 0.39 | 0.31 | 0.28 to 0.42 |
| moon-phase | preset a month | 9 | 0.39 | 0.37 | 0.15 to 0.57 |
| moon-phase | preset progress bar | 9 | 0.46 | 0.33 | 0.04 to 0.55 |
| moon-phase | preset thin crescent | 9 | 0.46 | 0.48 | 0.07 to 0.59 |
| moon-phase | preset hard edge | 9 | 0.66 | 0.68 | 0.50 to 1.00 |
| moon-phase | preset moon temple | 9 | 0.46 | 0.39 | 0.33 to 0.79 |
| planet | default | 10 | 0.52 | 0.35 | 0.33 to 0.42 |
| planet | preset from orbit | 10 | 0.52 | 0.48 | 0.42 to 0.55 |
| planet | preset dusk | 10 | 0.46 | 0.48 | 0.35 to 0.52 |
| planet | preset night side | 10 | 0.66 | 0.59 | 0.39 to 0.74 |
| planet | preset sunset from the ground | 11 | 0.46 | 0.48 | 0.42 to 0.63 |
| planet | preset noon from the ground | 11 | 0.46 | 0.44 | 0.37 to 0.52 |
| planet | preset a dry world | 10 | 0.46 | 0.48 | 0.42 to 0.55 |
| planet | atmosphere=closed form | 10 | 0.52 | 0.50 | 0.28 to 0.63 |
| planet | atmosphere=tables | 10 | 0.52 | 0.39 | 0.22 to 0.59 |
| planet | atmosphere=reference | 10 | 5.77 | 5.68 | 5.48 to 5.94 |
| planet | steps=4 | 10 | 0.46 | 0.33 | 0.31 to 0.48 |
| planet | steps=8 | 10 | 0.46 | 0.35 | 0.31 to 0.46 |
| planet | steps=24 | 10 | 0.79 | 0.79 | 0.55 to 0.96 |
| planet | view=ground atmosphere=closed form | 10 | 0.72 | 0.57 | 0.48 to 0.63 |
| planet | view=ground atmosphere=tables | 11 | 0.46 | 0.50 | 0.28 to 0.59 |
| gas-giant | world=saturn rings=off | 10 | 1.51 | 1.16 | 0.98 to 2.51 |
| gas-giant | world=saturn rings=on | 10 | 0.98 | 0.98 | 0.39 to 1.66 |
| moon-phase | shading=soft terminator | 9 | 0.72 | 0.63 | 0.55 to 0.79 |
| moon-phase | shading=moon temple | 9 | 0.46 | 0.37 | 0.17 to 0.55 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (21.9 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| gas-giant | 20 | 4.1 | 44.9 |
| moon-phase | 15 | 1.3 | 31.4 |
| planet | 21 | 9.9 | 51.7 |
