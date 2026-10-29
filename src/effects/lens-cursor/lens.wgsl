#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "fbm.wgsl"
#include "params.wgsl"

// lens-cursor (story 4.1): the pointer as a small black hole, bending what is behind it.
//
//   bake   once per size: the scene behind the lens, a soft nebula and stars, into a texture. A
//          page can hand over its own image instead.
//   lens   every frame: a point-mass gravitational lens at the pointer. A pixel at θ from the lens
//          sees the source at β = θ − θ_E² θ / |θ|² (the thin-lens equation, θ_E the Einstein
//          radius), so the scene is pulled outwards round the hole into a ring at θ_E, and a second,
//          flipped image of what is behind sits inside it. A lens keeps surface brightness, so
//          sampling the source there is all it takes. Inside a radius the light falls in: the
//          shadow, black, edged by the faint photon ring.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var source_sampler: sampler;

@fragment fn bake(in: FullscreenVarying) -> @location(0) vec4f {
  let p = (in.uv - 0.5) * vec2f(params.aspect, 1.0) * 3.0 + params.seed;
  let q = domain_warp_2d(p, 0.8, 5, 2.0, 0.5);
  let gas = smoothstep(-0.1, 0.35, fbm_2d(q, 6, 2.0, 0.5));
  let hot = smoothstep(0.05, 0.3, fbm_2d(q * 1.4 + 5.1, 5, 2.0, 0.5)) * gas;
  var light = (vec3f(0.06, 0.035, 0.11) * gas + vec3f(0.03, 0.08, 0.12) * hot) * params.glow;
  // Stars: one in some cells of a grid, a spot about a pixel and a half across.
  let cell_size = 9.0;
  let pixel = in.position.xy;
  let base = floor(pixel / cell_size);
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let cell = base + vec2f(f32(i), f32(j));
      let h = hash_2to3(cell + params.seed);
      if (h.z > 0.18) {
        continue;
      }
      let at = (cell + h.xy) * cell_size;
      let d = pixel - at;
      let bright = 0.15 + 3.0 * pow(fract(h.z * 71.3), 6.0);
      let tint = mix(vec3f(1.0, 0.85, 0.7), vec3f(0.75, 0.85, 1.0), fract(h.x * 13.7));
      light += tint * bright * exp(-0.5 * dot(d, d) / 0.7);
    }
  }
  return vec4f(light, 1.0);
}

@fragment fn lens(in: FullscreenVarying) -> @location(0) vec4f {
  let theta = in.position.xy - params.centre;
  let r = length(theta);
  let e2 = params.einstein * params.einstein;
  // The thin lens: where this pixel's light comes from in the source.
  let beta = theta * (1.0 - e2 / max(r * r, 1e-3));
  let uv = (params.centre + beta) / params.out_size;
  var light = textureSampleLevel(source, source_sampler, uv, 0.0).rgb;
  // The shadow, with a one-pixel edge, and the photon ring hugging it.
  let shadow = params.shadow * params.einstein;
  let inside = clamp(shadow - r + 0.5, 0.0, 1.0);
  let ring = exp(-0.5 * pow((r - shadow) / 1.2, 2.0)) * params.ring;
  light = light * (1.0 - inside) + vec3f(1.0, 0.92, 0.8) * ring;
  return vec4f(light, 1.0);
}
