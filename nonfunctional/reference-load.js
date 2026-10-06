import http from 'k6/http';
import { check } from 'k6';

// Deliberately restricted to the independent, local reference target.
const target = __ENV.QUALITY_K6_TARGET || 'http://127.0.0.1:4175';
if (target !== 'http://127.0.0.1:4175') throw new Error('k6 target must be the allowlisted local reference at 127.0.0.1:4175');

export const options = {
  scenarios: { reference_capture: { executor: 'shared-iterations', vus: 2, iterations: 20, maxDuration: '30s' } },
  maxRedirects: 0,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate==1'],
  },
};

export function setup() {
  const health = http.get(`${target}/health`, { timeout: '3s' });
  if (health.status !== 200 || health.json('target') !== 'reference') throw new Error('Local synthetic reference is not healthy');
}

export default function () {
  const result = http.post(`${target}/api/action`, JSON.stringify({ actor: 'mira', tool: 'capture', args: { text: 'Adult Mira visited a fictional hill.' } }),
    { headers: { 'content-type': 'application/json' }, timeout: '3s' });
  check(result, {
    'capture succeeded': response => response.status === 200,
    'exact draft returned': response => response.json('draft') === 'Adult Mira visited a fictional hill.',
  });
}

export function handleSummary(data) {
  const summary = {
    target, mode: 'independent synthetic reference; no model calls',
    virtualUsers: 2, iterations: 20, provisionalBudgets: { p95Ms: 500, errorRate: 0.01 },
    requests: data.metrics.http_reqs?.values?.count ?? null,
    p50Ms: data.metrics.http_req_duration?.values?.['med'] ?? null,
    p95Ms: data.metrics.http_req_duration?.values?.['p(95)'] ?? null,
    errorRate: data.metrics.http_req_failed?.values?.rate ?? null,
    checksRate: data.metrics.checks?.values?.rate ?? null,
  };
  return { stdout: JSON.stringify(summary, null, 2) + '\n' };
}
