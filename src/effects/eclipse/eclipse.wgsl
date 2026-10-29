#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "fbm.wgsl"
#include "blackbody.wgsl"
#include "../../gpu/sun/sun.wgsl"
#include "../../gpu/sun/corona.wgsl"
#include "params.wgsl"

// eclipse (story 6.3): a total solar eclipse, on the sky in solar radii.
//
// The Moon's disc, a little larger than the Sun's, slides across it. Its limb is not a circle: the
// mountains and valleys along it (exaggerated three times, to read at page scale) let the last of
// the photosphere through in beads, Baily's beads, at second and third contact; the last bead
// alone, blooming in the HDR tail, is the diamond ring. While the photosphere is covered, the
// corona, a millionth of its brightness (6.2), the pink chromosphere and the prominences show.
//
// Nothing here fakes the corona's appearance: everything is drawn at its real brightness, relative
// to the disc's centre, and multiplied by `exposure`, which the CPU eases towards the inverse of
// the uncovered photosphere, as an eye or an auto-exposing camera does. The diamond ring is the
// moment the exposure is still set for totality when the first bead appears.

@group(0) @binding(0) var<uniform> params: Params;

/// The Moon's limb radius in the direction `a` (radians), solar radii: valleys cut into it.
fn moon_limb(a: f32) -> f32 {
  let ridge = fbm_2d(vec2f(cos(a), sin(a)) * 9.0 + params.seed, 5, 2.2, 0.55);
  let peaks = 0.5 + 0.5 * gnoise_2d(vec2f(cos(a), sin(a)) * 37.0 + params.seed);
  return params.moon_radius * (1.0 + params.relief * (0.6 * ridge + 0.4 * peaks - 0.25));
}

@fragment fn eclipse_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let p = (in.position.xy - params.centre) * vec2f(1.0, -1.0) / params.radius;
  let pixel = 1.0 / params.radius;
  let r = length(p);
  // The Moon, with its ragged limb, covering by its share at the edge pixel.
  let dm = p - params.moon;
  let dl = length(dm);
  var limb = params.moon_radius;
  if (abs(dl - params.moon_radius) < params.moon_radius * params.relief * 2.0 + 2.0 * pixel) {
    limb = moon_limb(atan2(dm.y, dm.x));
  }
  let moon = clamp((limb - dl) / pixel + 0.5, 0.0, 1.0);
  // The photosphere, limb-darkened.
  let disc = clamp((1.0 - r) / pixel + 0.5, 0.0, 1.0);
  var light = vec3f(0.0);
  if (disc > 0.0) {
    let mu = sqrt(max(1.0 - r * r, 0.0));
    light += sun_light(sun_temperature(mu)) * disc;
  }
  // What is above the limb, at its real brightness, behind the Moon too; skipped while the
  // exposure is set for the photosphere, when it would round to black.
  if (params.exposure > 2e3) {
    var above = params.corona_colour * corona(p, params.activity, params.seed) * 1e-6;
    above += params.prominence_colour * chromosphere(p, params.time) * 6e-6;
    for (var i = 0; i < 4; i++) {
      above += params.prominence_colour * prominence(p, params.arches[i], params.time) * 4e-6;
    }
    light += above * (1.0 - disc);
  }
  // The sky: blue by day, dimming with the light that reaches it, deep blue in totality.
  let sky = params.sky * params.sky_level;
  // The Moon's face: lit only by the Earth, faintly.
  light = mix(light, vec3f(0.35, 0.4, 0.5) * 2e-8, moon) + sky;
  // Brighter than half-float can hold, the beads clamp; the bloom spreads them into the ring.
  return vec4f(min(light * params.exposure, vec3f(30000.0)), 1.0);
}
