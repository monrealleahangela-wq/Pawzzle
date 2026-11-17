# Store application document OCR

The store application can use AWS Textract Queries to suggest fields from JPG or PNG images of DTI/SEC registration certificates, Mayor's/business permits, Barangay clearances, and BIR Form 2303. OCR suggestions never bypass applicant review or Platform Admin verification. Low-confidence or invalid values are omitted, and BIR Form 2303 is not assigned an expiry date.

Required server configuration:

- `AWS_REGION` (or `AWS_DEFAULT_REGION`): the Textract processing region.
- AWS workload credentials granting only `textract:AnalyzeDocument`. Use the deployment platform's workload identity or secret manager; do not commit credentials.
- `STORE_DOCUMENT_OCR_CONFIDENCE_THRESHOLD`: optional value from 70 through 100; defaults to `85`.

The OCR endpoint accepts one single-page JPG or PNG up to 5 MB, keeps it in memory only for the request, validates its signature, sends it to Textract over the AWS SDK, and clears the local buffer before returning. It returns only mapped form fields and confidence scores, not the full OCR response or raw page text. The ordinary application document upload remains the system of record.

Applicants are told before selection that eligible images are sent to AWS Textract and must confirm or correct all suggested values. PDF and Word uploads remain supported for the application but do not invoke synchronous OCR.
