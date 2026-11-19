const { AnalyzeDocumentCommand, TextractClient } = require('@aws-sdk/client-textract');
const { isGovernmentIdType } = require('../config/governmentIds');
const { matchesImageSignature } = require('./identityVerification');

const GOVERNMENT_ID_LABELS = Object.freeze({
  philsys_id: 'PhilSys ID / National ID',
  passport: 'Philippine passport',
  drivers_license: "Driver's license",
  umid: 'UMID',
  sss_id: 'SSS ID',
  gsis_id: 'GSIS ID',
  prc_id: 'PRC ID',
  voters_id: "Voter's ID",
  postal_id: 'Postal ID',
  philhealth_id: 'PhilHealth ID',
  senior_citizen_id: 'Senior citizen ID',
  pwd_id: 'PWD ID',
  nbi_clearance: 'NBI clearance',
  police_clearance: 'Police clearance',
  other_government_id: 'Other government-issued ID'
});

const DOCUMENT_SIGNATURES = Object.freeze([
  ['passport', [/\bPASSPORT\b/, /\bP<PHL[A-Z<]+/]],
  ['philsys_id', [/PHILIPPINE IDENTIFICATION (?:CARD|SYSTEM)/, /PAMBANSANG PAGKAKAKILANLAN/, /\bPHILSYS\b/]],
  ['drivers_license', [/DRIVER'?S LICENSE/, /LAND TRANSPORTATION OFFICE/]],
  ['umid', [/UNIFIED MULTI[ -]?PURPOSE ID/, /\bUMID\b/]],
  ['gsis_id', [/GOVERNMENT SERVICE INSURANCE SYSTEM/, /\bGSIS\b/]],
  ['sss_id', [/SOCIAL SECURITY SYSTEM/, /\bSSS(?: ID)?\b/]],
  ['prc_id', [/PROFESSIONAL REGULATION COMMISSION/, /PROFESSIONAL IDENTIFICATION CARD/, /\bPRC ID\b/]],
  ['voters_id', [/VOTER'?S IDENTIFICATION/, /COMMISSION ON ELECTIONS/, /\bCOMELEC\b/]],
  ['postal_id', [/POSTAL ID/, /PHILIPPINE POSTAL CORPORATION/, /\bPHLPOST\b/]],
  ['philhealth_id', [/\bPHILHEALTH\b/, /PHILIPPINE HEALTH INSURANCE CORPORATION/]],
  ['senior_citizen_id', [/SENIOR CITIZEN (?:IDENTIFICATION|ID)/, /OFFICE FOR SENIOR CITIZENS AFFAIRS/, /\bOSCA\b/]],
  ['pwd_id', [/PERSONS? WITH DISABILIT(?:Y|IES)/, /\bPWD ID\b/]],
  ['nbi_clearance', [/NATIONAL BUREAU OF INVESTIGATION/, /NBI CLEARANCE/]],
  ['police_clearance', [/POLICE CLEARANCE/, /NATIONAL POLICE CLEARANCE/]]
]);

const FIELD_QUERIES = Object.freeze([
  ['firstName', "What is the holder's first or given name?"],
  ['middleName', "What is the holder's middle name?"],
  ['lastName', "What is the holder's surname or family name?"],
  ['fullName', "What is the holder's complete name?"],
  ['documentNumber', 'What is the ID, passport, license, or document number?'],
  ['dateOfBirth', "What is the holder's date of birth?"],
  ['expirationDate', 'What is the expiration or validity end date?'],
  ['street', "What is the house number and street in the holder's address?"],
  ['barangay', "What is the barangay in the holder's address?"],
  ['city', "What is the city or municipality in the holder's address?"],
  ['province', "What is the province in the holder's address?"],
  ['zipCode', "What is the postal or ZIP code in the holder's address?"]
]);

const idError = (message, code, statusCode = 422) => Object.assign(new Error(message), { code, statusCode });
const normalizeText = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const pad = value => String(value).padStart(2, '0');

const normalizeDate = value => {
  const text = normalizeText(value).replace(/,/g, '');
  let match = text.match(/\b(19\d{2}|20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  let year;
  let month;
  let day;
  if (match) [, year, month, day] = match;
  if (!match) {
    match = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](19\d{2}|20\d{2})\b/);
    if (match) [, month, day, year] = match;
  }
  if (!match) {
    match = text.match(/\b(\d{1,2})\s+(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+(19\d{2}|20\d{2})\b/i);
    if (match) {
      day = match[1];
      year = match[3];
      month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(match[2].slice(0, 3).toUpperCase()) + 1;
    }
  }
  if (!match) return '';
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return '';
  return `${year}-${pad(month)}-${pad(day)}`;
};

const queryResultsByAlias = blocks => {
  const byId = new Map((blocks || []).map(block => [block.Id, block]));
  const results = new Map();
  for (const block of blocks || []) {
    if (block.BlockType !== 'QUERY' || !block.Query?.Alias) continue;
    const answerIds = (block.Relationships || [])
      .filter(relationship => relationship.Type === 'ANSWER')
      .flatMap(relationship => relationship.Ids || []);
    const answer = answerIds.map(id => byId.get(id)).find(candidate => candidate?.BlockType === 'QUERY_RESULT');
    if (answer?.Text) results.set(block.Query.Alias, answer);
  }
  return results;
};

const documentText = blocks => (blocks || [])
  .filter(block => block.BlockType === 'LINE' && Number(block.Confidence || 0) >= 55)
  .map(block => normalizeText(block.Text).toUpperCase())
  .filter(Boolean)
  .join('\n');

const detectGovernmentIdType = text => {
  const corpus = normalizeText(text).toUpperCase();
  if (!corpus) return null;
  let best = null;
  let bestScore = 0;
  for (const [type, signatures] of DOCUMENT_SIGNATURES) {
    const score = signatures.reduce((total, signature) => total + (signature.test(corpus) ? 1 : 0), 0);
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  if (best) return best;
  const looksGovernmentIssued = /REPUBLIC OF THE PHILIPPINES|GOVERNMENT OF THE PHILIPPINES/.test(corpus)
    && /IDENTIFICATION|IDENTITY|\bID\b|CLEARANCE|LICENSE/.test(corpus);
  return looksGovernmentIssued ? 'other_government_id' : null;
};

const cleanField = (alias, value) => {
  const text = normalizeText(value);
  if (!text) return '';
  if (alias === 'zipCode') return (text.match(/\b\d{4}\b/) || [])[0] || '';
  if (alias === 'dateOfBirth' || alias === 'expirationDate') return normalizeDate(text) || text.slice(0, 100);
  return text.slice(0, alias === 'street' ? 200 : 100);
};

const createClient = () => {
  const region = process.env.AWS_TEXTRACT_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) throw idError('Secure ID reading is temporarily unavailable.', 'GOVERNMENT_ID_READING_NOT_CONFIGURED', 503);
  const configuredAttempts = Number.parseInt(process.env.AWS_TEXTRACT_MAX_ATTEMPTS || '', 10);
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.min(6, Math.max(2, configuredAttempts))
    : 5;
  return new TextractClient({ region, maxAttempts });
};

const providerErrorName = error => error?.name || error?.Code || error?.code || 'UnknownProviderError';

const providerErrorDetails = (error, stage) => ({
  stage,
  name: providerErrorName(error),
  httpStatusCode: error?.$metadata?.httpStatusCode,
  requestId: error?.$metadata?.requestId,
  attempts: error?.$metadata?.attempts,
  totalRetryDelay: error?.$metadata?.totalRetryDelay
});

const logProviderError = (error, stage, logger = console) => {
  if (typeof logger?.error !== 'function') return;
  logger.error('Government ID OCR provider request failed', providerErrorDetails(error, stage));
};

const NON_FALLBACK_PROVIDER_ERRORS = new Set([
  'AccessDeniedException',
  'BadDocumentException',
  'CredentialsProviderError',
  'DocumentTooLargeException',
  'ExpiredTokenException',
  'InvalidClientTokenId',
  'InvalidSignatureException',
  'SignatureDoesNotMatch',
  'UnrecognizedClientException',
  'UnsupportedDocumentException'
]);

const shouldTryFormsFallback = error => !NON_FALLBACK_PROVIDER_ERRORS.has(providerErrorName(error));

const mapProviderError = error => {
  if (['BadDocumentException', 'UnsupportedDocumentException', 'DocumentTooLargeException', 'InvalidParameterException'].includes(error?.name)) {
    return idError('Use a clear, uncropped JPG or PNG image of the front of your ID.', 'GOVERNMENT_ID_UNREADABLE');
  }
  return idError('Secure ID reading is temporarily unavailable. Please try again.', 'GOVERNMENT_ID_READING_UNAVAILABLE', 503);
};

const extractGovernmentId = async ({ selectedType, buffer, mimeType }, options = {}) => {
  if (!isGovernmentIdType(selectedType)) throw idError('Select a valid government ID type.', 'GOVERNMENT_ID_TYPE_REQUIRED', 400);
  if (!matchesImageSignature(buffer, mimeType)) throw idError('Choose a valid JPG or PNG government ID image.', 'GOVERNMENT_ID_IMAGE_INVALID', 400);

  const client = options.client || createClient();
  const logger = options.logger || console;
  let response;
  try {
    response = await client.send(new AnalyzeDocumentCommand({
      Document: { Bytes: buffer },
      FeatureTypes: ['QUERIES'],
      QueriesConfig: { Queries: FIELD_QUERIES.map(([Alias, Text]) => ({ Alias, Text })) }
    }));
  } catch (error) {
    if (error?.statusCode && error?.code) throw error;
    logProviderError(error, 'queries', logger);
    if (!shouldTryFormsFallback(error)) throw mapProviderError(error);
    try {
      response = await client.send(new AnalyzeDocumentCommand({
        Document: { Bytes: buffer },
        FeatureTypes: ['FORMS']
      }));
    } catch (fallbackError) {
      if (fallbackError?.statusCode && fallbackError?.code) throw fallbackError;
      logProviderError(fallbackError, 'forms-fallback', logger);
      throw mapProviderError(fallbackError);
    }
  }

  const detectedType = detectGovernmentIdType(documentText(response.Blocks));
  if (!detectedType) {
    throw idError('The ID type could not be confirmed. Upload a clearer image showing the full document.', 'GOVERNMENT_ID_TYPE_UNREADABLE');
  }
  if (detectedType !== selectedType) {
    throw idError(
      `The attached image appears to be ${GOVERNMENT_ID_LABELS[detectedType]}. Select that ID type or upload ${GOVERNMENT_ID_LABELS[selectedType]}.`,
      'GOVERNMENT_ID_TYPE_MISMATCH'
    );
  }

  const answers = queryResultsByAlias(response.Blocks);
  const fields = {};
  for (const [alias] of FIELD_QUERIES) {
    const answer = answers.get(alias);
    if (!answer || Number(answer.Confidence || 0) < 70) continue;
    const value = cleanField(alias, answer.Text);
    if (value) fields[alias] = value;
  }
  const expirationDate = normalizeDate(fields.expirationDate);
  const today = options.now instanceof Date ? options.now : new Date();
  const todayIso = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
  if (expirationDate && expirationDate < todayIso) {
    throw idError('This government ID appears to be expired. Upload a valid, unexpired ID.', 'GOVERNMENT_ID_EXPIRED');
  }
  return { detectedType, detectedTypeLabel: GOVERNMENT_ID_LABELS[detectedType], fields };
};

module.exports = {
  GOVERNMENT_ID_LABELS,
  FIELD_QUERIES,
  queryResultsByAlias,
  normalizeDate,
  documentText,
  detectGovernmentIdType,
  extractGovernmentId
};
