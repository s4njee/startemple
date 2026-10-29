#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "../../gpu/world/rings.wgsl"
#include "params.wgsl"

// gas-giant (stories 5.4 and 5.5): Jupiter, Saturn or Neptune, every pixel a ray.
//
//   bands    the colour is a function of latitude: pale zones and dark belts between the jets, the
//            winds that blow east and west in turn. The texture within them is noise carried along
//            by those winds: each latitude slides at its own speed, so it shears into streaks and
//            curls where neighbouring bands run past each other.
//   flow     sheared noise stretches without end, so it is read twice, half a period apart, each
//            reading restarting when its weight is zero, and the two cross-faded (Water Temple's
//            flow advection). Nothing is simulated: the bands are a function of time.
//   storms   ovals that persist: the Great Red Spot, white ovals, Neptune's dark spot, each drifting
//            with its band's wind, the texture inside turned as a vortex.
//   light    the sun on a sphere with Minnaert limb darkening, and with rings, 5.5's slab: their
//            shadow on the planet, the planet's on them, and the light they pass when lit from
//            behind. The rings sit in the equatorial plane, in front of the planet or behind it.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var ring_table: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

const GG_PI: f32 = 3.14159265358979;

fn to_planet(v: vec3f) -> vec3f {
  return vec3f(dot(params.spin_x, v), dot(params.spin_y, v), dot(params.spin_z, v));
}

/// The zonal wind at latitude `lat`, in radians of longitude a second: alternating jets, stronger
/// at the equator, their spacing uneven.
fn wind(lat: f32) -> f32 {
  let s = sin(lat * params.bands + 0.4) * 0.65 + sin(lat * params.bands * 1.7 + 1.3) * 0.35;
  let equator = params.equator_jet * exp(-pow(lat / 0.12, 2.0));
  return params.wind * (s * cos(lat) + equator);
}

/// Belts (1) and zones (0) between the jets, their edges wandering with longitude a little.
fn belt(lat: f32, lon: f32) -> f32 {
  let wobble = 0.01 * sin(lon * 3.0 + lat * 20.0) + 0.02 * gnoise_2d(vec2f(lat * 7.0, 2.0));
  let l = lat + wobble;
  // Three incommensurate waves, so no two belts are the same width (a regular grating would
  // read as a pattern).
  let x = 0.55 * sin(l * params.bands * 0.5 + params.band_phase) + 0.3 * sin(l * params.bands * 0.83 + 2.1) +
    0.15 * sin(l * params.bands * 1.61 + 0.7);
  return smoothstep(-0.3, 0.4, x);
}

/// The cloud texture at (lon, lat) on the sphere, `tau` seconds of wind after it was laid.
fn texture_at(lon: f32, lat: f32, tau: f32, seed: f32) -> f32 {
  let shear = abs(wind(lat + 0.01) - wind(lat - 0.01)) / 0.02;
  let l = lon - wind(lat) * tau;
  // On the sphere, so nothing pinches; stretched along the bands, so the texture streaks.
  let p = vec3f(cos(lat) * cos(l) * 3.2, sin(lat) * 16.0, cos(lat) * sin(l) * 3.2) + seed;
  let warp = vec2f(fbm_3d(p * 0.7, 3, 2.0, 0.5), fbm_3d(p * 0.7 + 7.0, 3, 2.0, 0.5));
  let curl = 0.5 + min(shear * tau * 0.6, 1.2);
  return fbm_3d(p + vec3f(warp.x, warp.y * 0.3, warp.x) * curl, 6, 2.05, 0.52);
}

struct Storm {
  inside: f32,
  lon: f32,
  lat: f32,
  colour: vec3f,
}

/// The storms: within an oval, the texture's coordinates are turned as a vortex is, most at its
/// centre, and the oval's own colour mixed in.
fn storms(lon: f32, lat: f32) -> Storm {
  var out: Storm;
  out.inside = 0.0;
  out.lon = lon;
  out.lat = lat;
  out.colour = vec3f(0.0);
  for (var i = 0; i < 4; i++) {
    let s = params.storms[i];
    if (s.z <= 0.0) {
      continue;
    }
    let centre = s.x + wind(s.y) * params.time * 0.15;
    var dl = lon - centre;
    dl = dl - 2.0 * GG_PI * round(dl / (2.0 * GG_PI));
    let q = vec2f(dl * cos(lat) / s.z, (lat - s.y) / s.w);
    let r = length(q);
    if (r > 1.6) {
      continue;
    }
    let twist = 2.2 * exp(-r * r * 1.5) + params.time * 0.05 * (1.0 - smoothstep(0.0, 1.2, r));
    let c = cos(twist);
    let sn = sin(twist);
    let turned = vec2f(c * q.x - sn * q.y, sn * q.x + c * q.y);
    let w = 1.0 - smoothstep(0.7, 1.5, r);
    out.lon = mix(out.lon, centre + turned.x * s.z / cos(lat), w);
    out.lat = mix(out.lat, s.y + turned.y * s.w, w);
    let core = 1.0 - smoothstep(0.3, 1.0, r);
    out.colour = params.storm_colours[i].rgb;
    out.inside = max(out.inside, core * params.storm_colours[i].w);
  }
  return out;
}

