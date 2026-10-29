#include "../../gpu/stars/spot-core.wgsl"
#include "params.wgsl"

// galaxy-collision (story 3.6): two disc galaxies passing each other, as Toomre and Toomre (1972)
// showed tidal tails and bridges form. Each galaxy is a massive core with a disc of test stars on
// circular orbits round it; the stars feel both cores' gravity but not each other's (the restricted
// three-body problem), which is what makes it cheap and is enough for the tails. The cores follow a
// parabolic orbit worked out on the CPU, which hands each frame's sub-steps' core positions in
// `cores`.
//
//   step       one compute invocation a star: the frame's sub-steps of kick-drift-kick leapfrog
//              under both cores' softened gravity.
//   star_vs/fs each star as a spot, from its position in the storage buffer, through the view.

struct Body {
  position: vec4f,
  velocity: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> bodies: array<Body>;
/// Core positions for each sub-step and the one after it: (core A xyz, mass), (core B xyz, mass).
@group(0) @binding(2) var<storage, read> cores: array<vec4f>;
/// The same bodies, read-only, for the vertex stage (which cannot read a read_write buffer).
@group(0) @binding(3) var<storage, read> bodies_seen: array<Body>;

fn gravity(p: vec3f, k: u32) -> vec3f {
  var a = vec3f(0.0);
  for (var c = 0u; c < 2u; c++) {
    let core = cores[k * 2u + c];
    let d = core.xyz - p;
    let r2 = dot(d, d) + params.softening * params.softening;
    a += core.w * d / (r2 * sqrt(r2));
  }
  return a;
}

@compute @workgroup_size(64) fn step(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(params.count)) {
    return;
  }
  var body = bodies[id.x];
  var p = body.position.xyz;
  var v = body.velocity.xyz;
  let dt = params.dt;
  for (var k = 0u; k < u32(params.substeps); k++) {
    v += 0.5 * dt * gravity(p, k);
    p += dt * v;
    v += 0.5 * dt * gravity(p, k + 1u);
  }
  body.position = vec4f(p, body.position.w);
  body.velocity = vec4f(v, body.velocity.w);
  bodies[id.x] = body;
}

struct StarVarying {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) centre: vec2f,
  @location(1) @interpolate(flat) light: vec3f,
}

@vertex fn star_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> StarVarying {
  let body = bodies_seen[instance];
  let p = body.position.xyz;
  // The view: turned about the vertical, then tipped towards the viewer.
  let ct = cos(params.view_turn);
  let st = sin(params.view_turn);
  let yaw = vec3f(p.x * ct - p.z * st, p.y, p.x * st + p.z * ct);
  // Tipped about the screen's horizontal: y up and z towards the viewer mix.
  let seen = vec2f(yaw.x, yaw.y * cos(params.view_tilt) - yaw.z * sin(params.view_tilt));
  let centre = 0.5 * params.out_size + seen * vec2f(1.0, -1.0) * params.scale;
  // Each galaxy's colour, packed in the body's w: 0 the first, 1 the second.
  let light = select(params.colour_a, params.colour_b, body.position.w > 0.5) * body.velocity.w * params.gain;
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  var out: StarVarying;
  let pixel = centre + corners[vertex] * (SPOT_REACH * params.sigma + 1.0);
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.centre = centre;
  out.light = light;
  return out;
}

@fragment fn star_fs(in: StarVarying) -> @location(0) vec4f {
  let share = spot_share(in.position.xy - in.centre, params.sigma);
  if (share <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}
