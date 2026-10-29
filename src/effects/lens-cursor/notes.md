## How it works

The pointer as a small black hole, bending whatever is behind it: the thin-lens version of `black-hole`, cheap enough to drop over any page.

- **The scene behind** is baked once per size into a half-float texture: a soft warped nebula and a field of hashed stars. A page can hand over its own picture instead with `image`, a URL that is fetched, decoded with `createImageBitmap` and copied into an sRGB texture, so it is sampled in linear light. If it cannot be loaded, the nebula stays and the console says why.
- **The lens** is a point mass at the pointer. A pixel at θ from it sees the source at β = θ (1 − θ_E² / |θ|²), the thin-lens equation: the scene is pulled out round the hole into a ring at the Einstein radius θ_E, and a second, flipped image of what is behind sits inside it. A lens keeps surface brightness, so sampling the source at β is all it takes.
- **The shadow**: inside `shadow` × θ_E the light has fallen in, black, edged by a faint photon ring.
- **The pointer** is followed with an ease of `follow` seconds, so the hole drifts rather than jumps. With no pointer over the canvas it wanders on a slow Lissajous figure, so the effect is never still.

## Cost

One fullscreen pass a frame after the bake, and the tail: 0.09 ms on Dawn at 1080p, 0.46 in Chrome. Tier A. See the Scorecard tab and [docs/studies/epic-4.md](../../../docs/studies/epic-4.md).

## Pitfalls

- **An image from another origin needs CORS.** `fetch` refuses it without, and the effect falls back to its nebula.
- **The Einstein ring is not the photon ring.** The bright ring at θ_E is the lensed scene; the thin ring at the shadow's edge is light that orbited the hole. In a real hole seen from far away the shadow is much smaller than θ_E; here it is a share of it, `shadow`, so it reads at cursor size.

## Safety

Flash `low`, pattern `none`: it bends a calm scene, so it is only as patterned as what it is given. A page that hands over a striped image should check it. Motion follows the pointer and the wander is slow. Light page: yes, over a light image the shadow is the only dark thing.

## When to use it

A hero image that reacts to the pointer; a science or space page's cursor; story 8.5 puts it over a page's own hero.

## References

- Peter Schneider, Jürgen Ehlers and Emilio E. Falco, _Gravitational Lenses_ (Springer, 1992), for the thin-lens equation.
- Star Temple [plan.md](../../../plan.md), story 4.1.