fn albedo_at(n: vec3f) -> vec3f {
  let q = to_planet(n);
  let lat = asin(clamp(q.y, -1.0, 1.0));
  let lon = atan2(q.z, q.x);
  let storm = storms(lon, lat);
  // Two readings of the flow, half a period apart, each restarting when its weight is zero.
  let phase = fract(params.time / params.period);
  let wa = 1.0 - abs(2.0 * phase - 1.0);
  let a = texture_at(storm.lon, storm.lat, phase * params.period, 0.0);
  let b = texture_at(storm.lon, storm.lat, fract(phase + 0.5) * params.period, 17.3);
  let tex = mix(b, a, wa);
  let k = belt(storm.lat, storm.lon);
  var colour = mix(params.zone, params.belt, clamp(k + 1.2 * tex, 0.0, 1.0));
  colour *= 1.0 + 0.4 * tex;
  // The poles darker and greyer, as Jupiter's and Saturn's are.
  colour = mix(colour, params.polar, smoothstep(0.85, 1.25, abs(lat)));
  return mix(colour, storm.colour, storm.inside);
}

@fragment fn giant_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let ndc = vec2f(2.0 * in.uv.x - 1.0, 1.0 - 2.0 * in.uv.y) - params.shift;
  let rd = normalize(params.forward + params.right * ndc.x * params.tan_fov.x + params.up * ndc.y * params.tan_fov.y);
  let ro = params.eye;
  let sun = params.sun;
  let ring_normal = params.spin_y;

  // The planet, its limb pixel covered by its share.
  let b = dot(ro, rd);
  let along = -b;
  let miss = length(ro + rd * along);
  let pixel = params.pixel_angle * max(along, 1.0);
  let coverage = clamp(0.5 - (miss - 1.0) / pixel, 0.0, 1.0);
  var t_planet = 1e9;
  var planet = vec3f(0.0);
  if (coverage > 0.0) {
    let h = b * b - dot(ro, ro) + 1.0;
    var p = normalize(ro + rd * along);
    if (h > 0.0) {
      t_planet = -b - sqrt(h);
      p = ro + rd * t_planet;
    } else {
      t_planet = along;
    }
    let n = normalize(p);
    let mu0 = dot(n, sun);
    let mu = max(dot(n, -rd), 0.02);
    // Minnaert's law: I = A mu0^k mu^(k-1), the terminator softened over a few degrees.
    let lit = smoothstep(-0.03, 0.06, mu0) * pow(max(mu0, 0.004), params.minnaert) * pow(mu, params.minnaert - 1.0);
    var shade = lit;
    if (params.rings > 0.5) {
      shade *= ring_shadow(ring_table, smp, n, sun, ring_normal);
    }
    planet = albedo_at(n) * shade * params.light + params.night * albedo_at(n);
  }

  // The rings, where the ray meets their plane between the inner and outer edges.
  var ring = vec3f(0.0);
  var ring_alpha = 0.0;
  var t_ring = -1.0;
  if (params.rings > 0.5) {
    t_ring = ring_hit(ro, rd, ring_normal);
    if (t_ring > 0.0) {
      let p = ro + rd * t_ring;
      let mu_view = dot(-rd, ring_normal);
      // The pixel's footprint across the rings, foreshortened: four samples across it, so the
      // narrow gaps and the edges are filtered, not aliased.
      let foot = params.pixel_angle * t_ring / max(abs(mu_view), 0.08);
      let r = length(p);
      var s = vec2f(0.0);
      for (var k = 0; k < 4; k++) {
        s += ring_sample(ring_table, smp, r + foot * ((f32(k) + 0.5) / 4.0 - 0.5)) * 0.25;
      }
      if (s.x > 0.0) {
        let mu_sun = dot(sun, ring_normal);
        let phase = ring_phase(dot(rd, sun), s.y);
        let light = ring_slab(s.x, mu_sun, mu_view, 1.0, phase) * ring_planet_shadow(p, sun);
        let colour = mix(params.ring_colour, vec3f(0.8, 0.78, 0.75), s.y);
        // The slab's phase is per steradian over 4 pi; times 4 pi, its light is on the planet's scale
        // (albedo times the sun's cosine), at a particle albedo of a half.
        ring = colour * light * params.light * 2.0 * GG_PI;
        ring_alpha = 1.0 - exp(-s.x / max(abs(mu_view), 1e-3));
      }
    }
  }

  var light = planet * coverage;
  var alpha = 1.0 - coverage;
  if (ring_alpha > 0.0 && (t_ring < t_planet || coverage < 1.0)) {
    // In front of the planet (or beside its limb): over everything behind.
    let front = select(1.0 - coverage, 1.0, t_ring < t_planet);
    light = ring * front + light * (1.0 - ring_alpha * front);
    alpha *= 1.0 - ring_alpha;
  }
  return vec4f(light, alpha);
}
