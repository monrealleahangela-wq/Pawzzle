# Store application document OCR

The store application can use AWS Textract Queries to suggest fields from JPG or PNG images of DTI/SEC registration certificates, Mayor's/business permits, Barangay clearances, and BIR Form 2303. OCR suggestions never bypass applicant review or Platform Admin verification. Low-confidence or invalid values are omitted, and BIR Form 2303 is not assigned an expiry date.

Required server configuration:

- `AWS_TEXTRACT_REGION`: optional dedicated processing-region override; defaults to `AWS_REGION`, then `AWS_DEFAULT_REGION`, then `ap-southeast-1`.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: required on Render unless the deployment has an AWS workload identity. Values are trimmed before use. Optional temporary credentials may also provide `AWS_SESSION_TOKEN`.
- `STORE_DOCUMENT_OCR_CONFIDENCE_THRESHOLD`: optional value from 70 through 100; defaults to `85`.

The IAM principal must allow `textract:AnalyzeDocument` in the configured region. Missing, incomplete, expired, or unauthorized credentials are reported with safe diagnostic codes in server logs; secrets are never returned or logged. Browser requests allow up to two minutes for cold starts and document processing, and applicants can retry a transient reading failure without selecting the file again.

The OCR endpoint accepts one single-page JPG or PNG up to 5 MB, keeps it in memory only for the request, validates its signature, sends it to Textract over the AWS SDK, and clears the local buffer before returning. It returns only mapped form fields and confidence scores, not the full OCR response or raw page text. The ordinary application document upload remains the system of record.

Applicants are told before selection that eligible images are sent to AWS Textract and must confirm or correct all suggested values. PDF and Word uploads remain supported for the application but do not invoke synchronous OCR.
