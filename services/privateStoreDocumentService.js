const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');
const multer = require('multer');
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { cloudinary } = require('../middleware/upload');
const PrivateStoreDocument = require('../models/PrivateStoreDocument');

const PUBLIC_IMAGE_FIELDS = new Set(['storeLogo']);
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const ENCRYPTED_DATABASE_SCHEME = 'mongo-encrypted';

const safeSegment = value => String(value || 'file')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100) || 'file';

const privateDocumentConfig = env => ({
  region: env.AWS_STORE_DOCUMENTS_REGION || env.AWS_REGION || env.AWS_DEFAULT_REGION,
  bucket: env.AWS_STORE_DOCUMENTS_BUCKET
});

const privateDocumentClientConfig = env => ({
  region: privateDocumentConfig(env).region,
  // S3 buckets are tied to a region. Following the bucket's signed redirect
  // keeps uploads working when Textract/Rekognition use a different region.
  followRegionRedirects: true,
  // A broken or unreachable bucket must yield quickly to encrypted database
  // storage instead of outlasting the browser's multipart request.
  maxAttempts: 1,
  requestHandler: new NodeHttpHandler({ connectionTimeout: 8000, requestTimeout: 20000 })
});

const STORE_DOCUMENT_ERROR_NAMES = new Set([
  'AccessDenied',
  'AuthorizationHeaderMalformed',
  'CredentialsProviderError',
  'ExpiredToken',
  'IncorrectEndpoint',
  'InvalidAccessKeyId',
  'InvalidClientTokenId',
  'NoSuchBucket',
  'PermanentRedirect',
  'SignatureDoesNotMatch',
  'TokenRefreshRequired'
]);

const normalizeStoreDocumentError = error => {
  if (!error || error.statusCode) return error;
  const statusCode = Number(error?.$metadata?.httpStatusCode || error?.status || 0);
  const name = String(error.name || error.Code || error.code || '');
  const isServiceFailure = STORE_DOCUMENT_ERROR_NAMES.has(name)
    || statusCode === 429
    || statusCode >= 500
    || ['ECONNRESET', 'ENETUNREACH', 'ETIMEDOUT'].includes(String(error.code || ''));
  if (!isServiceFailure) return error;

  const normalized = new Error(
    'Secure document storage is temporarily unavailable. Your application was not submitted. Please try again shortly or contact Pawzzle support.'
  );
  normalized.name = 'StoreDocumentStorageError';
  normalized.statusCode = 503;
  normalized.code = 'STORE_DOCUMENT_STORAGE_UNAVAILABLE';
  normalized.cause = error;
  return normalized;
};

const createS3Client = (env = process.env) => {
  const { region, bucket } = privateDocumentConfig(env);
  if (!region || !bucket) {
    const error = new Error('Private application document storage is not configured.');
    error.statusCode = 503;
    error.code = 'STORE_DOCUMENT_STORAGE_NOT_CONFIGURED';
    throw error;
  }
  return { client: new S3Client(privateDocumentClientConfig(env)), bucket };
};

const uploadPublicImage = file => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({
    folder: 'pawzzle/store-applications/public',
    resource_type: 'image',
    overwrite: false
  }, (error, result) => error ? reject(error) : resolve(result));
  stream.end(file.buffer);
});

const storeDocumentEncryptionKey = (env = process.env) => {
  const configured = String(
    env.STORE_DOCUMENT_ENCRYPTION_KEY
      || env.IDENTITY_DOCUMENT_ENCRYPTION_KEY
      || env.GOVERNMENT_ID_ENCRYPTION_KEY
      || ''
  ).trim();
  let key = null;
  if (/^[a-f0-9]{64}$/i.test(configured)) key = Buffer.from(configured, 'hex');
  else if (configured) {
    try { key = Buffer.from(configured, 'base64'); } catch (_) { key = null; }
  }
  if (!key || key.length !== 32) {
    const error = new Error('Private application document protection is not configured.');
    error.statusCode = 503;
    error.code = 'STORE_DOCUMENT_ENCRYPTION_NOT_CONFIGURED';
    throw error;
  }
  return key;
};

const encryptedDatabaseReference = id => `${ENCRYPTED_DATABASE_SCHEME}://${String(id)}`;

