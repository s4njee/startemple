## How it works

An emission nebula as a volume, in four passes:

- **The noise** is baked once by a compute pass into a 96³ `rgba16float` texture: four fields (gas, hot gas, dust, and a warp). A step of the march is then a couple of filtered fetches, not a fractal sum, as Fire Temple's flames learned.
- **The march** runs at half the view's resolution by default (`march resolution`), each pixel's ray through the cloud's box front to back with Fire Temple's emission-absorption kernel (`src/wgsl/volume.wgsl`, ported in story 3.3; `tests/volume.test.ts` holds it to Beer–Lambert). The gas glows in 3.1's emission lines, and brighter near the five hot stars inside it, which ionise it (their light falls with the square of the distance); oxygen's teal or blue gathers round them. Dust absorbs, a little more in blue.
- **The jitter** of each ray's start moves every frame, and an exponential average over about four frames takes the grain out. The view turns slowly enough that the history barely lags it.
- **The composite** lays the cloud over a background field of stars as stars × transmittance + light, and the hot stars are drawn inside it.

## Cost

The answer to the story's question: on Dawn, 6.4 ms a frame at full resolution, 2.1 at half and 0.9 at a quarter (48 steps). Tier B at half resolution, the default; C at full. Chrome read 4.2 ms at half with the machine under load. See [docs/studies/epic-3.md](../../../docs/studies/epic-3.md).

## Pitfalls

- **A baked 3D texture is soft.** At 96³ across the box the gas has no fine filaments; finer needs a bigger texture (four times the memory per doubling) or detail noise added per step.
- **The history smears a fast turn.** There is no reprojection; the turn is slow so it does not need one.

## Safety

Nothing flashes; the turn is slow. Checks pass at the default and the strong dose.

## When to use it

A slow, deep showpiece behind a hero. For a background that must cost nothing, the flat `nebula`.

## References

- Fire Temple's volume kernel and its notes.
- Star Temple [plan.md](../../../plan.md), stories 3.3 and 3.4.
