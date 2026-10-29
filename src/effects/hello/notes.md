## How it works

One instanced draw of 900 quads (`stars.wgsl`) into the HDR scene over a near-black sky, then the shared tail. Every star's position is a pure function of its index and the time: a fixed height and a slow drift to the left that wraps round. There is no state, so a held frame and a poster are the same sky. Brightness is the cube of a uniform draw, so most stars are faint and a few bright, and brighter stars drift a little faster, a crude depth. Colour is a crude mix between a warm and a blue white.

`dose` ("intensity") sets how many stars show (0 to 900, 400 at the default), how fast they drift and how bright they are.

## Pitfalls

- **This is the naive star.** Each star is a disc of fixed radius with a soft rim, and its light is not conserved as it moves between pixels: a star 1.2 px across lights two pixels or three depending on where it falls, so faint stars waver and crawl as the field drifts. The `pinpoint stars` preset makes it worse. That is on purpose: story 2.3 measures this baseline against Moon Temple's energy-conserving point layer, which `star-splat` draws through.
- **One drift is a whole-field drift.** Every star moves the same way, so the speeds are kept low enough that the motion check reads the field under its 0.05 widths a second cap.

## Safety

Flash, pattern and motion checks pass at the default and at the strong dose (`npm test`).

## When to use it

As the template for a new effect. For a real starfield, `deep-field` (story 2.2).

## References

- Star Temple [plan.md](../../../plan.md), story 1.2.
