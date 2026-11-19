const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
  parseS3Reference,
  persistApplicationUploads,
  streamStoredDocument
} = require('../services/privateStoreDocumentService');

const privateFile = (fieldname = 'businessRegistration') => ({
  fieldname,
  originalname: 'registration.pdf',
  mimetype: 'application/pdf',
  size: 4,
  buffer: Buffer.from('test')
});

test('private application files are encrypted in S3 and represented without a public URL', async () => {
  const commands = [];
  const file = privateFile();
  await persistApplicationUploads({ businessRegistration: [file] }, 'applicant-1', {
    s3: { bucket: 'private-documents', client: { send: async command => { commands.push(command); return {}; } } }
  });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].input.Bucket, 'private-documents');
  assert.equal(commands[0].input.ServerSideEncryption, 'AES256');
  assert.match(file.path, /^s3:\/\/private-documents\/store-applications\/applicant-1\/businessRegistration\//);
  assert.equal(file.secure_url, undefined);
  assert.equal(file.buffer, undefined);
});

test('the public store logo keeps using the public media uploader', async () => {
  const file = { ...privateFile('storeLogo'), originalname: 'store.jpg', mimetype: 'image/jpeg' };
  await persistApplicationUploads({ storeLogo: [file] }, 'applicant-1', {
    uploadPublicImage: async () => ({ secure_url: 'https://media.example/store.jpg', public_id: 'store' })
  });
  assert.equal(file.path, 'https://media.example/store.jpg');
  assert.equal(file.public_id, 'store');
});

test('private S3 references stream through the authenticated response with no-store caching', async () => {
  const body = new PassThrough();
  const chunks = [];
  const response = new PassThrough();
  response.setHeader = (name, value) => { response.headers = { ...(response.headers || {}), [name]: value }; };
  response.on('data', chunk => chunks.push(chunk));
  const done = new Promise(resolve => response.on('end', resolve));
  const result = streamStoredDocument('s3://private-documents/path/file.pdf', response, {
    client: { send: async () => ({ Body: body, ContentType: 'application/pdf', ContentDisposition: 'inline' }) },
    env: { AWS_REGION: 'ap-southeast-1' }
  });
  body.end('document');
  await result;
  await done;
  assert.equal(Buffer.concat(chunks).toString(), 'document');
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(parseS3Reference('s3://private-documents/path/file.pdf'), { bucket: 'private-documents', key: 'path/file.pdf' });
});

test('legacy document proxy rejects arbitrary external URLs', async () => {
  await assert.rejects(
    streamStoredDocument('https://attacker.invalid/private-file', { setHeader() {} }, { fetch: async () => { throw new Error('must not fetch'); } }),
    error => error.statusCode === 404
  );
});
