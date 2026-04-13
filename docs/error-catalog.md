# Error Catalog

This document defines the standard API error envelope and code families used across backend services and gateway responses.

## Response Envelope

All error responses should follow this shape:

```json
{
  "code": "validation.failed",
  "message": "Validation failed.",
  "retryable": false,
  "correlationId": "00-abc123...",
  "details": {}
}
```

## Field Definitions

- `code`: Stable machine-readable error identifier.
- `message`: Human-readable error summary.
- `retryable`: Indicates whether client retry is recommended.
- `correlationId`: Request correlation ID from `X-Correlation-Id` or server trace ID fallback.
- `details`: Optional structured payload for validation/diagnostics.

## Standard Codes

| Code | Typical HTTP Status | Retryable | Meaning |
| --- | --- | --- | --- |
| `validation.failed` | 400 | false | Request payload/parameters failed validation. |
| `auth.unauthorized` | 401 | false | Missing or invalid authentication/authorization. |
| `resource.not-found` | 404 | false | Requested resource does not exist. |
| `business.rule-violation` | 400 | false | Business invariant violated. |
| `business.conflict` | 409 | false | Action conflicts with current domain state. |
| `domain.validation` | 400 | false | Domain-specific validation failure. |
| `dependency.timeout` | 504 | true | Downstream dependency timed out. |
| `dependency.unavailable` | 503 | true | Downstream dependency unavailable or network failure. |
| `internal.unexpected` | 500 | true | Unhandled server error. |
| `throttle.too-many-requests` | 429 | true | Gateway/API rate limit exceeded. |
| `gateway.unexpected` | 500 | true | Unhandled gateway processing error. |

## Implementation Notes

- Keep error codes stable to avoid frontend/client breakage.
- Add service-specific codes only when they represent reusable categories.
- Include field-level details only for validation-class errors.
- Do not leak stack traces or sensitive configuration in `message` or `details`.
