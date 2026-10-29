// Light near a black hole (story 4.2), in WGSL: the twin of src/gpu/gravity/geodesic.ts. In
// Schwarzschild radii, a photon at x with unit direction v bends by
//
//   a = −1.5 h² x / |x|⁵,   h² = |x × v|²  (kept along the ray)
//
// (Antonelli's "Starless"), integrated by fourth-order Runge–Kutta with a step that shrinks near
// the hole.
//
//   struct GrRay { x: vec3f, v: vec3f }
//   gr_h2(ray) -> f32                     the ray's squared angular momentum
//   gr_step_length(r) -> f32              the step at radius r
//   gr_step(ray, h2, ds) -> GrRay         one Runge–Kutta step of length ds
//   GR_PHOTON_SPHERE, GR_CRITICAL_IMPACT, GR_ISCO

const GR_PHOTON_SPHERE: f32 = 1.5;
const GR_CRITICAL_IMPACT: f32 = 2.5980762;
const GR_ISCO: f32 = 3.0;

struct GrRay {
  x: vec3f,
  v: vec3f,
}

fn gr_h2(ray: GrRay) -> f32 {
  let h = cross(ray.x, ray.v);
  return dot(h, h);
}

fn gr_bend(x: vec3f, h2: f32) -> vec3f {
  let r2 = dot(x, x);
  return (-1.5 * h2 / (r2 * r2 * sqrt(r2))) * x;
}

fn gr_step_length(r: f32) -> f32 {
  return clamp(0.08 * (r - 0.9), 0.005, 2.0);
}

fn gr_step(ray: GrRay, h2: f32, ds: f32) -> GrRay {
  let x = ray.x;
  let v = ray.v;
  let k1x = v;
  let k1v = gr_bend(x, h2);
  let k2x = v + 0.5 * ds * k1v;
  let k2v = gr_bend(x + 0.5 * ds * k1x, h2);
  let k3x = v + 0.5 * ds * k2v;
  let k3v = gr_bend(x + 0.5 * ds * k2x, h2);
  let k4x = v + ds * k3v;
  let k4v = gr_bend(x + ds * k3x, h2);
  return GrRay(
    x + (ds / 6.0) * (k1x + 2.0 * k2x + 2.0 * k3x + k4x),
    v + (ds / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v),
  );
}
