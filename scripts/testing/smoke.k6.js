import http from 'k6/http';
import { check, fail } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const allowedHosts = (__ENV.K6_ALLOWED_HOSTS || '127.0.0.1,localhost,::1')
  .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
const target = new URL(baseUrl);
if (!allowedHosts.includes(target.hostname.toLowerCase())) {
  fail('BASE_URL host must be listed in K6_ALLOWED_HOSTS');
}

export const options = {
  stages: [
    { duration: '30s', target: 1 },
    { duration: '1m', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const response = http.get(`${baseUrl}/api/public/version`, { tags: { name: 'readonly-version' } });
  check(response, { 'version endpoint returns 200': (res) => res.status === 200 });
}
