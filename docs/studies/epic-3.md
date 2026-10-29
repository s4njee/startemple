# Cost study: Epic 3

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | -0.07 to 0.59 |
| (tail) | constant scene + bloom + output | 11 | 0.79 | 0.59 | -0.26 to 1.35 |
| data-galaxy | default | 3 | 0.92 | 0.66 | 0.28 to 1.09 |
| data-galaxy | preset five clusters | 3 | 0.59 | 0.66 | 0.48 to 1.25 |
| data-galaxy | preset face on | 3 | 0.72 | 0.98 | 0.44 to 1.35 |
| data-galaxy | preset many points | 3 | 1.51 | 1.35 | 1.05 to 2.51 |
| data-galaxy | preset two groups | 3 | 0.92 | 0.83 | 0.66 to 1.27 |
| galaxy-collision | default | 3 | 0.85 | 0.83 | 0.61 to 0.98 |
| galaxy-collision | preset tidal tails | 3 | 0.79 | 0.87 | 0.61 to 1.09 |
| galaxy-collision | preset both prograde | 3 | 0.85 | 0.70 | 0.57 to 1.07 |
| galaxy-collision | preset one retrograde | 3 | 0.92 | 0.81 | 0.61 to 1.25 |
| galaxy-collision | preset from the side | 3 | 1.05 | 0.98 | 0.81 to 1.25 |
| nebula | default | 8 | 0.46 | 0.33 | -0.13 to 0.39 |
| nebula | preset as the eye sees | 8 | 0.66 | 0.55 | 0.17 to 1.84 |
| nebula | preset hubble palette | 8 | 0.66 | 0.26 | 0.07 to 0.85 |
| nebula | preset two lines | 8 | 0.52 | 0.39 | -0.04 to 0.92 |
| nebula | preset dark pillars | 8 | 0.59 | 0.31 | -0.13 to 0.94 |
| nebula-volume | default | 15 | 1.90 | 1.90 | 1.68 to 2.27 |
| nebula-volume | preset hubble palette | 15 | 1.90 | 1.77 | 1.62 to 2.25 |
| nebula-volume | preset as the eye sees | 15 | 1.97 | 2.03 | 1.38 to 2.18 |
| nebula-volume | preset full resolution | 15 | 6.62 | 6.27 | 5.85 to 6.71 |
| nebula-volume | preset thick dust | 15 | 1.90 | 2.05 | 1.40 to 2.23 |
| spiral-galaxy | default | 4 | 1.84 | 1.92 | 1.55 to 2.27 |
| spiral-galaxy | preset grand design | 4 | 1.84 | 2.05 | 1.84 to 2.38 |
| spiral-galaxy | preset face on | 4 | 1.77 | 1.88 | 1.53 to 2.12 |
| spiral-galaxy | preset edge on | 4 | 2.62 | 2.95 | 2.69 to 3.45 |
| spiral-galaxy | preset watch the stars | 4 | 1.84 | 2.10 | 1.59 to 2.40 |
| spiral-galaxy | preset tightly wound | 4 | 1.77 | 2.05 | 1.81 to 2.36 |
| nebula-volume | resolution=full | 15 | 7.14 | 7.17 | 6.49 to 7.73 |
| nebula-volume | resolution=half | 15 | 1.90 | 2.08 | 1.77 to 2.80 |
| nebula-volume | resolution=quarter | 15 | 0.92 | 0.90 | 0.74 to 1.46 |
| nebula-volume | steps=24 | 15 | 1.38 | 1.20 | 0.94 to 1.66 |
| nebula-volume | steps=48 | 15 | 2.03 | 2.21 | 1.46 to 2.45 |
| nebula-volume | steps=96 | 15 | 4.59 | 3.87 | 3.58 to 4.35 |
| spiral-galaxy | dose=0.1 | 4 | 5.18 | 1.49 | -0.39 to 4.04 |
| spiral-galaxy | dose=0.35 | 4 | 5.18 | 3.84 | 2.58 to 6.42 |
| spiral-galaxy | dose=1 | 4 | 7.41 | 4.28 | 3.10 to 5.09 |
| galaxy-collision | dose=0.35 | 3 | 3.28 | 1.25 | -0.61 to 4.50 |
| galaxy-collision | dose=1 | 3 | 3.74 | 1.27 | 0.04 to 3.89 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.98 | 1.29 | -1.35 to 2.16 |
| (tail) | constant scene + bloom + output | 9 | 5.37 | 0.76 | -0.83 to 1.86 |
| data-galaxy | default | 3 | 3.15 | 1.29 | 0.26 to 4.22 |
| data-galaxy | preset five clusters | 3 | 3.87 | 1.14 | 0.50 to 2.64 |
| data-galaxy | preset face on | 3 | 4.13 | 0.92 | -0.52 to 4.33 |
| data-galaxy | preset many points | 3 | 3.47 | 2.82 | 1.81 to 5.37 |
| data-galaxy | preset two groups | 3 | 3.01 | 1.44 | 0.39 to 5.13 |
| galaxy-collision | default | 3 | 2.23 | 2.14 | -0.66 to 2.91 |
| galaxy-collision | preset tidal tails | 3 | 2.10 | 1.90 | 0.83 to 3.56 |
| galaxy-collision | preset both prograde | 3 | 1.84 | 1.94 | 0.39 to 3.08 |
| galaxy-collision | preset one retrograde | 3 | 2.03 | 1.88 | 0.33 to 4.22 |
| galaxy-collision | preset from the side | 3 | 3.34 | 2.36 | 0.70 to 4.11 |
| nebula | default | 8 | 3.54 | 0.37 | -1.55 to 2.36 |
| nebula | preset as the eye sees | 8 | 5.64 | 0.11 | -3.56 to 5.18 |
| nebula | preset hubble palette | 8 | 2.69 | 0.61 | -0.15 to 1.57 |
| nebula | preset two lines | 8 | 5.05 | 0.72 | -2.38 to 3.12 |
| nebula | preset dark pillars | 8 | 3.21 | 0.87 | -1.66 to 3.71 |
| nebula-volume | default | 13 | 7.21 | 1.99 | -1.07 to 5.42 |
| nebula-volume | preset hubble palette | 13 | 5.64 | 3.28 | 0.15 to 7.58 |
| nebula-volume | preset as the eye sees | 13 | 6.29 | 2.60 | 0.37 to 6.20 |
| nebula-volume | preset full resolution | 13 | 8.19 | 4.78 | 2.60 to 9.98 |
| nebula-volume | preset thick dust | 13 | 6.49 | 2.82 | -0.39 to 4.67 |
| spiral-galaxy | default | 4 | 7.27 | 5.61 | 1.86 to 6.99 |
| spiral-galaxy | preset grand design | 4 | 8.39 | 5.51 | 3.71 to 11.23 |
| spiral-galaxy | preset face on | 4 | 5.44 | 4.30 | 2.03 to 6.75 |
| spiral-galaxy | preset edge on | 4 | 9.76 | 6.86 | 3.43 to 9.39 |
| spiral-galaxy | preset watch the stars | 4 | 8.06 | 5.59 | 2.71 to 8.30 |
| spiral-galaxy | preset tightly wound | 4 | 8.26 | 5.79 | 3.04 to 8.04 |
| nebula-volume | resolution=full | 13 | 8.91 | 4.96 | 1.49 to 10.18 |
| nebula-volume | resolution=half | 13 | 6.68 | 2.62 | -0.46 to 5.94 |
| nebula-volume | resolution=quarter | 13 | 5.96 | 2.10 | -0.87 to 2.86 |
| nebula-volume | steps=24 | 13 | 7.41 | 2.12 | 0.07 to 5.29 |
| nebula-volume | steps=48 | 13 | 7.14 | 2.93 | 0.00 to 6.40 |
| nebula-volume | steps=96 | 13 | 7.86 | 2.93 | 1.81 to 4.70 |
| spiral-galaxy | dose=0.1 | 4 | 6.16 | 2.99 | 1.31 to 6.14 |
| spiral-galaxy | dose=0.35 | 4 | 7.27 | 5.85 | 2.58 to 8.00 |
| spiral-galaxy | dose=1 | 4 | 10.03 | 8.45 | 5.57 to 11.75 |
| galaxy-collision | dose=0.35 | 3 | 2.49 | 1.64 | 1.18 to 3.82 |
| galaxy-collision | dose=1 | 3 | 1.44 | 2.62 | 0.52 to 4.37 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (18.1 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| data-galaxy | 13 | 1.8 | 30.7 |
| galaxy-collision | 12 | 2.3 | 25.7 |
| nebula | 21 | 2.3 | 42.2 |
| nebula-volume | 20 | 2.8 | 48.2 |
| spiral-galaxy | 13 | 2.2 | 27.5 |