const parseEncryptedDatabaseReference = reference => {
  const match = String(reference || '').match(/^mongo-encrypted:\/\/([a-f0-9]{24})$/i);
  return match ? { id: match[1] } : null;
};

const encryptPrivateDocument = (buffer, env = process.env) => {
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', storeDocumentEncryptionKey(env), initializationVector);
  const encryptedContent = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { encryptedContent, initializationVector, authenticationTag: cipher.getAuthTag() };
};

const decryptPrivateDocument = (record, env = process.env) => {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    storeDocumentEncryptionKey(env),
    Buffer.from(record.initializationVector)
  );
  decipher.setAuthTag(Buffer.from(record.authenticationTag));
  return Buffer.concat([decipher.update(Buffer.from(record.encryptedContent)), decipher.final()]);
};

const persistEncryptedDatabaseDocument = async (file, applicantId, options = {}) => {
  const encrypted = encryptPrivateDocument(file.buffer, options.env || process.env);
  const createDocument = options.createPrivateDocument || (values => PrivateStoreDocument.create(values));
  const record = await createDocument({
    owner: applicantId,
    originalName: safeSegment(file.originalname),
    mimeType: file.mimetype,
    size: file.size,
    ...encrypted
  });
  if (!record?._id) throw new Error('Encrypted document record was not created.');
  return record;
};

const storageUnavailableError = cause => {
  const error = new Error(
    'Secure document storage is temporarily unavailable. Your application was not submitted. Please try again shortly or contact Pawzzle support.'
  );
  error.name = 'StoreDocumentStorageError';
  error.statusCode = 503;
  error.code = 'STORE_DOCUMENT_STORAGE_UNAVAILABLE';
  error.cause = cause;
  return error;
};

const persistApplicationUploads = async (files = {}, applicantId, options = {}) => {
  const entries = Object.values(files).flat();
  const privateFiles = entries.filter(file => !PUBLIC_IMAGE_FIELDS.has(file.fieldname));
  let s3 = options.s3 || null;
  let s3Available = Boolean(privateFiles.length);
  const uploadedKeys = [];
  const databaseDocumentIds = [];
  try {
    if (privateFiles.length && !s3) {
      try {
        s3 = createS3Client(options.env);
      } catch (error) {
        const normalized = normalizeStoreDocumentError(error);
        if (normalized?.statusCode !== 503) throw normalized;
        s3Available = false;
        options.onFallback?.(normalized);
      }
    }
    for (const file of entries) {
      if (PUBLIC_IMAGE_FIELDS.has(file.fieldname)) {
        const result = await (options.uploadPublicImage || uploadPublicImage)(file);
        file.path = result.secure_url;
        file.secure_url = result.secure_url;
        file.public_id = result.public_id;
        delete file.buffer;
        continue;
      }
      const extension = path.extname(file.originalname || '').toLowerCase();
      const key = [
        'store-applications',
        safeSegment(applicantId),
        safeSegment(file.fieldname),
        `${Date.now()}-${crypto.randomUUID()}${extension}`
      ].join('/');
      if (s3Available) {
        try {
          await s3.client.send(new PutObjectCommand({
            Bucket: s3.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            ContentLength: file.size,
            ContentDisposition: `attachment; filename="${safeSegment(file.originalname)}"`,
            ServerSideEncryption: 'AES256',
            Metadata: {
              applicant: safeSegment(applicantId),
              field: safeSegment(file.fieldname)
            }
          }));
          uploadedKeys.push(key);
          file.path = `s3://${s3.bucket}/${key}`;
          file.secure_url = undefined;
          file.storageKey = key;
        } catch (error) {
          const normalized = normalizeStoreDocumentError(error);
          if (normalized?.statusCode !== 503) throw normalized;
          s3Available = false;
          options.onFallback?.(normalized);
        }
      }
      if (!s3Available) {
        let record;
        try {
          record = await persistEncryptedDatabaseDocument(file, applicantId, options);
        } catch (error) {
          throw storageUnavailableError(error);
        }
        const id = String(record._id);
        databaseDocumentIds.push(id);
        file.path = encryptedDatabaseReference(id);
        file.secure_url = undefined;
        file.storageDocumentId = id;
      }
      delete file.buffer;
    }
    return files;
  } catch (error) {
    if (s3) await Promise.allSettled(uploadedKeys.map(Key => s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key }))));
    const deleteDocument = options.deletePrivateDocument || (id => PrivateStoreDocument.deleteOne({ _id: id }));
    await Promise.allSettled(databaseDocumentIds.map(id => deleteDocument(id)));
    throw normalizeStoreDocumentError(error);
  }
};

