## How it works

An Earthlike world seen from four planet radii, every pixel a ray from the camera through the planet's air to its ground or out to space.

- **The surface** (story 5.1, `src/gpu/world/`) is a function of the direction from the planet's centre, evaluated in 3D: continents from warped noise, ridged mountains on the high ground, a moisture field that dries out near 25° north and south, clouds banded by latitude, and city lights on the lowland coasts. It is baked once into the six faces of a 512-texel cube map, the GPU's own, so the shader reads it with one hardware-filtered fetch along a direction. A cube has no pole to pinch and, since every texel was evaluated at its own point on the sphere, no seam: two texels either side of an edge are two points a texel apart. Ice is laid by latitude, reaching nearer the equator the higher the ground.
- **Light on the ground** is the sun's light that reaches it through the air, so the terminator reddens and dims as it does from orbit. The ground's relief comes from the height's slope between neighbouring texels. The sea is a rough mirror (GGX, Fresnel from 2%), which gives the sun's glint sliding across it as the planet turns.
- **Clouds** are a shell 10 km up (stretched with the air), the cube's cloud channel turned a little slower than the ground so the weather drifts. Their shadow falls on the ground along the sun's direction. Past the terminator the cities fade in, dimmed under cloud.
- **The air** (story 5.2, `atmosphere.wgsl`) is Rayleigh and Mie scattering through an exponential atmosphere, integrated along the ray. Three methods find the sunlight at each step: the Chapman function in closed form (the default), Hillaire's transmittance table, or a second march to the top of the air (the reference). With the tables, the light scattered more than once is added from Hillaire's 32 × 32 table, and from the ground the whole sky is one fetch of his sky-view table. `air thickness` stretches the air's heights and thins it by the same factor, so every vertical column, and the sky's colour, is unchanged, but the blue limb is wide enough to see on a page.
- **Scroll**: with `scrolling turns day to night`, the sun swings 140° round the planet as the canvas passes through the viewport, from day through dusk to the night side.

## The atmosphere methods (story 5.2)

Rendered at 960 × 540 and compared with the reference, single scattering only ([docs/studies/atmosphere-quality.json](../../../docs/studies/atmosphere-quality.json)):

| View                   | Closed form, 4 steps |    8 |   12 |   24 | Tables, 12 steps |
| ---------------------- | -------------------: | ---: | ---: | ---: | ---------------: |
| From orbit             |                 2.20 | 0.55 | 0.29 | 0.14 |             0.28 |
| Dusk                   |                 1.28 | 0.36 | 0.21 | 0.10 |             0.20 |
| Sunset from the ground |                16.64 | 7.74 | 4.42 | 1.23 |            10.43 |
| Noon from the ground   |                 7.93 | 2.86 | 1.68 | 0.57 |             8.93 |

(RMSE in 8-bit levels; SSIM 0.997 or better everywhere except the sky-view table, 0.97.) From orbit the closed form and the tables are the same image: the sun's transmittance is all they differ in, and the Chapman form here is within 0.2% of brute force. From the ground the sky-view table is the cheaper sky but the less exact one, 192 × 108 texels interpolated across a sun 0.5° wide and a horizon that changes in a pixel; the closed form needs 24 steps there. Multiple scattering brightens the planet from orbit by 9% and the noon sky from the ground by 39%.

Schüler's well-known approximation to the Chapman function, c / ((c − 1) μ + 1), is 14% low between about 2° and 20° above the horizon, which is where a low sun spends its evening. The asymptotic form, √(πx/2) · erfcx(√(x/2) μ), with erfcx fitted as 1 / (1.13 y + √(0.41275 y² + 0.04 y + 1)), is within 0.2% (`tests/atmosphere.test.ts`).

## Cost

0.9 ms a frame at 1920 × 1080 on Dawn with the closed form at 12 steps, 0.6 at 4 steps, 1.4 at 24; the tables cost the same from orbit, and from the ground the sky-view table is 0.6 against 1.6 for the closed form. The reference is 17 ms. 3.1 ms in Chrome. Tier B. The cube map is 12.6 MB of texture (512 texels a face, half-float RGBA). See the Scorecard tab and [docs/studies/epic-5.md](../../../docs/studies/epic-5.md).

## Pitfalls

- **A uniform written between passes reaches them all with its last value**, so the cube's six faces are baked in six submits, not six passes of one.
- **The limb aliases** against space if a pixel is either ground or sky. Each pixel near the limb is covered by its share, from how far the ray passes from the planet against the pixel's size there.
- **The sky-view table needs the horizon dense**: its rows are spaced by the square root of the angle from the horizon, as Hillaire's are. Even so it smears the sun's disc and the horizon line; from the ground, the closed form is the more exact.
- **Ozone is left out of all three methods**, so they compare like with like. It is what keeps the twilight zenith blue; without it the sky at sunset is a little greener than Earth's.

## Safety

Flash `none`, pattern `none`. Motion: the planet turns once in four minutes at the default intensity, well inside the rotation cap, and scroll only moves the sun. Every preset passes (`npm test`).

## When to use it

A hero for a space, climate or geography page that turns from day to night as it scrolls; the same atmosphere, from the ground, for a sunset behind a landing page. Where the GPU cannot afford it, a still of the planet half lit.

## References

- Sébastien Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique", _Computer Graphics Forum_ (EGSR 2020).
- Eric Bruneton and Fabrice Neyret, "Precomputed Atmospheric Scattering", _Computer Graphics Forum_ (EGSR 2008), for the transmittance table's parametrisation.
- Christian Schüler, "An Approximation to the Chapman Grazing-Incidence Function for Atmospheric Scattering", _GPU Pro 3_ (2012).
- Sydney Chapman (1931), for the grazing-incidence function.
- Star Temple [plan.md](../../../plan.md), stories 5.1, 5.2 and 5.3.
