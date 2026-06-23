// Rulkov 2002 2D chaotic-map neuron iteration (the "LIF_SHADER" name is historical).
//   x_{n+1} = alpha / (1 + x_n^2) + y_n
//   y_{n+1} = y_n - mu*(x_n - sigma) + jitter
//   spike   = (x_n <= 0) && (x_{n+1} > 0)
// Lifted from js/brain/gpu-compute.js to stay byte-compatible with the browser donor.

struct Params {
  n: u32,
  tau: f32, vRest: f32, vThresh: f32, vReset: f32, dt: f32, r: f32,
  effectiveDrive: f32,
  noiseAmp: f32,
  seed: u32,
  gridX: u32,
  numRegions: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> state: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> spikes: array<u32>;
@group(0) @binding(3) var<storage, read> currents: array<f32>;
@group(0) @binding(4) var<storage, read> regionGates: array<f32>;

const ALPHA: f32 = 4.5;
const MU: f32 = 0.001;

fn pcg(v: u32) -> u32 {
  var s = v * 747796405u + 2891336453u;
  let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (word >> 22u) ^ word;
}

fn randomFloat(seed: u32, idx: u32) -> f32 {
  let h = pcg(seed ^ pcg(idx));
  return (f32(h) / 4294967295.0) * 2.0 - 1.0;
}

// regionGates is packed [start, end, gate, pad] per region.
fn lookupRegionGate(neuronIdx: u32, numRegions: u32) -> f32 {
  for (var i: u32 = 0u; i < numRegions; i = i + 1u) {
    let base = i * 4u;
    let start = u32(regionGates[base]);
    let end = u32(regionGates[base + 1u]);
    if (neuronIdx >= start && neuronIdx < end) {
      return regionGates[base + 2u];
    }
  }
  return 1.0;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x + gid.y * params.gridX * 256u;
  if (i >= params.n) { return; }

  let sigma = -1.0 + clamp(params.effectiveDrive / 40.0, 0.0, 1.0) * 1.5;
  let gate = lookupRegionGate(i, params.numRegions);
  let drive = (params.effectiveDrive + currents[i]) * gate;
  let sigmaEff = -1.0 + clamp(drive / 40.0, 0.0, 1.0) * 1.5;

  let s = state[i];
  let xN = s.x;
  let yN = s.y;
  let jitter = randomFloat(params.seed, i) * params.noiseAmp;

  let xNext = ALPHA / (1.0 + xN * xN) + yN;
  let yNext = yN - MU * (xN - sigmaEff) + jitter;

  state[i] = vec2<f32>(xNext, yNext);
  if (xN <= 0.0 && xNext > 0.0) {
    spikes[i] = 1u;
  } else {
    spikes[i] = 0u;
  }
  // sigma referenced to keep parity with the JS uniform layout
  _ = sigma;
}
