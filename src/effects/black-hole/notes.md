## How it works

A Schwarzschild black hole with a thin accretion disc, every pixel's ray traced through the metric, after the hole James, von Tunzelmann, Franklin and Thorne made for _Interstellar_. Units are the Schwarzschild radius: the horizon is at 1, the photon sphere at 1.5, the disc's inner edge at the innermost stable orbit, 3.

- **The rays** (story 4.2, `src/gpu/gravity/`) are integrated in the compact Cartesian form Riccardo Antonelli's "Starless" uses: each ray moves in a straight line plus an acceleration of −1.5 h² x / r⁵, where h is its angular momentum, by fourth-order Runge–Kutta with a step that shrinks near the hole. A CPU twin of the same step is tested against the analytic deflection of a far ray (2/b plus the second-order term, within 2%) and against the critical impact parameter 3√3/2, inside which rays are captured.
- **The trace** runs at half resolution by default. A ray that falls through the horizon is black. One that crosses the disc's plane between its inner and outer edges picks up the disc's light there and goes on, dimmed to 12%, so the far side's image bent over the top shows through. One that escapes looks up the sky along the direction it leaves in.
- **The disc**: a Shakura–Sunyaev temperature profile, gas on circular orbits at β = √(0.5 / (r − 1)), so the side coming towards the viewer is Doppler-brightened and bluer (g³ in intensity) and the far side dimmed and redder; light climbing out of the well is redshifted by √(1 − 1/r), which dims the inner edge. `beaming` and `redshift` turn either off, to show what each does.
- **The sky's stars are points.** Each pixel's escaped direction and its neighbours' (`dpdx`, `dpdy`) give the lens's local mapping from the image to the sky; a star's offset is taken back through it into image pixels, so it is drawn a fixed size in the image, and its light is scaled by the magnification. Every pixel shares one jitter offset a frame, so the neighbours stay a pixel apart.
- **Framing and the pointer**: `roll` turns the view about the line of sight, so the disc can cross the screen at an angle; `shift right` and `shift up` move the hole off the frame's centre, by offsetting every ray, so a page can put it beside its text. With `pointer steers the view` the pointer swings the camera up to 32° round the hole and 16° over or under the disc, in the rolled view's axes (along the disc swings round, across it tips over), eased over 0.7 s and never faster than 24° a second. The `blackhole.html` demo uses all three.
- **Accumulation**: each frame's trace is blended into a history (a third of the new frame while turning, an eighth when still), which averages the jittered edges, then upsampled into the scene.

## Cost

At 1920 × 1080 on Dawn: 2.2 ms a frame at half resolution, 7.0 at full, 1.0 at a quarter; 6.0 ms in Chrome at half. The step budget hardly matters past 200, since every ray has escaped or fallen in by then. Tier C. See the Scorecard tab and [docs/studies/epic-4.md](../../../docs/studies/epic-4.md).

## Half resolution and accumulation (story 4.4)

Rendered at 960 × 540 and compared with a full-resolution frame accumulated still for 64 frames ([docs/studies/black-hole-quality.json](../../../docs/studies/black-hole-quality.json)). One full-resolution frame scores SSIM 0.97 over the frame and 0.91 round the photon ring. Half resolution scores 0.91 and 0.86 in one frame, 0.92 and 0.89 after 8, and no better after 32; quarter resolution 0.81 and 0.78. Turning, against full resolution at the same moment, half resolution holds 0.93 and 0.92: the history keeps up. So accumulation buys a little at the ring and nothing past 8 frames; what half resolution loses is sharpness, not noise. It does not reach Tier B: half resolution is 2.2 ms on Dawn but 6.0 in Chrome, on the M1 Max, already the B budget for an integrated GPU. Half resolution is the default, at a quarter of the trace, and `full resolution` a preset for a large still hero.

## Pitfalls

- **A star drawn a fixed angle wide in the sky is wrong behind a lens.** The lens shears it into a tangential arc, and round the hole those arcs lined up into concentric rings that the pattern check failed (area 0.36 of a 10° field at the strong dose, against 0.25 for a moving pattern). Fading stars with how far their ray bent only moved the problem. Drawing them as points through the lens's mapping is the physics and passes (0.13 at the defaults, none at the strong dose).
- **Derivatives need every pixel to reach them.** A captured ray used to return from inside the loop; now it flags itself and returns after `dpdx`, and pixels beside the shadow, whose neighbour fell in, draw no stars. WGSL's uniformity analysis rejects derivatives after a loop with a per-pixel break, so the shader turns that diagnostic off.
- **A per-pixel jitter breaks the mapping**: neighbouring rays would be anywhere from 0 to 2 pixels apart. The jitter is one offset per frame.

## Safety

Flash `low`. Pattern `low`: the disc, its lensed images and the photon ring are rings by their nature, but few and soft. Motion: the camera turns at 0.7° a second, and the strong dose turns it faster, inside the caps. Every preset passes (`npm test`).

## When to use it

A science showpiece, a dramatic hero for a launch or a talk. Where the GPU cannot afford it, a still of it, or `lens-cursor`, which is the thin-lens version a page can drop over its own image.

## References

- Oliver James, Eugénie von Tunzelmann, Paul Franklin and Kip S. Thorne, "Gravitational lensing by spinning black holes in astrophysics, and in the movie _Interstellar_", _Classical and Quantum Gravity_ (2015).
- Riccardo Antonelli, "Starless", for the Cartesian form of the geodesic equation.
- N. I. Shakura and R. A. Sunyaev, "Black holes in binary systems. Observational appearance", _Astronomy and Astrophysics_ (1973).
- Star Temple [plan.md](../../../plan.md), stories 4.2, 4.3 and 4.4.
