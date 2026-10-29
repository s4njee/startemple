#include "fullscreen.wgsl"
#include "../../gpu/stars/spot-core.wgsl"
#include "params.wgsl"

// spiral-galaxy (story 3.5): the density wave, after Lin and Shu, as Ingo Berg draws it.
//
// Every star moves on an ellipse about the centre. The ellipses' orientation turns a little more
// with each step outwards (`twist`), so neighbouring ellipses crowd together along two lines that
// wind out from the centre: the spiral arms. The ellipses turn rigidly at the pattern speed, so the
// arms keep their shape, while each star goes round its own ellipse at its own speed (a flat
// rotation curve: the same speed at every radius, so inner stars go round faster than the arms and
// outer ones slower) and passes through the arms as it does. Nothing is simulated: every position
// is a closed function of time, worked out here in the vertex shader.
//
// Populations, by `kind`:
//   0  disc stars, spread round their ellipses
//   1  bulge stars, on ellipses tipped out of the plane, a puffed-up old population
//   2  young blue stars, born where the ellipses crowd (`arm_phase`) and held there, as a young
//      population is: they light the arms
//   3  H II regions: pink hydrogen-alpha knots at the arms, held there (they live a few million
//      years, and are always where new stars are being born, not where old ones went)
//   4  dust, just inside the arms: wide, soft, absorbing (drawn by `dust_fs`, multiplying)
//   5  tracers: a dozen disc stars drawn brighter, to show the stars moving through the arms
//
//   glow_fs    the bulge and disc as a smooth glow, the light of stars too faint to draw one by one.

@group(0) @binding(0) var<uniform> params: Params;

struct GalaxyStar {
  /// Ellipse size (radius, galaxy units), phase on it at t = 0, kind, height out of the plane.
  at: vec4f,
  /// Light (colour times brightness).
  light: vec4f,
}

@group(0) @binding(1) var<storage, read> stars: array<GalaxyStar>;

const GALAXY_PI: f32 = 3.14159265358979;
const DUST_REACH: f32 = 2.2;

/// How elongated the ellipse of size a is: round at the centre and the rim, most in between.
fn eccentricity(a: f32) -> f32 {
  return params.ellipticity * smoothstep(0.02, 0.25, a) * (1.0 - 0.6 * smoothstep(0.6, 1.0, a));
}

/// Angular speed round an ellipse of size a: solid-body inside the core, then a flat rotation curve.
fn orbit_speed(a: f32) -> f32 {
  return params.orbit_speed / max(a, params.core);
}

/// The minor semi-axis of the ellipse of size a.
fn minor(a: f32) -> f32 {
  return a * (1.0 - eccentricity(a));
}

/// Where on the ellipse of size a its neighbours crowd closest: the arm. The stars' density goes as
/// one over the Jacobian of (a, e) to position, which in the ellipse's own frame is
///   A sin 2e + B cos 2e + C,   A = twist (a² − b²) / 2,   B = (b − a b′) / 2,   C = (b + a b′) / 2,
/// smallest at 2e = atan2(−A, −B). The second arm is half a turn round, at e + π.
fn arm_phase(a: f32) -> f32 {
  let b = minor(a);
  let h = 1e-3;
  let db = (minor(a + h) - b) / h;
  let big_a = params.twist * (a * a - b * b) * 0.5;
  let big_b = (b - a * db) * 0.5;
  return 0.5 * atan2(-big_a, -big_b);
}

/// A point in the galaxy's plane on the ellipse of size a at parametric angle e, at time t.
fn ellipse_point(a: f32, e: f32) -> vec2f {
  let tilt = params.twist * a + params.pattern_angle;
  let p = vec2f(a * cos(e), minor(a) * sin(e));
  return vec2f(p.x * cos(tilt) - p.y * sin(tilt), p.x * sin(tilt) + p.y * cos(tilt));
}

