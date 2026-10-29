#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "params.wgsl"

// deep-field's flat nebula (story 2.2), in two passes:
//
//   bake       once per size or setting: emission in two lines and a separate dust field that
//              absorbs it, into a texture a little larger than the view, at half its resolution.
//              The nebula does not change, so it is never drawn twice (Snow Temple 4.2).
//   composite  every frame: the baked nebula, moved by its share of the parallax, as the scene's
//              background, under the sky's own faint glow. The stars are drawn over it.
//
// Emission lines (story 3.1 refines them): hydrogen-alpha, the deep red of ionised hydrogen, and
// doubly ionised oxygen, teal, where the gas is hottest. In the "hubble" palette sulphur, hydrogen
// and oxygen go to red, green and blue, as the false-colour images do. The gas is layers of
// domain-warped noise; the dust is another warped field, which only absorbs.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var baked: texture_2d<f32>;
@group(0) @binding(2) var baked_sampler: sampler;

/// Colours of the lines as the eye or the false-colour palette shows them, linear.
const H_ALPHA = vec3f(0.85, 0.08, 0.16);
const O_III = vec3f(0.08, 0.62, 0.62);
const HUBBLE_S_II = vec3f(0.9, 0.18, 0.05);
const HUBBLE_H_ALPHA = vec3f(0.2, 0.75, 0.25);
const HUBBLE_O_III = vec3f(0.12, 0.35, 0.95);

@fragment fn bake(in: FullscreenVarying) -> @location(0) vec4f {
  // The texture spans the view plus a margin on every side, in units of the view's height.
  let span = vec2f(params.aspect, 1.0) * (1.0 + 2.0 * params.margin);
  let p = (in.uv - 0.5) * span * params.scale + params.seed;
  // Where the cloud is at all: a large, soft mask, so the nebula fills part of the sky.
  let mask = smoothstep(-0.15, 0.45, fbm_2d(p * 0.35 + 3.1, 4, 2.0, 0.5));
  let q = domain_warp_2d(p, 0.9, 5, 2.0, 0.5);
  let gas = fbm_2d(q, 6, 2.0, 0.5);
  let hydrogen = smoothstep(-0.2, 0.55, gas) * mask;
  // Oxygen where the gas is hottest: the bright cores, and a second field of its own, so the teal
  // sits inside the red rather than tinting all of it.
  // fbm_2d spreads about ±0.2 (its std is 0.18), so the cores start just above the mean.
  let core = smoothstep(0.02, 0.4, gas);
  let oxygen = smoothstep(-0.05, 0.5, fbm_2d(q * 1.3 + 7.3, 5, 2.0, 0.5)) * core * mask;
  let sulphur = smoothstep(0.1, 0.7, fbm_2d(q * 0.8 - 4.7, 5, 2.0, 0.5)) * hydrogen;
  // Dust: thin, warped lanes, absorbing what is behind them.
  let d = domain_warp_2d(p * 1.6 + 11.0, 1.1, 5, 2.0, 0.5);
  let dust = smoothstep(0.0, 0.45, fbm_2d(d, 6, 2.0, 0.55)) * params.dust;
  var light: vec3f;
  if (params.palette > 0.5) {
    light = HUBBLE_S_II * sulphur + HUBBLE_H_ALPHA * hydrogen * 0.6 + HUBBLE_O_III * oxygen;
  } else {
    // Hydrogen glows brighter in the cores. Where oxygen is strong the teal takes over from the red
    // rather than adding to it: summed, the two lines would only make grey.
    let o = oxygen * params.oxygen;
    light = H_ALPHA * hydrogen * (1.0 + core) * (1.0 - min(1.3 * o, 0.92)) + O_III * o * 3.0;
  }
  return vec4f(light * params.glow * (1.0 - dust), 1.0);
}

@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  // The view's place in the baked texture, moved by the nebula's share of the parallax.
  let inner = 1.0 / (1.0 + 2.0 * params.margin);
  let uv = (in.uv + params.offset) * inner + params.margin * inner;
  let nebula = textureSampleLevel(baked, baked_sampler, uv, 0.0).rgb;
  return vec4f(params.sky + nebula, 1.0);
}
