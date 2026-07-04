import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app';

describe('GET /health', () => {
  it('reports ok (used by the post-deploy smoke test)', async () => {
    const res = await api.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
