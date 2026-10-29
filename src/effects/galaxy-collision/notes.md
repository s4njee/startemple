## How it works

Two disc galaxies passing each other, as Alar and Juri Toomre showed in 1972 that tidal tails and bridges form. Each galaxy is a massive core with a disc of 12 000 stars on circular orbits round it. The stars feel both cores' gravity but not each other's: the restricted three-body problem, which makes it cheap and is enough for the tails, as the Toomres found.

- **The cores** follow a parabolic orbit with a pericentre of 1.4 disc radii, integrated on the CPU by leapfrog; each frame's sub-steps' core positions go to the GPU in one buffer.
- **The stars** are integrated in one compute dispatch a frame: for each sub-step, kick-drift-kick leapfrog under both cores' softened gravity. All sub-steps run in one dispatch, since uniforms written between passes of one command buffer would all arrive with the last values.
- **The discs**: the first spins with the orbit (prograde, which throws the long tails), the second tipped by `second disc's tilt`; `one retrograde` turns it against the orbit, which barely disturbs it. Stars near the centre orbit at the softened gravity's circular speed, so the cores are filled, not holes.

The run lasts about a minute and a half of real time, then fades and starts again.

## Cost

24 000 bodies stepped in compute and drawn as spots. 0.8 ms a frame on Dawn, 1.8 ms in Chrome: Tier A by budget; it needs compute, where the plan guessed C.

## Pitfalls

- **A vertex shader cannot read a read_write storage buffer.** The stars are bound twice: read-write for the step, read-only for drawing.
- **Spinning discs are whole-field rotation.** At first the motion check read 5.4° a second, over its 5° cap; the clock is slower now and the strong dose quickens it less.

## Safety

Flash `low`, pattern `none`, motion inside the caps up to the strong dose (`npm test`).

## When to use it

A science showpiece, or a hero for "merging", "two worlds", or anything that collides.

## References

- Alar Toomre and Juri Toomre, "Galactic bridges and tails", _Astrophysical Journal_ (1972).
- Star Temple [plan.md](../../../plan.md), story 3.6.