/// Galaxy plane (x, y, height z) to the screen: turned by the position angle, then inclined.
fn to_screen(p: vec3f) -> vec2f {
  let c = cos(params.inclination);
  let s = sin(params.inclination);
  let flat = vec2f(p.x, p.y * c - p.z * s);
  let turned = vec2f(
    flat.x * cos(params.position_angle) - flat.y * sin(params.position_angle),
    flat.x * sin(params.position_angle) + flat.y * cos(params.position_angle),
  );
  return 0.5 * params.out_size + turned * params.scale;
}

/// Where a star is now, in the galaxy's plane and height.
fn star_position(star: GalaxyStar) -> vec3f {
  let a = star.at.x;
  let kind = u32(star.at.z);
  // The populations born in the arms (young stars, H II regions, dust) are held there: they turn
  // with the pattern, not with the stars, and their phase is an offset from the arm's.
  let born = kind == 2u || kind == 3u || kind == 4u;
  let e = select(star.at.y + orbit_speed(a) * params.time, arm_phase(a) + star.at.y, born);
  let p = ellipse_point(a, e);
  return vec3f(p, star.at.w);
}

struct StarVarying {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) centre: vec2f,
  @location(1) @interpolate(flat) light: vec3f,
  @location(2) @interpolate(flat) sigma: f32,
}

fn quad(star: GalaxyStar, vertex: u32, sigma: f32, light: vec3f, reach: f32) -> StarVarying {
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let centre = to_screen(star_position(star));
  let pixel = centre + corners[vertex] * (reach * sigma + 1.0);
  var out: StarVarying;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.centre = centre;
  out.light = light;
  out.sigma = sigma;
  return out;
}

@vertex fn star_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> StarVarying {
  let star = stars[instance];
  let kind = u32(star.at.z);
  // H II regions are knots a few pixels across, not points.
  let sigma = select(params.sigma, params.sigma * 3.0, kind == 3u);
  let tracer = select(1.0, params.tracers, kind == 5u);
  return quad(star, vertex, sigma, star.light.rgb * params.gain * tracer, SPOT_REACH);
}

@fragment fn star_fs(in: StarVarying) -> @location(0) vec4f {
  let share = spot_share(in.position.xy - in.centre, in.sigma);
  if (share <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}

// --- Dust ---------------------------------------------------------------------------------------

@vertex fn dust_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> StarVarying {
  let star = stars[instance];
  // Dust only dims, so its Gaussian is cut at 2.2 widths (it is 9% at the edge): the quads cover
  // a third of the area a star spot's reach would, and the dust is most of the overdraw.
  return quad(star, vertex, params.dust_size, vec3f(star.light.a * params.dust), DUST_REACH);
}

/// Multiplies what is behind by the dust's transmittance: 1 − opacity × a soft Gaussian.
@fragment fn dust_fs(in: StarVarying) -> @location(0) vec4f {
  let d = in.position.xy - in.centre;
  let cover = in.light.r * exp(-0.5 * dot(d, d) / (in.sigma * in.sigma));
  return vec4f(vec3f(1.0 - min(cover, 0.95)), 1.0);
}

// --- The smooth glow ----------------------------------------------------------------------------

@fragment fn glow_fs(in: FullscreenVarying) -> @location(0) vec4f {
  // Back from the screen to the galaxy's plane.
  let d = (in.position.xy - 0.5 * params.out_size) / params.scale;
  let turned = vec2f(
    d.x * cos(params.position_angle) + d.y * sin(params.position_angle),
    -d.x * sin(params.position_angle) + d.y * cos(params.position_angle),
  );
  let plane = vec2f(turned.x, turned.y / max(cos(params.inclination), 0.05));
  let r = length(plane);
  // The bulge is round on the sky (a spheroid), the disc is in the plane.
  let rb = length(turned) / params.bulge_radius;
  let bulge = params.bulge * exp(-7.67 * (pow(rb, 0.25) - 1.0)) * 0.002;
  let disc = params.disc * exp(-r / 0.28) * smoothstep(1.15, 0.7, r);
  let light = params.bulge_colour * min(bulge, 60.0) + params.disc_colour * disc;
  return vec4f(params.sky + light * params.glow, 1.0);
}
