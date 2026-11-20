const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
  privateDocumentConfig,
  privateDocumentClientConfig,
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

test('store documents can use a bucket region separate from other AWS services', () => {
  const env = {
    AWS_REGION: 'ap-southeast-1',
    AWS_STORE_DOCUMENTS_REGION: 'ap-southeast-2',
    AWS_STORE_DOCUMENTS_BUCKET: 'private-documents'
  };
  assert.deepEqual(privateDocumentConfig(env), {
    region: 'ap-southeast-2',
    bucket: 'private-documents'
  });
  assert.deepEqual(privateDocumentClientConfig(env), {
    region: 'ap-southeast-2',
    followRegionRedirects: true
  });
});

test('bucket-region redirects are returned as a retryable user-safe storage error', async () => {
  const file = privateFile();
  await assert.rejects(
    persistApplicationUploads({ businessRegistration: [file] }, 'applicant-1', {
      s3: {
        bucket: 'private-documents',
        client: {
          send: async () => {
            const error = new Error('The bucket is in another region');
            error.name = 'PermanentRedirect';
            error.$metadata = { httpStatusCode: 301 };
            throw error;
          }
        }
      }
    }),
    error => error.statusCode === 503
      && error.code === 'STORE_DOCUMENT_STORAGE_UNAVAILABLE'
      && !error.message.includes('bucket')
  );
});

test('private document permission failures do not leak provider details', async () => {
  const file = privateFile();
  await assert.rejects(
    persistApplicationUploads({ businessRegistration: [file] }, 'applicant-1', {
      s3: {
        bucket: 'private-documents',
        client: {
          send: async () => {
            const error = new Error('not authorized for s3:PutObject');
            error.name = 'AccessDenied';
            error.$metadata = { httpStatusCode: 403 };
            throw error;
          }
        }
      }
    }),
    error => error.statusCode === 503
      && error.code === 'STORE_DOCUMENT_STORAGE_UNAVAILABLE'
      && !error.message.includes('s3:PutObject')
  );
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
