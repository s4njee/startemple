#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "flicker.wgsl"
#include "../../gpu/stars/sky.wgsl"
#include "../../gpu/stars/spot-core.wgsl"
#include "params.wgsl"

// real-sky (stories 2.6 and 2.8): the visitor's own sky, in two passes.
//
//   sky_fs     every pixel looks along its direction through the stereographic view: below the
//              skyline it is dark ground, above it the sky's glow, brightest at the horizon where
//              the line of sight runs through the most air.
//   star_vs/fs the catalogue, one instanced quad a star: each star's altitude and azimuth from the
//              local sidereal time and latitude, worked out here per frame (story 2.4: past a few
//              thousand stars positions come from the GPU, not from script). Stars below the
//              skyline are culled. Near the horizon a star is dimmed by the air it shines through
//              (extinction, per airmass) and twinkles harder and faster (scintillation, 2.8),
//              through Fire Temple's capped flicker; a bright one flashes colours as well.

@group(0) @binding(0) var<uniform> params: Params;

struct SkyStar {
  /// Right ascension and declination of the date, radians; light at magnitude 0 times 10^(−0.4 m);
  /// a seed for its flicker.
  at: vec4f,
  /// Colour at luminance 1; w is 1 for a planet, which does not twinkle (a disc, not a point).
  colour: vec4f,
}

@group(0) @binding(1) var<storage, read> stars: array<SkyStar>;

fn view() -> SkyView {
  return sky_view(params.view_alt, params.view_az, params.scale);
}

// --- The sky and the ground ---------------------------------------------------------------------

@fragment fn sky_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let dir = sky_unproject(in.position.xy, view(), params.out_size);
  let alt = asin(clamp(dir.z, -1.0, 1.0));
  let az = atan2(dir.x, dir.y);
  let ridge = sky_ridge(az, params.ridge, params.ridge_seed);
  // The glow grows with the air along the line of sight, as airglow and distant towns' light do.
  let air = 1.0 - sqrt(max(sin(max(alt, 0.0)), 0.0));
  let sky = mix(params.zenith, params.horizon, air * air) * params.glow;
  // The ground: black, with the faintest light along the skyline, so the hills read as hills.
  let below = smoothstep(0.0, 0.004, ridge - alt);
  let ground = params.horizon * params.glow * 0.08 * exp(-max(ridge - alt, 0.0) * 40.0);
  return vec4f(mix(sky, ground, below), 1.0);
}

// --- The stars ----------------------------------------------------------------------------------

struct StarVarying {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) centre: vec2f,
  @location(1) @interpolate(flat) light: vec3f,
}

@vertex fn star_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> StarVarying {
  var out: StarVarying;
  out.position = vec4f(2.0, 2.0, 0.0, 1.0);
  out.light = vec3f(0.0);
  let star = stars[instance];
  let horizon = sky_alt_az(star.at.x, star.at.y, params.lst, params.latitude);
  let alt = horizon.x;
  let az = horizon.y;
  // Behind the hills, or below the horizon: culled.
  if (alt < sky_ridge(az, params.ridge, params.ridge_seed)) {
    return out;
  }
  let p = sky_project(sky_vector(alt, az), view(), params.out_size);
  if (p.z < -0.2) {
    return out;
  }
  // Extinction: k magnitudes per airmass beyond the first.
  let x = sky_airmass(alt);
  var light = star.colour.rgb * star.at.z * params.gain * pow(10.0, -0.4 * params.extinction * (x - 1.0));
  // Scintillation: the flicker for this altitude, over its mean, so the star's average light holds.
  if (params.twinkle > 0.0 && star.colour.w < 0.5) {
    let s = scintillation_settings(alt, params.twinkle, params.wind);
    let mean = 1.0 - (s.depth + s.shimmer) / 2.0;
    let seed = u32(star.at.w);
    let white = flicker_intensity(params.time, seed, s) / mean;
    // A bright star low down flashes colours too: each channel its own signal, mixed in.
    let chroma = clamp((x - 3.0) / 8.0, 0.0, 0.6) * smoothstep(0.5, 3.0, dot(light, vec3f(0.2126, 0.7152, 0.0722)));
    let channels = vec3f(
      flicker_intensity(params.time, seed * 3u + 1u, s),
      flicker_intensity(params.time, seed * 3u + 2u, s),
      flicker_intensity(params.time, seed * 3u + 3u, s),
    ) / mean;
    light *= mix(vec3f(white), channels, chroma);
  }
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let bright = dot(light, vec3f(0.2126, 0.7152, 0.0722));
  let widest = select(params.sigma, params.sigma * params.halo_scale, bright >= params.halo_min);
  let half = SPOT_REACH * widest + 1.0;
  let pixel = p.xy + corners[vertex] * half;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.centre = p.xy;
  out.light = light;
  return out;
}

@fragment fn star_fs(in: StarVarying) -> @location(0) vec4f {
  let offset = in.position.xy - in.centre;
  let bright = dot(in.light, vec3f(0.2126, 0.7152, 0.0722));
  let halo = select(0.0, params.halo_share, bright >= params.halo_min);
  var share = (1.0 - halo) * spot_share(offset, params.sigma);
  if (halo > 0.0) {
    share += halo * spot_share(offset, params.sigma * params.halo_scale);
  }
  if (share <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}
