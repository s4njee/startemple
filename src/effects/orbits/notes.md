## How it works

The solar system today, from the Keplerian elements JPL publishes for approximate planet positions (E. M. Standish, valid 1800–2050): each planet's semi-major axis, eccentricity, inclination, longitudes of perihelion and node and mean longitude at J2000, and how fast each changes a century. For a date the mean anomaly gives the eccentric anomaly by Newton's method on Kepler's equation, and the elements turn that into a heliocentric position in the ecliptic (`src/gpu/stars/planets.ts`). Tested against Earth's position at J2000, the March equinox of 2000 and Jupiter's period.

- **The scale** is logarithmic in distance from the Sun, from 0.2 AU (inside Mercury's perihelion) to `out to`, 35 AU by default, so Mercury and Neptune both show. Directions are kept, so orbits stay closed curves, squashed by the view's tilt.
- **The orbit lines** are point spots every 0.8 pixel along each ellipse, each planet's colour, rebuilt only when the view changes.
- **The planets** are spots where they are on the day, moving at `days a second` (6: a year in a minute). Their sizes are not to scale; to scale nothing would show.
- **Scrolling** zooms in: over two screens of the page the outer edge comes in from `out to` towards the inner planets, eased.

## Cost

A few thousand spots a frame and the tail: 0.5 ms on Dawn at 1080p, 1.4 in Chrome. Tier A, where the plan guessed B. See the Scorecard tab and [docs/studies/epic-4.md](../../../docs/studies/epic-4.md).

## Pitfalls

- **Precision** (an open question in the plan) does not arise: positions are worked out in doubles on the CPU and drawn in pixels, with the Sun at the centre. A floating origin would matter for a camera flying among the planets, which this is not.
- **Earth's elements are the Earth–Moon barycentre's**, a few thousand kilometres from Earth: nothing at this scale.

## Safety

Flash `low`, pattern `none`, motion far under the caps: Mercury, the fastest, goes round in 15 seconds at the default speed, a few pixels a frame (`npm test`).

## When to use it

An astronomy or education page; a "where are the planets now" widget. `real-sky` puts the same planets among the stars.

## References

- E. M. Standish, "Keplerian Elements for Approximate Positions of the Major Planets" (JPL Solar System Dynamics).
- Jean Meeus, _Astronomical Algorithms_ (1991): Kepler's equation (30), the planets' magnitudes (41).
- Star Temple [plan.md](../../../plan.md), story 4.5.
