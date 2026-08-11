import { afterEach, beforeAll, describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, SeededTenant } from '../helpers/seed';

// Security-audit finding: POST /api/uploads/image had no authMiddleware at
// all (only tenantMiddleware — just an X-Restaurant-ID header), and trusted
// the client-supplied mimetype/originalname instead of the actual file bytes,
// so a spoofed Content-Type + a malicious extension (e.g. .html/.svg) could
// be stored and served same-origin. Both are fixed: auth is required, and the
// stored extension/mimetype passed to the storage provider is derived from
// sniffing the real file content (src/controllers/uploadController.ts).
//
// No S3_* env vars are set in the test environment (see tests/setup/test-env.ts),
// so these exercise the local-disk fallback end-to-end through the real HTTP
// route/middleware stack: tenantMiddleware -> authMiddleware -> multer memory
// storage -> controller -> LocalDiskStorageProvider. The S3-backed provider's
// own logic is covered by tests/unit/storage.test.ts against a mocked S3 client.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('POST /api/uploads/image', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  afterEach(() => {
    fs.rmSync(path.join(process.cwd(), 'public', 'uploads', a.restaurant.id), { recursive: true, force: true });
  });

  it('requires the X-Restaurant-ID header (tenantMiddleware)', async () => {
    const res = await api.post('/api/uploads/image').attach('image', PNG_MAGIC, 'photo.png');
    expect(res.status).toBe(400);
  });

  it('rejects an upload with no session at all', async () => {
    const res = await api
      .post('/api/uploads/image')
      .set('X-Restaurant-ID', a.restaurant.id)
      .attach('image', PNG_MAGIC, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('rejects a file whose content is not a recognized image, even with a spoofed image Content-Type', async () => {
    const res = await api
      .post('/api/uploads/image')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.html', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-image mimetype outright', async () => {
    const res = await api
      .post('/api/uploads/image')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .attach('image', Buffer.from('not an image'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('rejects a request with no file at all', async () => {
    const res = await api.post('/api/uploads/image').set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('stores the file under a tenant-namespaced key, with the extension derived from its real content, not the attacker-supplied filename', async () => {
    const res = await api
      .post('/api/uploads/image')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .attach('image', PNG_MAGIC, { filename: 'not-actually-used.html', contentType: 'image/png' });

    expect(res.status).toBe(200);
    const url: string = res.body.data.url;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/uploads\//);
    expect(url).toContain(`/uploads/${a.restaurant.id}/`);
    expect(url).toMatch(/\.png$/);

    // The file actually landed on disk under the returned key.
    const key = url.split('/uploads/')[1];
    const written = fs.readFileSync(path.join(process.cwd(), 'public', 'uploads', ...key.split('/')));
    expect(written.equals(PNG_MAGIC)).toBe(true);
  });

  it('never lets one tenant see another tenant in its upload key', async () => {
    const b = await seedTenant();
    try {
      const resA = await api
        .post('/api/uploads/image')
        .set(auth(a.tokens.admin, a.restaurant.id))
        .attach('image', PNG_MAGIC, { filename: 'a.png', contentType: 'image/png' });
      const resB = await api
        .post('/api/uploads/image')
        .set(auth(b.tokens.admin, b.restaurant.id))
        .attach('image', PNG_MAGIC, { filename: 'b.png', contentType: 'image/png' });

      expect(resA.body.data.url).toContain(`/uploads/${a.restaurant.id}/`);
      expect(resB.body.data.url).toContain(`/uploads/${b.restaurant.id}/`);
      expect(resA.body.data.url).not.toContain(b.restaurant.id);
      expect(resB.body.data.url).not.toContain(a.restaurant.id);
    } finally {
      fs.rmSync(path.join(process.cwd(), 'public', 'uploads', b.restaurant.id), { recursive: true, force: true });
    }
  });
});
