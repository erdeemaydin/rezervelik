import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { api } from '../helpers/app';
import { resetDb, seedTenant, SeededTenant } from '../helpers/seed';

// No S3_* env vars are set in the test environment (see tests/setup/test-env.ts),
// so these exercise the local-disk fallback end-to-end through the real HTTP
// route/middleware stack: tenantMiddleware -> multer memory storage -> controller
// -> LocalDiskStorageProvider. The S3-backed provider's own logic is covered by
// tests/unit/storage.test.ts against a mocked S3 client.
describe('POST /api/uploads/image', () => {
  let a: SeededTenant;

  afterEach(() => {
    if (a) {
      fs.rmSync(path.join(process.cwd(), 'public', 'uploads', a.restaurant.id), { recursive: true, force: true });
    }
  });

  it('requires the X-Restaurant-ID header (tenantMiddleware)', async () => {
    const res = await api.post('/api/uploads/image').attach('image', Buffer.from('fake'), 'photo.png');
    expect(res.status).toBe(400);
  });

  it('rejects non-image uploads', async () => {
    await resetDb();
    a = await seedTenant();
    const res = await api
      .post('/api/uploads/image')
      .set('X-Restaurant-ID', a.restaurant.id)
      .attach('image', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(500); // multer's fileFilter error surfaces through the generic error handler
  });

  it('rejects a request with no file at all', async () => {
    await resetDb();
    a = await seedTenant();
    const res = await api.post('/api/uploads/image').set('X-Restaurant-ID', a.restaurant.id);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('stores the image and returns a URL usable directly as an <img src>', async () => {
    await resetDb();
    a = await seedTenant();
    const res = await api
      .post('/api/uploads/image')
      .set('X-Restaurant-ID', a.restaurant.id)
      .attach('image', Buffer.from('fake-png-bytes'), { filename: 'dish.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const url: string = res.body.data.url;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/uploads\//);
    // Tenant-namespaced so one restaurant's uploads never collide with another's.
    expect(url).toContain(`/uploads/${a.restaurant.id}/`);
    expect(url.endsWith('.png')).toBe(true);

    // The file actually landed on disk under the returned key.
    const key = url.split('/uploads/')[1];
    const written = fs.readFileSync(path.join(process.cwd(), 'public', 'uploads', ...key.split('/')));
    expect(written.toString()).toBe('fake-png-bytes');
  });

  it('never lets one tenant see another tenant in its upload key', async () => {
    await resetDb();
    a = await seedTenant();
    const b = await seedTenant();
    try {
      const resA = await api
        .post('/api/uploads/image')
        .set('X-Restaurant-ID', a.restaurant.id)
        .attach('image', Buffer.from('a'), { filename: 'a.png', contentType: 'image/png' });
      const resB = await api
        .post('/api/uploads/image')
        .set('X-Restaurant-ID', b.restaurant.id)
        .attach('image', Buffer.from('b'), { filename: 'b.png', contentType: 'image/png' });

      expect(resA.body.data.url).toContain(`/uploads/${a.restaurant.id}/`);
      expect(resB.body.data.url).toContain(`/uploads/${b.restaurant.id}/`);
      expect(resA.body.data.url).not.toContain(b.restaurant.id);
      expect(resB.body.data.url).not.toContain(a.restaurant.id);
    } finally {
      fs.rmSync(path.join(process.cwd(), 'public', 'uploads', b.restaurant.id), { recursive: true, force: true });
    }
  });
});
