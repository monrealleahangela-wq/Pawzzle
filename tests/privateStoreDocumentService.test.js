const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
  cleanupPersistedUploads,
  decryptPrivateDocument,
  encryptPrivateDocument,
  parseEncryptedDatabaseReference,
  privateDocumentConfig,
  privateDocumentClientConfig,
  parseS3Reference,
  persistApplicationUploads,
  streamStoredDocument
} = require('../services/privateStoreDocumentService');

const encryptionEnv = {
  STORE_DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
};

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

test('S3 outages fall back to encrypted private database storage', async () => {
  const file = privateFile();
  const created = [];
  const fallbackErrors = [];
  await persistApplicationUploads({ businessRegistration: [file] }, '507f1f77bcf86cd799439011', {
    env: encryptionEnv,
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
    },
    createPrivateDocument: async values => {
      created.push(values);
      return { _id: '507f1f77bcf86cd799439012' };
    },
    onFallback: error => fallbackErrors.push(error)
  });
  assert.equal(created.length, 1);
  assert.notEqual(created[0].encryptedContent.toString(), 'test');
  assert.equal(created[0].mimeType, 'application/pdf');
  assert.equal(file.path, 'mongo-encrypted://507f1f77bcf86cd799439012');
  assert.equal(file.secure_url, undefined);
  assert.equal(file.buffer, undefined);
  assert.equal(fallbackErrors[0].code, 'STORE_DOCUMENT_STORAGE_UNAVAILABLE');
});

test('missing S3 configuration does not block an application when encrypted fallback is available', async () => {
  const file = privateFile();
  await persistApplicationUploads({ businessRegistration: [file] }, '507f1f77bcf86cd799439011', {
    env: encryptionEnv,
    createPrivateDocument: async values => {
      assert.equal(values.owner, '507f1f77bcf86cd799439011');
      assert.ok(values.encryptedContent.length);
      return { _id: '507f1f77bcf86cd799439013' };
    }
  });
  assert.equal(file.path, 'mongo-encrypted://507f1f77bcf86cd799439013');
});

test('database fallback content is encrypted with authenticated encryption', () => {
  const encrypted = encryptPrivateDocument(Buffer.from('private-document'), encryptionEnv);
  assert.notEqual(encrypted.encryptedContent.toString(), 'private-document');
  assert.equal(decryptPrivateDocument(encrypted, encryptionEnv).toString(), 'private-document');
  assert.deepEqual(
    parseEncryptedDatabaseReference('mongo-encrypted://507f1f77bcf86cd799439012'),
    { id: '507f1f77bcf86cd799439012' }
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

test('encrypted database documents stream only through the authenticated response', async () => {
  const encrypted = encryptPrivateDocument(Buffer.from('fallback-document'), encryptionEnv);
  const chunks = [];
  const response = new PassThrough();
  response.setHeader = (name, value) => { response.headers = { ...(response.headers || {}), [name]: value }; };
  response.on('data', chunk => chunks.push(chunk));
  const done = new Promise(resolve => response.on('end', resolve));
  await streamStoredDocument('mongo-encrypted://507f1f77bcf86cd799439012', response, {
    env: encryptionEnv,
    readPrivateDocument: async () => ({
      ...encrypted,
      mimeType: 'application/pdf',
      originalName: 'permit.pdf'
    })
  });
  await done;
  assert.equal(Buffer.concat(chunks).toString(), 'fallback-document');
  assert.equal(response.headers['Content-Type'], 'application/pdf');
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
});

test('cleanup removes encrypted database fallback records', async () => {
  const deleted = [];
  await cleanupPersistedUploads({ businessRegistration: [{
    path: 'mongo-encrypted://507f1f77bcf86cd799439012'
  }] }, {
    deletePrivateDocument: async id => deleted.push(id)
  });
  assert.deepEqual(deleted, ['507f1f77bcf86cd799439012']);
});

test('legacy document proxy rejects arbitrary external URLs', async () => {
  await assert.rejects(
    streamStoredDocument('https://attacker.invalid/private-file', { setHeader() {} }, { fetch: async () => { throw new Error('must not fetch'); } }),
    error => error.statusCode === 404
  );
});
