# Cost study: Epic 4

Measured 2026-10-29 on **Metal driver on macOS Version 26.6.2 (Build 25G83)** (unclassified), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect      | Configuration                   | Passes | Span (ms) | Per frame (ms) | Range (ms)    |
| ----------- | ------------------------------- | -----: | --------: | -------------: | ------------- |
| (floor)     | one constant-colour pass        |      1 |      0.07 |           0.07 | -0.09 to 0.20 |
| (tail)      | constant scene + bloom + output |     11 |      0.59 |           0.44 | 0.39 to 0.68  |
| black-hole  | default                         |     13 |      2.23 |           2.25 | 2.12 to 2.60  |
| black-hole  | preset interstellar view        |     13 |      2.29 |           2.16 | 2.01 to 2.42  |
| black-hole  | preset from above               |     13 |      2.16 |           2.32 | 2.12 to 2.49  |
| black-hole  | preset no beaming               |     13 |      2.29 |           2.23 | 1.94 to 2.27  |
| black-hole  | preset full resolution          |     13 |      7.01 |           6.88 | 6.73 to 7.32  |
| lens-cursor | default                         |      2 |      0.20 |           0.09 | 0.07 to 0.17  |
| lens-cursor | preset small hole               |      2 |      0.20 |           0.11 | 0.07 to 0.22  |
| lens-cursor | preset big hole                 |      2 |      0.20 |           0.11 | 0.09 to 0.20  |
| lens-cursor | preset no shadow                |      2 |      0.20 |           0.09 | 0.07 to 0.22  |
| orbits      | default                         |     12 |      0.52 |           0.50 | 0.35 to 0.57  |
| orbits      | preset the whole system         |     12 |      1.11 |           1.05 | 0.63 to 1.29  |
| orbits      | preset inner planets            |     12 |      1.05 |           0.83 | 0.50 to 1.00  |
| orbits      | preset from above               |     12 |      1.11 |           1.09 | 0.72 to 1.31  |
| orbits      | preset a year in a minute       |     12 |      1.11 |           1.05 | 0.72 to 1.18  |
| black-hole  | resolution=full                 |     13 |      6.95 |           6.99 | 6.88 to 7.23  |
| black-hole  | resolution=half                 |     13 |      2.29 |           2.16 | 2.05 to 2.27  |
| black-hole  | resolution=quarter              |     13 |      0.98 |           1.03 | 0.94 to 1.38  |
| black-hole  | steps=200                       |     13 |      2.23 |           2.16 | 2.03 to 2.32  |
| black-hole  | steps=400                       |     13 |      2.23 |           2.18 | 2.08 to 2.32  |
| black-hole  | steps=800                       |     13 |      2.16 |           2.18 | 2.08 to 2.32  |
| lens-cursor | size=0.08                       |      2 |      0.20 |           0.09 | 0.07 to 0.17  |
| lens-cursor | size=0.3                        |      2 |      0.20 |           0.11 | 0.07 to 0.20  |
| orbits      | reach=2.2                       |     12 |      0.59 |           0.50 | 0.39 to 0.57  |
| orbits      | reach=35                        |     12 |      1.11 |           1.25 | 0.48 to 1.31  |

## 960 × 540

| Effect      | Configuration                   | Passes | Span (ms) | Per frame (ms) | Range (ms)    |
| ----------- | ------------------------------- | -----: | --------: | -------------: | ------------- |
| (floor)     | one constant-colour pass        |      1 |      0.07 |           0.04 | -0.07 to 0.09 |
| (tail)      | constant scene + bloom + output |      9 |      0.52 |           0.35 | -0.02 to 0.52 |
| black-hole  | default                         |     11 |      1.31 |           1.18 | 1.09 to 1.40  |
| black-hole  | preset interstellar view        |     11 |      1.11 |           1.14 | 0.85 to 3.10  |
| black-hole  | preset from above               |     11 |      1.38 |           1.16 | 0.85 to 1.75  |
| black-hole  | preset no beaming               |     11 |      1.05 |           0.90 | 0.74 to 1.20  |
| black-hole  | preset full resolution          |     11 |      2.29 |           2.12 | 1.94 to 2.64  |
| lens-cursor | default                         |      2 |      0.13 |           0.09 | 0.02 to 0.11  |
| lens-cursor | preset small hole               |      2 |      0.13 |           0.09 | 0.07 to 0.17  |
| lens-cursor | preset big hole                 |      2 |      0.13 |           0.09 | 0.07 to 0.20  |
| lens-cursor | preset no shadow                |      2 |      0.13 |           0.11 | 0.07 to 0.17  |
| orbits      | default                         |     10 |      0.46 |           0.42 | 0.37 to 0.50  |
| orbits      | preset the whole system         |     10 |      0.66 |           0.61 | 0.44 to 0.74  |
| orbits      | preset inner planets            |     10 |      0.66 |           0.52 | 0.33 to 0.68  |
| orbits      | preset from above               |     10 |      0.66 |           0.66 | 0.35 to 0.85  |
| orbits      | preset a year in a minute       |     10 |      0.66 |           0.66 | 0.35 to 0.90  |
| black-hole  | resolution=full                 |     11 |      2.42 |           1.99 | 1.94 to 2.21  |
| black-hole  | resolution=half                 |     11 |      0.85 |           0.85 | 0.70 to 0.96  |
| black-hole  | resolution=quarter              |     11 |      0.72 |           0.72 | 0.46 to 0.96  |
| black-hole  | steps=200                       |     11 |      1.44 |           1.31 | 0.74 to 1.59  |
| black-hole  | steps=400                       |     11 |      1.31 |           1.20 | 0.85 to 1.59  |
| black-hole  | steps=800                       |     11 |      1.31 |           1.31 | 0.55 to 2.23  |
| lens-cursor | size=0.08                       |      2 |      0.13 |           0.09 | 0.02 to 0.22  |
| lens-cursor | size=0.3                        |      2 |      0.13 |           0.11 | -0.02 to 0.26 |
| orbits      | reach=2.2                       |     10 |      0.66 |           0.48 | 0.24 to 0.68  |
| orbits      | reach=35                        |     10 |      0.66 |           0.55 | 0.42 to 0.72  |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (19.0 kB gzipped, no shaders).

| Effect      | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| ----------- | -----: | ------------------: | --------------: |
| black-hole  |     16 |                 2.7 |            38.9 |
| lens-cursor |     15 |                 1.6 |            30.7 |
| orbits      |     15 |                 1.5 |            33.5 |
