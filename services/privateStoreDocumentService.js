const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');
const multer = require('multer');
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { cloudinary } = require('../middleware/upload');

const PUBLIC_IMAGE_FIELDS = new Set(['storeLogo']);
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

const safeSegment = value => String(value || 'file')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100) || 'file';

const privateDocumentConfig = env => ({
  region: env.AWS_REGION || env.AWS_DEFAULT_REGION,
  bucket: env.AWS_STORE_DOCUMENTS_BUCKET
});

const createS3Client = (env = process.env) => {
  const { region, bucket } = privateDocumentConfig(env);
  if (!region || !bucket) {
    const error = new Error('Private application document storage is not configured.');
    error.statusCode = 503;
    error.code = 'STORE_DOCUMENT_STORAGE_NOT_CONFIGURED';
    throw error;
  }
  return { client: new S3Client({ region }), bucket };
};

const uploadPublicImage = file => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({
    folder: 'pawzzle/store-applications/public',
    resource_type: 'image',
    overwrite: false
  }, (error, result) => error ? reject(error) : resolve(result));
  stream.end(file.buffer);
});

const persistApplicationUploads = async (files = {}, applicantId, options = {}) => {
  const entries = Object.values(files).flat();
  const privateFiles = entries.filter(file => !PUBLIC_IMAGE_FIELDS.has(file.fieldname));
  const s3 = privateFiles.length ? (options.s3 || createS3Client(options.env)) : null;
  const uploadedKeys = [];
  try {
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
      delete file.buffer;
    }
    return files;
  } catch (error) {
    if (s3) await Promise.allSettled(uploadedKeys.map(Key => s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key }))));
    throw error;
  }
};

const cleanupPersistedUploads = async (files = {}, options = {}) => {
  const entries = Object.values(files).flat();
  const tasks = [];
  for (const file of entries) {
    const parsed = parseS3Reference(file.path);
    if (parsed) {
      const client = options.client || new S3Client({ region: options.env?.AWS_REGION || options.env?.AWS_DEFAULT_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION });
      tasks.push(client.send(new DeleteObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })));
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
    const region = options.env?.AWS_REGION || options.env?.AWS_DEFAULT_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    const client = options.client || new S3Client({ region });
    const object = await client.send(new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', object.ContentDisposition || 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    object.Body.pipe(res);
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
  createS3Client,
  cleanupPersistedUploads,
  persistApplicationUploads,
  parseS3Reference,
  streamStoredDocument,
  storeApplicationUpload
};