const cleanupPersistedUploads = async (files = {}, options = {}) => {
  const entries = Object.values(files).flat();
  const tasks = [];
  for (const file of entries) {
    const parsed = parseS3Reference(file.path);
    const databaseDocument = parseEncryptedDatabaseReference(file.path);
    if (parsed) {
      const client = options.client || new S3Client(privateDocumentClientConfig(options.env || process.env));
      tasks.push(client.send(new DeleteObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })));
    } else if (databaseDocument) {
      const deleteDocument = options.deletePrivateDocument || (id => PrivateStoreDocument.deleteOne({ _id: id }));
      tasks.push(deleteDocument(databaseDocument.id));
    } else if (file.public_id) {
      tasks.push((options.destroyPublicImage || cloudinary.uploader.destroy)(file.public_id));
    }
  }
  await Promise.allSettled(tasks);
};

const parseS3Reference = reference => {
  const match = String(reference || '').match(/^s3:\/\/([^/]+)\/(.+)$/);
  return match ? { bucket: match[1], key: match[2] } : null;
};

const streamStoredDocument = async (reference, res, options = {}) => {
  const parsed = parseS3Reference(reference);
  if (parsed) {
    const client = options.client || new S3Client(privateDocumentClientConfig(options.env || process.env));
    const object = await client.send(new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', object.ContentDisposition || 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    object.Body.pipe(res);
    return;
  }
  const databaseDocument = parseEncryptedDatabaseReference(reference);
  if (databaseDocument) {
    const readDocument = options.readPrivateDocument || (id => (
      PrivateStoreDocument.findById(id)
        .select('+encryptedContent +initializationVector +authenticationTag')
        .lean()
    ));
    const record = await readDocument(databaseDocument.id);
    if (!record) {
      const error = new Error('Stored document is unavailable.');
      error.statusCode = 404;
      throw error;
    }
    const content = decryptPrivateDocument(record, options.env || process.env);
    res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeSegment(record.originalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    Readable.from(content).pipe(res);
    return;
  }
  let legacyUrl;
  try {
    legacyUrl = new URL(String(reference || ''));
  } catch (_) {
    legacyUrl = null;
  }
  // Older applications can still point at Pawzzle's Cloudinary account. Do
  // not turn this authenticated proxy into a general-purpose URL fetcher.
  if (!legacyUrl || legacyUrl.protocol !== 'https:' || legacyUrl.hostname !== 'res.cloudinary.com') {
    const error = new Error('Stored document reference is invalid.');
    error.statusCode = 404;
    throw error;
  }
  const response = await (options.fetch || fetch)(legacyUrl.toString());
  if (!response.ok || !response.body) {
    const error = new Error('Stored document is unavailable.');
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }
  res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  Readable.fromWeb(response.body).pipe(res);
};

const storeApplicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 40 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (PUBLIC_IMAGE_FIELDS.has(file.fieldname) && !String(file.mimetype || '').toLowerCase().startsWith('image/')) {
      const error = new Error('The store logo must be a JPG, JPEG, or PNG image.');
      error.statusCode = 400;
      return callback(error);
    }
    if (!ALLOWED_TYPES.has(String(file.mimetype || '').toLowerCase()) || !ALLOWED_EXTENSIONS.has(extension)) {
      const error = new Error('Upload a PDF, JPG, JPEG, or PNG file up to 10 MB.');
      error.statusCode = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

module.exports = {
  PUBLIC_IMAGE_FIELDS,
  privateDocumentConfig,
  privateDocumentClientConfig,
  createS3Client,
  cleanupPersistedUploads,
  decryptPrivateDocument,
  encryptedDatabaseReference,
  encryptPrivateDocument,
  normalizeStoreDocumentError,
  parseEncryptedDatabaseReference,
  persistApplicationUploads,
  parseS3Reference,
  streamStoredDocument,
  storeApplicationUpload
};
