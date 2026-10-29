#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "params.wgsl"

// nebula (story 3.2): a flat nebula in layers, in emission lines.
//
//   bake       once per layer and size: the layer's gas as the strength of each emission line,
//              coloured by the palette (src/gpu/nebula/lines.ts), and its dust as a transmittance,
//              into a texture a little larger than the view at half its resolution. Written as
//              (light, transmittance).
//   composite  every frame per layer, far to near: the baked layer moved by its share of the
//              parallax, blended over what is behind it as behind * transmittance + light. Stars
//              drawn between the layers are dimmed by the dust of every layer in front of them.
//
// The gas is domain-warped noise. Hydrogen fills it, Hα and a third as much Hβ; oxygen glows where
// the gas is densest and hottest, close to the stars that ionise it; sulphur at the edges, where
// the ionised gas meets the neutral (ionisation fronts). Dust is a separate warped field that only
// absorbs, strongest in the near layer, where it stands against the glow as dark lanes and pillars.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var baked: texture_2d<f32>;
@group(0) @binding(2) var baked_sampler: sampler;

@fragment fn bake(in: FullscreenVarying) -> @location(0) vec4f {
  let span = vec2f(params.aspect, 1.0) * (1.0 + 2.0 * params.margin);
  let p = (in.uv - 0.5) * span * params.scale + params.seed;
  // Where the cloud is at all. fbm_2d spreads about ±0.2 (its standard deviation is 0.18), so
  // thresholds sit inside that: here about a third of the sky has gas, the rest open space.
  let mask = smoothstep(0.06, 0.26, fbm_2d(p * 0.3 + 3.1, 4, 2.0, 0.5));
  let q = domain_warp_2d(p, 0.9, 5, 2.0, 0.5);
  let density = fbm_2d(q, 6, 2.0, 0.5);
  let gas = smoothstep(-0.12, 0.3, density) * mask;
  let core = smoothstep(0.06, 0.3, density) * mask;
  let edge = gas * (1.0 - core) * smoothstep(-0.08, 0.2, fbm_2d(q * 1.7 - 4.7, 4, 2.0, 0.5));
  let oxygen = core * smoothstep(-0.08, 0.2, fbm_2d(q * 1.3 + 7.3, 5, 2.0, 0.5));
  let light =
    params.hydrogen_alpha * gas * (1.0 + core) * params.strength.y * (1.0 - 0.6 * oxygen) +
    params.hydrogen_beta * gas * params.strength.w +
    params.oxygen * oxygen * params.strength.z +
    params.sulphur * edge * params.strength.x;
  // Dust: warped lanes and a ridged field for the pillars' sharp edges.
  let d = domain_warp_2d(p * 1.5 + 11.0, 1.2, 5, 2.0, 0.5);
  let lanes = smoothstep(0.0, 0.4, fbm_2d(d, 6, 2.0, 0.55));
  let pillars = smoothstep(0.55, 0.85, ridged_2d(d * 0.6 + 2.0, 5, 2.0, 0.5));
  let dust = clamp(max(lanes, pillars) * params.dust, 0.0, 0.97);
  return vec4f(light * params.glow * (1.0 - dust), 1.0 - dust);
}

@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  let inner = 1.0 / (1.0 + 2.0 * params.margin);
  let uv = (in.uv + params.offset) * inner + params.margin * inner;
  return textureSampleLevel(baked, baked_sampler, uv, 0.0);
}

@fragment fn sky(in: FullscreenVarying) -> @location(0) vec4f {
  return vec4f(params.sky, 1.0);
}
