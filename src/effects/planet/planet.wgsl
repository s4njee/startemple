#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "../../gpu/world/world.wgsl"
#include "../../gpu/world/atmosphere.wgsl"
#include "params.wgsl"

// planet (story 5.3): an Earthlike world from orbit, every pixel a ray.
//
//   the ground   5.1's cube map (world.wgsl, baked once): height, moisture, ice by latitude and
//                height, the sea below its level. Lit by the sun through the air: the light that
//                reaches the ground is the sun's transmittance from there, so the terminator
//                reddens as it does from orbit.
//   the ocean    a rough mirror (GGX, roughness 0.08, Fresnel from 2%): the sun's glint, which
//                slides across the sea as the planet turns.
//   the clouds   a shell 10 km up (times the air's thickening), from the cube's cloud channel
//                turned at its own rate, with its shadow on the ground beneath, cast along the sun.
//   the lights   past the terminator, cities fade in, under the clouds.
//   the air      5.2's atmosphere along the ray, over everything: by the closed-form march, by
//                Hillaire's tables, or by brute force. From inside the air with the tables, the
//                sky is one fetch of the sky-view table.
//
// Lengths are kilometres from the planet's centre. The alpha is the transmittance, so the stars
// drawn first show through the thin air of the limb and not through the planet.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var world: texture_cube<f32>;
@group(0) @binding(2) var world_smp: sampler;
@group(0) @binding(3) var transmittance: texture_2d<f32>;
@group(0) @binding(4) var multiple: texture_2d<f32>;
@group(0) @binding(5) var sky_view: texture_2d<f32>;
@group(0) @binding(6) var lut_smp: sampler;

fn air() -> Atmo {
  return Atmo(params.ground, params.top, params.rayleigh, params.rayleigh_height, params.mie, params.mie_extinction, params.mie_height, params.mie_g);
}

/// World to the planet's own frame, which turns, and back.
fn to_planet(v: vec3f) -> vec3f {
  return vec3f(dot(params.spin_x, v), dot(params.spin_y, v), dot(params.spin_z, v));
}
fn from_planet(v: vec3f) -> vec3f {
  return params.spin_x * v.x + params.spin_y * v.y + params.spin_z * v.z;
}
fn to_clouds(v: vec3f) -> vec3f {
  return vec3f(dot(params.cloud_x, v), dot(params.cloud_y, v), dot(params.cloud_z, v));
}

fn cloud_cover(density: f32) -> f32 {
  return smoothstep(1.0 - params.cloud_cover, 1.0 - params.cloud_cover + 0.25, density);
}

fn sun_light(atmo: Atmo, p: vec3f) -> vec3f {
  let r = length(p);
  return atmo_sun_transmittance(atmo, params.method, transmittance, lut_smp, max(r, atmo.ground + 0.01), dot(p, params.sun) / r);
}

/// The land's albedo from its height, moisture and ice.
fn land_albedo(h: f32, moisture: f32, ice: f32) -> vec3f {
  let above = h - params.sea;
  let desert = vec3f(0.42, 0.33, 0.21);
  let grass = vec3f(0.13, 0.16, 0.07);
  let forest = vec3f(0.04, 0.09, 0.035);
  let rock = vec3f(0.2, 0.18, 0.16);
  var c = mix(desert, grass, smoothstep(0.25, 0.5, moisture));
  c = mix(c, forest, smoothstep(0.55, 0.8, moisture));
  c = mix(c, rock, smoothstep(0.2, 0.45, above));
  return mix(c, vec3f(0.72, 0.76, 0.8), ice);
}

struct Surface {
  light: vec3f,
  glow: vec3f,
}

