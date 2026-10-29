// Story 1.6: what this family leans on beyond Fire Temple's and Snow Temple's support matrices,
// probed in headless Chrome on this machine's GPU from the dev server (WebGPU needs a secure
// context). Prints JSON for docs/studies/support-probe.json.
//
//   node experiments/support-probe.mjs [--base http://localhost:5500]

import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const base = (
  args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5500'
).replace(/\/$/, '');

const PROBE = `(async () => {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const features = ['float32-filterable', 'float32-blendable', 'timestamp-query', 'shader-f16', 'subgroups', 'rg11b10ufloat-renderable', 'clip-distances'];
  const has = Object.fromEntries(features.map((f) => [f, adapter.features.has(f)]));
  const limits = {};
  for (const key of ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupsPerDimension', 'maxStorageTexturesPerShaderStage']) limits[key] = adapter.limits[key];
  const device = await adapter.requestDevice({ requiredFeatures: features.filter((f) => adapter.features.has(f) && f !== 'subgroups') });
  const errors = [];
  device.onuncapturederror = (e) => errors.push(e.error.message);
  // An r32float storage texture written by a compute pass and read by a filtering sampler.
  const tex = device.createTexture({ size: [4, 4], format: 'r32float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
  const module = device.createShaderModule({ code: \`
    @group(0) @binding(0) var out: texture_storage_2d<r32float, write>;
    @group(0) @binding(1) var<storage, read_write> counts: array<atomic<u32>, 4>;
    @compute @workgroup_size(16) fn main(@builtin(local_invocation_index) i: u32) {
      textureStore(out, vec2u(i % 4u, i / 4u), vec4f(f32(i)));
      atomicAdd(&counts[i % 4u], 1u);
    }\` });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const counts = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const read = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: { buffer: counts } }] }));
  pass.dispatchWorkgroups(64);
  pass.end();
  encoder.copyBufferToBuffer(counts, 0, read, 0, 16);
  device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const atomics = [...new Uint32Array(read.getMappedRange())];
  // A linear sampler on r32float binds only with float32-filterable.
  let filterBinds = false;
  if (has['float32-filterable']) {
    const sampled = device.createShaderModule({ code: \`
      @group(0) @binding(0) var t: texture_2d<f32>;
      @group(0) @binding(1) var s: sampler;
      @fragment fn fs() -> @location(0) vec4f { return textureSampleLevel(t, s, vec2f(0.5), 0.0); }
      @vertex fn vs() -> @builtin(position) vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }\` });
    const p = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }] })] }),
      vertex: { module: sampled, entryPoint: 'vs' }, fragment: { module: sampled, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
    device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) }] });
    filterBinds = true;
  }
  await device.queue.onSubmittedWorkDone();
  const info = adapter.info ?? {};
  return JSON.stringify({ userAgent: navigator.userAgent, adapter: { vendor: info.vendor, architecture: info.architecture, description: info.description }, features: has, limits, atomics, filterBinds, errors });
})()`;

const chrome = await launchChrome();
try {
  await chrome.page('Page.navigate', { url: `${base}/experiments/star-compare.html?method=none` });
  await sleep(1500);
  const result = JSON.parse(await chrome.evaluate(PROBE));
  // f32 precision at solar-system scales: the gap between neighbouring floats at a distance.
  const ulp = (x) => {
    const f = Math.fround(x);
    const next = new Float32Array([f]);
    const bits = new Uint32Array(next.buffer);
    bits[0] += 1;
    return next[0] - f;
  };
  result.f32 = {
    note: 'gap between neighbouring f32 values, metres',
    earthRadius: ulp(6.371e6),
    moonDistance: ulp(3.844e8),
    oneAu: ulp(1.496e11),
    neptune: ulp(4.5e12),
  };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync('docs/studies/support-probe.json', JSON.stringify(result, null, 2) + '\n');
} finally {
  chrome.close();
}
