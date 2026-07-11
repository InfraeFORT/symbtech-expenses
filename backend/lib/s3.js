// lib/s3.js — stockage des justificatifs sur S3 (bucket dédié, préfixe expenses/).
const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const region = process.env.AWS_REGION || 'eu-west-3';
const Bucket = process.env.AWS_S3_BUCKET;
const PREFIX = process.env.S3_PREFIX || 'expenses/';

// Credentials lus automatiquement dans AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
const s3 = new S3Client({ region });

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

function assertConfigured() {
  if (!Bucket) throw new Error('AWS_S3_BUCKET absent (.env)');
}

// Clé : expenses/AAAA/MM/<uuid>.<ext>
function buildKey(mime) {
  const now = new Date();
  const ext = EXT_BY_MIME[mime] || 'bin';
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${PREFIX}${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;
}

async function uploadBuffer(buffer, mime) {
  assertConfigured();
  const Key = buildKey(mime);
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: buffer, ContentType: mime }));
  return Key;
}

async function deleteKey(Key) {
  assertConfigured();
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
}

// URL temporaire (lecture) pour afficher un justificatif privé. Défaut : 1h.
async function presignGet(Key, expiresIn = 3600) {
  assertConfigured();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn });
}

module.exports = { uploadBuffer, deleteKey, presignGet, GetObjectCommand, s3, Bucket };
