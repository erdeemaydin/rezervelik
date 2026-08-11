import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageProvider } from '../../src/services/storage/S3Provider';
import { LocalDiskStorageProvider } from '../../src/services/storage/LocalDiskProvider';
import fs from 'fs';
import path from 'path';

const s3Mock = mockClient(S3Client);

describe('S3StorageProvider', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    s3Mock.reset();
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_PUBLIC_URL_BASE = 'https://cdn.example.com/';
    process.env.S3_ENDPOINT = 'https://s3.example-provider.com';
    process.env.S3_REGION = 'auto';
    process.env.S3_ACCESS_KEY_ID = 'test-access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.S3_ACL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws a clear error when S3_BUCKET is missing', () => {
    delete process.env.S3_BUCKET;
    expect(() => new S3StorageProvider()).toThrow(/S3_BUCKET/);
  });

  it('throws a clear error when S3_PUBLIC_URL_BASE is missing', () => {
    delete process.env.S3_PUBLIC_URL_BASE;
    expect(() => new S3StorageProvider()).toThrow(/S3_PUBLIC_URL_BASE/);
  });

  it('uploads the buffer with the right bucket/content-type and tenant-namespaced key', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const provider = new S3StorageProvider();
    const restaurantId = 'rest-123';
    const result = await provider.uploadFile({
      buffer: Buffer.from('fake-image-bytes'),
      originalName: 'logo.png',
      mimeType: 'image/png',
      restaurantId,
    });

    expect(s3Mock.calls()).toHaveLength(1);
    const call = s3Mock.call(0);
    const input = call.args[0].input as any;

    expect(input.Bucket).toBe('test-bucket');
    expect(input.ContentType).toBe('image/png');
    expect(input.Body).toBeInstanceOf(Buffer);
    expect((input.Body as Buffer).toString()).toBe('fake-image-bytes');

    // Key is namespaced by tenant and preserves the original extension.
    expect(input.Key).toMatch(new RegExp(`^uploads/${restaurantId}/.+\\.png$`));
    expect(result.key).toBe(input.Key);

    // Returned URL is built from the configured public base + the key.
    expect(result.url).toBe(`https://cdn.example.com/${input.Key}`);
  });

  it('never lets two uploads collide on the same key', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const provider = new S3StorageProvider();
    const input = { buffer: Buffer.from('a'), originalName: 'a.jpg', mimeType: 'image/jpeg', restaurantId: 'r1' };

    const [r1, r2] = await Promise.all([provider.uploadFile(input), provider.uploadFile(input)]);
    expect(r1.key).not.toBe(r2.key);
  });

  it('omits ACL by default (some S3-compatible stores reject the param)', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const provider = new S3StorageProvider();
    await provider.uploadFile({ buffer: Buffer.from('a'), originalName: 'a.jpg', mimeType: 'image/jpeg', restaurantId: 'r1' });

    const input = s3Mock.call(0).args[0].input as any;
    expect(input.ACL).toBeUndefined();
  });

  it('passes S3_ACL through when explicitly configured', async () => {
    process.env.S3_ACL = 'public-read';
    s3Mock.on(PutObjectCommand).resolves({});
    const provider = new S3StorageProvider();
    await provider.uploadFile({ buffer: Buffer.from('a'), originalName: 'a.jpg', mimeType: 'image/jpeg', restaurantId: 'r1' });

    const input = s3Mock.call(0).args[0].input as any;
    expect(input.ACL).toBe('public-read');
  });
});

describe('LocalDiskStorageProvider', () => {
  const uploadRoot = path.join(process.cwd(), 'public', 'uploads');
  const restaurantId = `local-test-${Date.now()}`;

  afterEach(() => {
    fs.rmSync(path.join(uploadRoot, restaurantId), { recursive: true, force: true });
  });

  it('writes the file under a tenant-namespaced directory and returns a matching URL', async () => {
    const provider = new LocalDiskStorageProvider();
    const result = await provider.uploadFile({
      buffer: Buffer.from('hello'),
      originalName: 'photo.jpeg',
      mimeType: 'image/jpeg',
      restaurantId,
      requestBaseUrl: 'http://localhost:3081',
    });

    expect(result.key).toMatch(new RegExp(`^${restaurantId}/.+\\.jpeg$`));
    expect(result.url).toBe(`http://localhost:3081/uploads/${result.key}`);

    const written = fs.readFileSync(path.join(uploadRoot, ...result.key.split('/')));
    expect(written.toString()).toBe('hello');
  });

  it('prefers API_PUBLIC_URL over the request origin when set', async () => {
    process.env.API_PUBLIC_URL = 'https://api.prod.example.com';
    try {
      const provider = new LocalDiskStorageProvider();
      const result = await provider.uploadFile({
        buffer: Buffer.from('x'),
        originalName: 'x.png',
        mimeType: 'image/png',
        restaurantId,
        requestBaseUrl: 'http://localhost:3081',
      });
      expect(result.url).toBe(`https://api.prod.example.com/uploads/${result.key}`);
    } finally {
      delete process.env.API_PUBLIC_URL;
    }
  });
});
