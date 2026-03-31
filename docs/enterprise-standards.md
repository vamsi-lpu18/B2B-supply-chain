# Enterprise Engineering Standards

## Naming Conventions

### CSharp

- Classes, records, enums, and methods: `PascalCase`
- Interfaces: `IPascalCase`
- Private fields: `_camelCase`
- Constants: `PascalCase`
- Async methods: suffix with `Async`
- DTO names: explicit and domain-scoped, for example `CreatePurchaseOrderRequest`

### Event Names

- Use business-language events with clear action semantics.
- Prefer names like `orderApproved`, `shipmentStatusUpdated`, `dealerCreditLimitUpdated`.
- Avoid ambiguous names such as `event1`, `statusChanged` without context.

### API Route Naming

- Use resource-oriented plural nouns.
- Example: `/api/orders/{orderId}/status`
- Keep service-prefix routing stable for gateway contracts.

## Realistic Domain Naming

- Prefer domain terms over generic placeholders.
- Good: `CreditLimitReviewService`
- Avoid: `DataService`, `Helper`, `Manager` unless role is concrete.

## Enterprise Image Policy

- Email hero images should be domain-specific and consistent by service:
  - Identity: security and account operations
  - Order: order lifecycle and approvals
  - Payment: invoicing and settlements
  - Logistics: shipment and fulfillment
  - Digest: executive summary / unified operations
- Prefer externally hosted, high-resolution AI-generated visuals with a fallback image strategy.
- Keep text contrast and accessibility (alt text, readable typography).

## Governance

- `.editorconfig` in repository root is the source of truth for formatting and naming.
- New modules must follow these conventions before merge.
- CI should include lint/build checks for naming regressions.