fn shade_ground(atmo: Atmo, p: vec3f, view: vec3f) -> Surface {
  var out: Surface;
  let n = normalize(p);
  let q = to_planet(n);
  let w = textureSampleLevel(world, world_smp, q, 0.0);
  // The bump: the height's slope from two neighbours a texel away, in the planet's frame.
  var t1 = normalize(cross(q, vec3f(0.0, 1.0, 0.0001)));
  let t2 = cross(q, t1);
  let e = params.texel;
  let hx = textureSampleLevel(world, world_smp, q + t1 * e, 0.0).r - w.r;
  let hy = textureSampleLevel(world, world_smp, q + t2 * e, 0.0).r - w.r;
  let land = smoothstep(params.sea - 0.004, params.sea + 0.004, w.r);
  let lat = asin(clamp(q.y, -1.0, 1.0));
  let ice = world_ice(w.r, lat, params.sea, params.ice_latitude, 0.9);
  let relief = params.relief * land * (1.0 - 0.6 * ice);
  let bumped = normalize(from_planet(normalize(q - (t1 * hx + t2 * hy) * relief / e)));
  let sun = params.sun;
  let lit = sun_light(atmo, p);
  // The clouds' shadow: the cloud the sun's ray crosses on its way down.
  let shell = params.cloud_height / max(dot(n, sun), 0.12);
  let over = cloud_cover(textureSampleLevel(world, world_smp, to_clouds(normalize(p + sun * shell)), 0.0).g);
  let shadow = 1.0 - 0.75 * over * params.cloud_shadow;
  let mu = max(dot(bumped, sun), 0.0);
  // Skylight: the blue air's light from above, a little of the sun's, so the shadows are not black.
  let sky = vec3f(0.2, 0.35, 0.7) * 0.06 * smoothstep(-0.15, 0.4, dot(n, sun));
  let ground = land_albedo(w.r, w.a, ice);
  var light = (ground / 3.14159265) * (lit * mu * shadow + sky);
  // The sea: a deep blue, a rough mirror for the sun, a little sky in the Fresnel.
  if (land < 1.0) {
    let sea_ice = world_ice(params.sea, lat, params.sea, params.ice_latitude, 0.0);
    let deep = mix(vec3f(0.006, 0.018, 0.045), vec3f(0.012, 0.04, 0.07), smoothstep(params.sea - 0.12, params.sea, w.r));
    let h = normalize(sun + view);
    let nh = max(dot(n, h), 0.0);
    let a2 = 0.08 * 0.08;
    let d = nh * nh * (a2 - 1.0) + 1.0;
    let ggx = a2 / (3.14159265 * d * d);
    let nv = max(dot(n, view), 1e-3);
    let fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(h, view), 0.0), 5.0);
    let glint = lit * shadow * ggx * fresnel * max(dot(n, sun), 0.0) / (4.0 * nv * max(dot(n, sun), 1e-3) + 1e-4) * params.glint;
    let sea = deep / 3.14159265 * (lit * max(dot(n, sun), 0.0) * shadow + sky) + glint;
    let frozen = vec3f(0.7, 0.75, 0.8) / 3.14159265 * (lit * max(dot(n, sun), 0.0) * shadow + sky);
    light = mix(mix(sea, frozen, sea_ice), light, land);
  }
  out.light = light;
  // Night: the lights fade in past the terminator, dimmed under cloud.
  let night = smoothstep(0.04, -0.12, dot(n, sun));
  let city = w.b * land * (1.0 - ice) * night * (1.0 - 0.7 * over);
  out.glow = vec3f(1.0, 0.62, 0.28) * city * params.cities;
  return out;
}

fn shade_cloud(atmo: Atmo, p: vec3f) -> vec4f {
  let n = normalize(p);
  let cover = cloud_cover(textureSampleLevel(world, world_smp, to_clouds(n), 0.0).g);
  let lit = sun_light(atmo, p);
  // Clouds scatter a lot and wrap the light round: a soft terminator, bright tops.
  let mu = dot(n, params.sun);
  let wrap = max(mu + 0.1, 0.0) / 1.1;
  let sky = vec3f(0.25, 0.35, 0.6) * 0.05 * smoothstep(-0.15, 0.4, mu);
  return vec4f(vec3f(0.85) / 3.14159265 * (lit * wrap + sky), cover * params.cloud_opacity);
}

