# Registration identity verification

New public accounts require complete legal-name, contact, address, government-ID, email-OTP, consent, and face-match verification. The government-ID image is encrypted with AES-256-GCM before it is stored. The live selfie is held in memory for AWS Rekognition `CompareFaces` and is discarded after the request.

Existing accounts without a verified identity are restricted at the shared HTTP authentication middleware and authenticated Socket.IO handshake. They may access only the current-user endpoint, password recovery/change, logout, and `POST /api/auth/identity/verify` until a government ID and new live-camera selfie pass the same face-match policy. Public read-only pages and delivery tracking capabilities remain available without an account.

Required server configuration:

- `IDENTITY_DOCUMENT_ENCRYPTION_KEY`: a dedicated 32-byte key encoded as 64 hexadecimal characters or Base64. Do not reuse `JWT_SECRET`.
- `AWS_REKOGNITION_REGION` (preferred), `AWS_REGION`, or `AWS_DEFAULT_REGION`: the Rekognition region. If none is supplied, Pawzzle uses `ap-southeast-1` (Singapore), the nearest Rekognition region to the Philippines.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` when the deployment platform does not provide an AWS workload identity. Store both as deployment secrets and grant only `rekognition:CompareFaces`.
- AWS workload credentials granting only `rekognition:CompareFaces`. Use the deployment platform's workload identity or secret manager; do not commit credentials.
- `IDENTITY_FACE_MATCH_THRESHOLD`: optional value from 80 through 100; defaults to `95`.

Deployment must use HTTPS. Rotate the encryption key only through a planned data re-encryption procedure; changing it directly makes stored IDs unreadable. AWS Rekognition is configured with `QualityFilter: HIGH`, and account creation fails closed when encryption or face comparison is unavailable.

For the Render Blueprint, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `IDENTITY_DOCUMENT_ENCRYPTION_KEY` are intentionally declared with `sync: false`. They must be populated in the Render service environment before deployment; the repository never contains their values.

The live-camera requirement reduces casual file reuse but is not a full presentation-attack or liveness detector. Add a dedicated liveness service before treating this flow as high-assurance remote identity proofing.
