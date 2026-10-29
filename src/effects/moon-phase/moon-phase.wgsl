#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "moon.wgsl"
#include "params.wgsl"

// moon-phase (story 5.6): the Moon as a body, its phase the value.
//
// The disc is a sphere seen from far off, lit by the sun from the direction the phase puts it in:
// behind the Moon at new, beside it at the quarters, behind us at full. Its face scatters by
// Lommel-Seeliger, mu0 / (mu0 + mu), as Moon Temple's moon.wgsl does, so a full moon is a flat coin
// and not a ball, with the same maria. What this adds:
//
//   a soft terminator   mu0 eased through zero over `softness` instead of clipped, so the edge of
//                       the light is a gradient a loader can sweep smoothly, not a stair of pixels;
//   craters on it       a little relief, which the low sun at the terminator picks out;
//   earthshine          the dark part lit by the Earth, which is full when the Moon is new: bluish,
//                       strongest in a thin crescent, gone at full.
//
// `shading` 1 draws Moon Temple's moon_disc instead, for the comparison.

@group(0) @binding(0) var<uniform> params: Params;

/// w log(1 + e^(x/w)), written so it cannot overflow for a sharp edge (small w).
fn softplus(x: f32, w: f32) -> f32 {
  return max(x, 0.0) + w * log(1.0 + exp(-abs(x) / w));
}

@fragment fn moon_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let p = in.position.xy;
  if (params.shading > 0.5) {
    let light = moon_disc(p, params.centre, params.radius, params.phase, params.tilt);
    return vec4f(vec3f(light) * params.light, 1.0);
  }
  let c = cos(params.tilt);
  let s = sin(params.tilt);
  let d = (p - params.centre) / params.radius;
  let q = vec2f(c * d.x + s * d.y, -s * d.x + c * d.y);
  let r2 = dot(q, q);
  let edge = clamp((1.0 - sqrt(r2)) * params.radius + 0.5, 0.0, 1.0);
  if (edge <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  var n = vec3f(q.x, q.y, sqrt(max(1.0 - r2, 0.0)));
  // Craters: a dimpled relief on the sphere, which only a low sun shows.
  let bump = vec2f(fbm_2d(q * 9.0 + 3.0, 4, 2.1, 0.5), fbm_2d(q * 9.0 + 11.0, 4, 2.1, 0.5));
  n = normalize(n + vec3f(bump * params.relief, 0.0));
  let a = 2.0 * 3.14159265 * params.phase;
  let sun = vec3f(sin(a), 0.0, -cos(a));
  let mu0 = softplus(dot(n, sun), params.softness);
  let mu = max(n.z, 1e-3);
  let albedo = moon_albedo(q) * (0.92 + 0.08 * fbm_2d(q * 23.0, 3, 2.0, 0.5));
  // Lommel-Seeliger, scaled so the centre of a full moon is 1.
  let lit = 2.0 * mu0 / (mu0 + mu);
  // Earthshine: the Earth seen from the Moon is full at new moon and new at full.
  let earth = 0.5 * (1.0 + cos(a));
  let shine = params.earthshine * earth * vec3f(0.78, 0.88, 1.0);
  return vec4f(edge * albedo * (vec3f(lit) + shine) * params.light, 1.0);
}
