# Registration identity verification

New public accounts require complete legal-name, contact, address, government-ID, email-OTP, consent, and face-match verification. The government-ID image is encrypted with AES-256-GCM before it is stored. The live selfie is held in memory for AWS Rekognition `CompareFaces` and is discarded after the request.

Required server configuration:

- `IDENTITY_DOCUMENT_ENCRYPTION_KEY`: a dedicated 32-byte key encoded as 64 hexadecimal characters or Base64. Do not reuse `JWT_SECRET`.
- `AWS_REGION` (or `AWS_DEFAULT_REGION`): the Rekognition region.
- AWS workload credentials granting only `rekognition:CompareFaces`. Use the deployment platform's workload identity or secret manager; do not commit credentials.
- `IDENTITY_FACE_MATCH_THRESHOLD`: optional value from 80 through 100; defaults to `95`.

Deployment must use HTTPS. Rotate the encryption key only through a planned data re-encryption procedure; changing it directly makes stored IDs unreadable. AWS Rekognition is configured with `QualityFilter: HIGH`, and account creation fails closed when encryption or face comparison is unavailable.

The live-camera requirement reduces casual file reuse but is not a full presentation-attack or liveness detector. Add a dedicated liveness service before treating this flow as high-assurance remote identity proofing.