@fragment fn planet_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let atmo = air();
  let ndc = vec2f(2.0 * in.uv.x - 1.0, 1.0 - 2.0 * in.uv.y) - params.shift;
  let rd = normalize(params.forward + params.right * ndc.x * params.tan_fov.x + params.up * ndc.y * params.tan_fov.y);
  let ro = params.eye;
  let r_eye = length(ro);
  let top = atmo_sphere(ro, rd, atmo.top);
  if (top.x > top.y || top.y < 0.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let t0 = max(top.x, 0.0);
  var t1 = top.y;
  // The ground, with the limb's pixel covered by its share, not all or nothing.
  let along = -dot(ro, rd);
  let miss = length(ro + rd * along);
  let pixel = params.pixel_angle * max(along, 1.0);
  var coverage = clamp(0.5 - (miss - atmo.ground) / pixel, 0.0, 1.0);
  let ground = atmo_sphere(ro, rd, atmo.ground);
  var p = vec3f(0.0);
  if (ground.x <= ground.y && ground.x > 0.0) {
    t1 = ground.x;
    p = ro + rd * ground.x;
  } else if (coverage > 0.0) {
    p = normalize(ro + rd * along) * atmo.ground;
  }
  if (r_eye < atmo.top && params.inside > 0.5) {
    coverage = select(0.0, 1.0, ground.x <= ground.y && ground.x > 0.0);
  }
  var surface = vec3f(0.0);
  var glow = vec3f(0.0);
  if (coverage > 0.0) {
    let g = shade_ground(atmo, p, -rd);
    surface = g.light;
    glow = g.glow;
    // The cloud shell, between the eye and the ground.
    let shell = atmo_sphere(ro, rd, atmo.ground + params.cloud_height);
    var tc = shell.x;
    if (tc < 0.0) {
      tc = shell.y;
    }
    if (shell.x <= shell.y && tc > 0.0 && tc < t1 + 1.0) {
      let c = shade_cloud(atmo, ro + rd * tc);
      surface = mix(surface, c.rgb, c.a);
      glow *= 1.0 - c.a;
    }
  }

  var inscatter = vec3f(0.0);
  var through = vec3f(1.0);
  if (params.method == ATMO_LUT && params.inside > 0.5) {
    // From inside the air, Hillaire's sky-view table: one fetch for the sky, and the table's
    // transmittance to the ground.
    let up = ro / r_eye;
    var sun_t = params.sun - up * dot(params.sun, up);
    sun_t = select(normalize(sun_t), params.right, dot(sun_t, sun_t) < 1e-8);
    let flat_dir = rd - up * dot(rd, up);
    let az = acos(clamp(dot(normalize(flat_dir + 1e-7 * params.right), sun_t), -1.0, 1.0));
    let el = asin(clamp(dot(rd, up), -1.0, 1.0));
    inscatter = textureSampleLevel(sky_view, lut_smp, atmo_sky_uv(atmo, r_eye, az, el), 0.0).rgb;
    if (coverage > 0.0) {
      let mu_eye = dot(rd, up);
      let n = normalize(p);
      through = atmo_lut_transmittance(atmo, transmittance, lut_smp, atmo.ground + 0.01, -dot(rd, n)) /
        max(atmo_lut_transmittance(atmo, transmittance, lut_smp, r_eye, -mu_eye), vec3f(1e-6));
      through = min(through, vec3f(1.0));
    } else {
      through = atmo_lut_transmittance(atmo, transmittance, lut_smp, r_eye, dot(rd, up));
    }
  } else {
    let result = atmo_integrate(atmo, ro, rd, t0, t1, params.sun, i32(params.steps), params.method, params.ms > 0.5, transmittance, multiple, lut_smp);
    inscatter = result.inscatter;
    through = result.transmittance;
  }
  var light = (surface * coverage * through + inscatter) * params.sun_illuminance;
  light += glow * coverage * through;
  // The sun's disc, where the sky shows it.
  if (coverage < 1.0) {
    let c = dot(rd, params.sun);
    let disc = smoothstep(cos(ATMO_SUN_RADIUS * 1.15), cos(ATMO_SUN_RADIUS * 0.85), c);
    light += disc * (1.0 - coverage) * through * params.sun_illuminance * params.sun_disc;
  }
  let alpha = (1.0 - coverage) * dot(through, vec3f(0.2126, 0.7152, 0.0722));
  return vec4f(light, alpha);
}
