#include "spot-core.wgsl"
#include "spot-params.wgsl"

// Star spots (story 2.1): one instanced quad per star, adding its light to the scene as a Gaussian
// integrated over each pixel's square, so the light a star adds is its own wherever it sits
// between pixels, and its peak pixel changes smoothly as it moves (src/gpu/stars/spot.ts).
//
// A star is two vec4f, the point layer's layout: (x, y, sigma, unused) in device pixels from the
// top left, with the core Gaussian's standard deviation; then (r, g, b, unused), its total light.
//
// A share `halo_share` of a bright star's light goes into a second, wider Gaussian (`halo_scale`
// times the core's sigma), the soft glow round a bright star in a photograph, which a full-screen
// bloom would otherwise pay for. Stars dimmer than `halo_min` keep all their light in the core and
// a small quad.

struct Star {
  at: vec4f,
  light: vec4f,
}

@group(0) @binding(0) var<storage, read> stars: array<Star>;
@group(0) @binding(1) var<uniform> params: SpotParams;

struct SpotVarying {
  @builtin(position) position: vec4f,
  /// The star's centre, device pixels. The fragment takes its offset from its own exact pixel
  /// position: an offset interpolated across the quad is off by about 1e-3 px, which a narrow
  /// spot's steep tail turns into a 1% error.
  @location(0) @interpolate(flat) centre: vec2f,
  @location(1) @interpolate(flat) sigma: f32,
  @location(2) @interpolate(flat) light: vec3f,
  @location(3) @interpolate(flat) halo: f32,
}

@vertex fn spot_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> SpotVarying {
  let star = stars[instance];
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let sigma = max(star.at.z, params.min_sigma);
  let light = star.light.rgb * params.gain;
  let bright = dot(light, vec3f(0.2126, 0.7152, 0.0722));
  let halo = select(0.0, params.halo_share, bright >= params.halo_min && params.halo_share > 0.0);
  let widest = select(sigma, sigma * params.halo_scale, halo > 0.0);
  // A pixel whose centre is outside the quad gets nothing: one pixel of margin past the reach.
  let half = SPOT_REACH * widest + 1.0;
  let offset = corners[vertex] * half;
  let pixel = star.at.xy + offset;
  var out: SpotVarying;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.centre = star.at.xy;
  out.sigma = sigma;
  out.light = light;
  out.halo = halo;
  return out;
}

@fragment fn spot_fs(in: SpotVarying) -> @location(0) vec4f {
  let offset = in.position.xy - in.centre;
  var share = (1.0 - in.halo) * spot_share(offset, in.sigma);
  if (in.halo > 0.0) {
    share += in.halo * spot_share(offset, in.sigma * params.halo_scale);
  }
  if (share <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}
