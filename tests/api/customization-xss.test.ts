import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, SeededTenant } from '../helpers/seed';

// Security-audit finding: reservationInfoText/reservationWarningText were
// stored verbatim and rendered via dangerouslySetInnerHTML on the public
// booking page in all four layout components — a stored XSS against every
// anonymous visitor, plantable by any tenant staffer with manage_settings.
// PUT /api/customization now sanitizes both fields on write.
describe('PUT /api/customization sanitizes rich-text fields', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('strips a <script> tag and event-handler attribute from reservationInfoText', async () => {
    const res = await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        reservationInfoText: '<p>Please arrive on time.</p><script>alert(document.cookie)</script><img src=x onerror="alert(1)">',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.reservationInfoText).not.toContain('<script');
    expect(res.body.data.reservationInfoText).not.toContain('onerror');
    expect(res.body.data.reservationInfoText).toContain('Please arrive on time.');
  });

  it('strips javascript: URLs from an anchor href in reservationWarningText', async () => {
    const res = await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        reservationWarningText: '<a href="javascript:alert(1)">click me</a>',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.reservationWarningText).not.toContain('javascript:');
  });

  it('preserves a safe, basic-formatting payload unchanged in substance', async () => {
    const res = await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        reservationInfoText: '<p>We hold tables for <strong>15 minutes</strong>. <a href="https://example.com">Details</a></p>',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.reservationInfoText).toContain('<strong>15 minutes</strong>');
    expect(res.body.data.reservationInfoText).toContain('href="https://example.com"');
  });

  it('explicit null clears the field; omitting it leaves the field unchanged', async () => {
    await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ reservationInfoText: '<p>Some text</p>' });

    const cleared = await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ reservationInfoText: null });
    expect(cleared.body.data.reservationInfoText).toBeNull();

    const unrelatedUpdate = await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ primaryColor: '#abcdef' });
    expect(unrelatedUpdate.body.data.reservationInfoText).toBeNull();
  });

  it('sanitized content survives the round trip to the public endpoint', async () => {
    await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ reservationWarningText: '<p>No-shows may be charged.</p><script>evil()</script>' });

    const publicRes = await api.get(`/api/public/restaurant/${a.restaurant.slug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.customization.reservationWarningText).not.toContain('<script');
    expect(publicRes.body.data.customization.reservationWarningText).toContain('No-shows may be charged.');
  });

  // KVKK privacy notice (PROJECT_LOGIC.md §14): tenant-editable override rendered
  // via dangerouslySetInnerHTML on the public /r/[slug]/privacy page — needs the
  // exact same write-time sanitization as reservationInfoText/reservationWarningText.
  it('strips a <script> tag from privacyNoticeText and it survives the round trip to the public endpoint', async () => {
    const res = await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        privacyNoticeText: '<p>We keep your data for 1 year.</p><script>alert(document.cookie)</script><img src=x onerror="alert(1)">',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.privacyNoticeText).not.toContain('<script');
    expect(res.body.data.privacyNoticeText).not.toContain('onerror');
    expect(res.body.data.privacyNoticeText).toContain('We keep your data for 1 year.');

    const publicRes = await api.get(`/api/public/restaurant/${a.restaurant.slug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.customization.privacyNoticeText).not.toContain('<script');
    expect(publicRes.body.data.customization.privacyNoticeText).toContain('We keep your data for 1 year.');
  });
});
