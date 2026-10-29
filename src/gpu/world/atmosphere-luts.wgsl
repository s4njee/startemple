#include "fullscreen.wgsl"
#include "atmosphere.wgsl"
#include "lut-params.wgsl"

// Hillaire's tables (story 5.2), baked by src/gpu/world/atmosphere.ts:
//
//   transmittance_fs  256 × 64: the transmittance from (radius, cosine) to the top of the air, by a
//                     40-step march. Baked when the air changes.
//   ms_fs             32 × 32: Ψ_ms, the light scattered more than once, as an isotropic source per
//                     unit of scattering, for (cosine of the sun's zenith angle, height). 64
//                     directions, 20 steps each, second order L2 and the transfer f_ms, then the
//                     geometric series L2 / (1 − f_ms) for every order after. Baked after it.
//   sky_view_fs       192 × 108: the in-scattered light in every direction from the camera's height,
//                     for this frame's sun. 30 steps a texel, one fetch a pixel after.

@group(0) @binding(0) var<uniform> lut: LutParams;
@group(0) @binding(1) var transmittance: texture_2d<f32>;
@group(0) @binding(2) var multiple: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

fn air() -> Atmo {
  return Atmo(lut.ground, lut.top, lut.rayleigh, lut.rayleigh_height, lut.mie, lut.mie_extinction, lut.mie_height, lut.mie_g);
}

@fragment fn transmittance_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let atmo = air();
  let r_mu = atmo_lut_r_mu(atmo, in.uv);
  return vec4f(exp(-atmo_depth_march(atmo, r_mu.x, r_mu.y, 40)), 1.0);
}

@fragment fn ms_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let atmo = air();
  let uv = in.uv;
  let mu_sun = 2.0 * uv.x - 1.0;
  let r = mix(atmo.ground + 0.01, atmo.top - 0.01, uv.y);
  let origin = vec3f(0.0, 0.0, r);
  let sun = vec3f(sqrt(max(1.0 - mu_sun * mu_sun, 0.0)), 0.0, mu_sun);
  var l2 = vec3f(0.0);
  var f_ms = vec3f(0.0);
  for (var j = 0; j < 8; j++) {
    for (var i = 0; i < 8; i++) {
      // 64 directions spread evenly over the sphere: equal steps in azimuth and in cos(zenith).
      let phi = 2.0 * ATMO_PI * (f32(i) + 0.5) / 8.0;
      let cos_theta = 1.0 - 2.0 * (f32(j) + 0.5) / 8.0;
      let sin_theta = sqrt(max(1.0 - cos_theta * cos_theta, 0.0));
      let rd = vec3f(sin_theta * cos(phi), sin_theta * sin(phi), cos_theta);
      let ground_hit = atmo_sphere(origin, rd, atmo.ground);
      let top_hit = atmo_sphere(origin, rd, atmo.top);
      var t1 = top_hit.y;
      let hits_ground = ground_hit.x <= ground_hit.y && ground_hit.x > 0.0;
      if (hits_ground) {
        t1 = ground_hit.x;
      }
      let dt = t1 / 20.0;
      var throughput = vec3f(1.0);
      var lum = vec3f(0.0);
      var transfer = vec3f(0.0);
      for (var s = 0; s < 20; s++) {
        let p = origin + rd * ((f32(s) + 0.5) * dt);
        let rp = length(p);
        let density = atmo_density(atmo, rp);
        let extinction = atmo_extinction(atmo, density);
        let scattering = atmo.rayleigh * density.x + vec3f(atmo.mie * density.y);
        let lit = atmo_lut_transmittance(atmo, transmittance, smp, rp, dot(p, sun) / rp) *
          atmo_sun_visible(atmo, rp, dot(p, sun) / rp);
        let step = exp(-extinction * dt);
        let integral = throughput * (1.0 - step) / max(extinction, vec3f(1e-9));
        // Isotropic: the phase is 1 / 4 pi for both the sunlight and the transfer.
        lum += integral * scattering * lit / (4.0 * ATMO_PI);
        transfer += integral * scattering;
        throughput *= step;
      }
      if (hits_ground) {
        let p = origin + rd * t1;
        let n = normalize(p);
        let lit = atmo_lut_transmittance(atmo, transmittance, smp, atmo.ground + 0.01, dot(n, sun));
        lum += throughput * lit * max(dot(n, sun), 0.0) * lut.albedo / ATMO_PI;
      }
      // Each direction stands for 4 pi / 64 of the sphere; the isotropic phase is 1 / 4 pi.
      l2 += lum / 64.0;
      f_ms += transfer / 64.0;
    }
  }
  return vec4f(l2 / (1.0 - min(f_ms, vec3f(0.999))), 1.0);
}

@fragment fn sky_view_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let atmo = air();
  let r = lut.view_radius;
  let dir = atmo_sky_direction(atmo, r, in.uv);
  let origin = vec3f(0.0, 0.0, r);
  let rd = vec3f(cos(dir.y) * cos(dir.x), cos(dir.y) * sin(dir.x), sin(dir.y));
  let sun = vec3f(sqrt(max(1.0 - lut.view_sun * lut.view_sun, 0.0)), 0.0, lut.view_sun);
  let ground_hit = atmo_sphere(origin, rd, atmo.ground);
  var t1 = atmo_sphere(origin, rd, atmo.top).y;
  if (ground_hit.x <= ground_hit.y && ground_hit.x > 0.0) {
    t1 = ground_hit.x;
  }
  let result = atmo_integrate(atmo, origin, rd, 0.0, t1, sun, 30, ATMO_LUT, lut.ms > 0.5, transmittance, multiple, smp);
  return vec4f(result.inscatter, 1.0);
}
