#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "fbm.wgsl"
#include "blackbody.wgsl"
#include "../../gpu/sun/sun.wgsl"
#include "../../gpu/sun/corona.wgsl"
#include "params.wgsl"

// solar-surface (stories 6.1 and 6.2): the Sun in white light, disc and limb.
//
// Every pixel of the disc is a point on a sphere with a temperature: the Eddington-Barbier
// temperature for how slantwise we look into it (limb darkening, sun.wgsl), raised in the
// granules' rising centres and lowered in their lanes, lowered further in sunspots (the umbra
// about 4 100 K, the penumbra between, in radial filaments), raised a little in the faculae round
// them near the limb, where they show. Its light is a blackbody's at that temperature, so every
// contrast on the disc comes through the Planck curve. The Sun turns faster at its equator than
// near its poles (Snodgrass's law), so the spots near the equator pull ahead.
//
// Beyond the limb, 6.2's prominences, chromosphere and corona, at `beyond` times their real
// brightness: as a coronagraph or a filter would show them, since in white light the disc
// outshines them a million times.

@group(0) @binding(0) var<uniform> params: Params;

fn turn_y(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

@fragment fn sun_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let d = (in.position.xy - params.centre) * vec2f(1.0, -1.0) / params.radius;
  let r = length(d);
  let pixel = 1.0 / params.radius;
  let edge = clamp((1.0 - r) / pixel + 0.5, 0.0, 1.0);
  var light = vec3f(0.0);
  if (edge > 0.0) {
    let z = sqrt(max(1.0 - r * r, 0.0));
    let n = vec3f(d, z);
    let mu = z;
    // Into the Sun's turning frame: its axis tipped in the picture, then differential rotation.
    let ca = cos(params.axis);
    let sa = sin(params.axis);
    let q0 = vec3f(ca * n.x + sa * n.y, -sa * n.x + ca * n.y, n.z);
    let s2 = q0.y * q0.y;
    let q = turn_y(q0, params.rotation * (1.0 - 0.162 * s2 - 0.121 * s2 * s2));
    var t = sun_temperature(mu);
    // Sunspots: the umbra and the penumbra's filaments, and faculae round them near the limb.
    var quiet = 1.0;
    var spot = 1.0;
    var faculae = 0.0;
    for (var i = 0; i < 6; i++) {
      let s = params.spots[i];
      if (s.z <= 0.0) {
        continue;
      }
      let c = vec3f(cos(s.y) * sin(s.x), sin(s.y), cos(s.y) * cos(s.x));
      let theta = acos(clamp(dot(q, c), -1.0, 1.0));
      if (theta > s.w * 4.0) {
        continue;
      }
      let e1 = normalize(cross(c, vec3f(0.0, 1.0, 0.0)));
      let e2 = cross(c, e1);
      let v = q - c * dot(q, c);
      let around = atan2(dot(v, e2), dot(v, e1));
      // The penumbra's edge is ragged; its filaments run outwards from the umbra.
      let ragged = s.w * (1.0 + 0.1 * gnoise_2d(vec2f(around * 2.5, f32(i) * 7.0)));
      let filaments = 0.5 + 0.5 * gnoise_2d(vec2f(around * 38.0 + f32(i) * 13.0, theta / s.w * 2.0));
      let umbra = 1.0 - smoothstep(s.z * 0.85, s.z * 1.15, theta);
      let penumbra = 1.0 - smoothstep(ragged * 0.92, ragged * 1.08, theta);
      spot = min(spot, mix(mix(1.0, 0.83 + 0.12 * filaments, penumbra), 0.7, umbra));
      quiet = min(quiet, 1.0 - penumbra);
      faculae = max(faculae, smoothstep(s.w * 4.0, s.w * 1.4, theta) * (1.0 - penumbra));
    }
    // Granules: a few per cent hotter in their centres, cooler in the lanes; their contrast fades
    // towards the limb, where we look across the cells rather than down into them.
    let g = sun_granulation(q * params.granules * 0.5, params.time);
    let contrast = params.contrast * sqrt(mu) * quiet;
    t *= 1.0 + contrast * (g.x - 0.3 - 0.6 * g.y);
    t *= spot;
    t *= 1.0 + 0.03 * faculae * (1.0 - mu) * (0.6 + 0.4 * gnoise_2d(q.xy * 120.0));
    light = sun_light(t) * edge;
  }
  // Beyond the limb.
  var beyond = params.corona_colour * corona(d, params.activity, params.seed) * 1e-6;
  beyond += params.prominence_colour * chromosphere(d, params.time) * 6e-6;
  for (var i = 0; i < 4; i++) {
    beyond += params.prominence_colour * prominence(d, params.arches[i], params.time) * 4e-6;
  }
  light += beyond * params.beyond * (1.0 - edge);
  return vec4f(light * params.light * mix(vec3f(1.0), params.tint, params.filter_tint), 1.0);
}
