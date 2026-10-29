// The star spot's pixel arithmetic (story 2.1), shared by every shader that draws stars: a unit
// Gaussian of standard deviation `sigma` integrated over each pixel's square, so a star's light is
// its own wherever it sits between pixels. The TypeScript twin is in src/gpu/stars/spot.ts.
//
//   spot_share(offset, sigma) -> f32    the share of a star's light in the pixel `offset` from it
//   spot_span(x, sigma) -> f32          the 1D share inside [x - 0.5, x + 0.5]
//   SPOT_REACH                          how far a spot's quad reaches, in standard deviations

/// How far a Gaussian's quad reaches, in standard deviations: 1e-3 of the light lies beyond.
const SPOT_REACH: f32 = 3.5;

/// The complementary error function for x >= 0, Abramowitz and Stegun 7.1.26: within 1.5e-7.
fn spot_erfc(x: f32) -> f32 {
  let t = 1.0 / (1.0 + 0.3275911 * x);
  let poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * exp(-x * x);
}

/// The share of a unit Gaussian of standard deviation `sigma`, centred at 0, inside [x - 0.5, x + 0.5].
/// Symmetric in x. Off the centre pixel it is a difference of two small erfc values rather than of
/// two erf values near 1, which in f32 would cancel away the faint tail.
fn spot_span(x: f32, sigma: f32) -> f32 {
  let k = 1.0 / (sigma * 1.41421356);
  let a = abs(x);
  if (a >= 0.5) {
    return 0.5 * (spot_erfc((a - 0.5) * k) - spot_erfc((a + 0.5) * k));
  }
  // The pixel holds the centre: 1 minus the two tails beyond its edges.
  return 1.0 - 0.5 * (spot_erfc((0.5 - a) * k) + spot_erfc((a + 0.5) * k));
}

/// The share of the light of a star `offset` from this pixel's centre, in the pixel.
fn spot_share(offset: vec2f, sigma: f32) -> f32 {
  return spot_span(offset.x, sigma) * spot_span(offset.y, sigma);
}

