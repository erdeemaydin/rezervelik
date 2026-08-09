import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, SeededTenant } from '../helpers/seed';

// Security-audit finding: POST /api/uploads/image had no authMiddleware at
// all (only tenantMiddleware — just an X-Restaurant-ID header), and trusted
// the client-supplied mimetype/originalname instead of the actual file
// bytes, so a spoofed Content-Type + a malicious extension (e.g. .html/.svg)
// could be stored and served same-origin. Both are fixed: auth is required,
// and the stored extension is derived from sniffing the real file content.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const uploadDir = path.join(process.cwd(), 'public', 'uploads');

describe('POST /api/uploads/image', () => {
  let a: SeededTenant;
  const writtenFiles: string[] = [];

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  afterAll(async () => {
    await Promise.all(writtenFiles.map((f) => fs.unlink(path.join(uploadDir, f)).catch(() => {})));
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

  it('stores the file under an extension derived from its real content, not the attacker-supplied filename', async () => {
    const res = await api
      .post('/api/uploads/image')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .attach('image', PNG_MAGIC, { filename: 'not-actually-used.html', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^\/uploads\/[0-9]+-[0-9]+\.png$/);
    writtenFiles.push(path.basename(res.body.data.url));
  });

  it('rejects a non-image mimetype outright', async () => {
    const res = await api
      .post('/api/uploads/image')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .attach('image', Buffer.from('not an image'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});
