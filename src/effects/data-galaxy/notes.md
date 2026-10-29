## How it works

A page's own data drawn as a galaxy. Every point is a star; every cluster is an arm, in its own colour (evenly round the hue wheel at one OKLCH lightness, so no cluster outshines another); every value is a brightness, and the brightest points sit nearer the core. Where a point sits along its arm comes from its `order` (an embedding's first axis, a date, a rank). The galaxy turns slowly as one.

**Picking.** Every point's place is worked out on the CPU each frame (a few thousand is cheap, and the picking needs it). The point nearest the pointer within 14 CSS pixels is picked: it is drawn with a bright core and a wide halo, its cluster brightens and the rest dim, and the canvas fires a bubbling `sr-pick` event whose `detail` is the point (`label`, `cluster`, `clusterName`, `value`, `index`), or `null` when the pointer leaves it. A page listens and shows what it likes:

```js
canvas.addEventListener('sr-pick', (event) => tooltip.show(event.detail));
```

The gallery shows a made-up data set (`data.ts`): uneven clusters, long-tailed values. A page hands its own through the library entry (story 9.1).

## Cost

3 000 points and one picked spot. 0.7 ms on Dawn; 2.9 ms in Chrome with the machine under load, so Tier A provisionally. Positions come from script, which 2.4 found is the limit past about 10 000 points.

## Pitfalls

- **Picking needs the positions on the CPU.** That is why this effect does not move its stars on the GPU, and why its limit is about 10 000 points.
- **Colour by cluster at fixed lightness.** Hues at one OKLCH lightness keep clusters equal; at fixed RGB saturation yellow would outshine blue.

## Safety

Flash `low`, pattern `none`; the turn is slow. A pick changes brightness at once, but only when the pointer moves onto a point.

## When to use it

"Our community" on a product page, or an embedding or clustering a visitor explores by hovering. The family's most practical effect.

## References

- Star Temple [plan.md](../../../plan.md), story 3.7.
