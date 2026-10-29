## How it works

The density wave (Lin and Shu 1964), as Ingo Berg draws it: every star moves on an ellipse about the centre, and each ellipse is turned a little more than the one inside it (`arm twist`). Neighbouring ellipses crowd together along two lines that wind out from the centre: the arms. The ellipses turn rigidly at the pattern speed, so the arms keep their shape, while every star goes round its own ellipse on a flat rotation curve (the same speed at every radius, so the inner stars outrun the arms and the outer ones lag) and passes through the arms as it goes. Nothing is simulated: every position is a closed function of time, worked out per star in the vertex shader, which is what 2.4 said 72 000 stars need.

Where the arms are follows from the geometry: the stars' density goes as one over the Jacobian of (ellipse size, phase) to position, which in an ellipse's own frame is A sin 2e + B cos 2e + C, smallest where 2e = atan2(−A, −B). The populations born in the arms sit there, held to the pattern rather than orbiting away:

- **young blue stars** along the arms;
- **H II regions**, pink knots of hydrogen-alpha, where stars are being born;
- **dust**, just inside the arms, as soft absorbing smudges drawn with a multiplying blend.

The old disc stars spread round their ellipses, a puffed-up **bulge** of orange stars sits at the centre, and a smooth glow (a de Vaucouleurs bulge and an exponential disc) stands for the stars too faint to draw. A dozen **tracer** stars can be drawn brighter (`watch the stars`) to see stars move through arms that stay put.

## Cost

72 000 stars and 8 000 dust smudges at the default. The dust was most of the cost: cut at 2.2 of its widths instead of the star spot's 3.5, and smaller, it brought the galaxy from 4.6 to about 2 ms on Dawn. 1.9 ms on Dawn and 3.7 ms in Chrome with the machine under load: Tier B. See [docs/studies/epic-3.md](../../../docs/studies/epic-3.md).

## Pitfalls

- **The arms are not at the ellipses' ends.** Placing the arm populations at the major axes' ends put them on a ring at the rim. The crowding phase has to come from the Jacobian.
- **Dust crowds too.** Dust placed on the arms crowds there as the stars do, so many faint smudges become one opaque lane. Each is very faint, and none sits in the innermost tenth, where the ellipses crowd hardest.
- **Past about 0.7 of the radius the ellipses are nearly round**, the crowding fades and an "arm" closes into a ring; the arm populations stop there.

## Safety

Flash `low`, pattern `none`; the slow turn stays under the motion caps at the default and the strong dose.

## When to use it

A science or space hero, or as the starting point for drawing data (`data-galaxy`).

## References

- C. C. Lin and Frank H. Shu, "On the spiral structure of disk galaxies", _Astrophysical Journal_ (1964).
- Ingo Berg, "Rendering a galaxy with the density wave theory" (beltoforion.de).
- Gérard de Vaucouleurs (1948), for the bulge's profile.
- Star Temple [plan.md](../../../plan.md), story 3.5.
