# Supply Chain Platform Low Level Design (LLD)

## 1. Document Information
- Document: Low Level Design
- System: Supply Chain Platform
- Version: 1.0
- Date: 2026-04-02
- Scope: API, domain, persistence, integrations, async workers, and frontend composition

## 2. Global Technical Conventions

### 2.1 Backend Structure
Each service follows:
- API: Controllers
- Application: DTOs, service interfaces, validators, use case services
- Domain: Entities and enums with business rules
- Infrastructure: DbContext, repositories, integrations, hosted services

### 2.2 Cross Cutting Behaviors
Shared application behaviors include:
- Logging behavior
- Idempotency behavior
- Validation behavior
- Transaction behavior

### 2.3 Outbox Contract
Shared outbox model fields:
- MessageId
- EventType
- Payload
- Status
- CreatedAtUtc
- PublishedAtUtc
- RetryCount
- Error

Shared outbox statuses:
- Pending
- Published
- Failed

### 2.4 Redis Usage
- Cache service for key value caching
- Idempotency store using key prefix idempotency:

## 3. Gateway LLD

### 3.1 Responsibilities
- Upstream entry point for all clients
- Route mapping to downstream services
- Request correlation and client tagging
- Per route and global rate limiting
- Route and latency observability endpoints

### 3.2 Route Families
- Identity: upstream prefix identity
- Catalog: upstream prefix catalog
- Orders: upstream prefix orders
- Logistics: upstream prefix logistics
- Payments: upstream prefix payments
- Notifications: upstream prefix notifications

### 3.3 Special Public Routes
- Identity auth public POST routes
- Payment credit check public GET route
- Notification ingest public POST route

### 3.4 Cross Cutting Runtime Logic
- Gateway applies JWT auth/authorization before proxying protected routes
- Gateway propagates request correlation using `X-Correlation-Id`
- Gateway rate limiting is keyed by `Oc-Client`

### 3.5 Gateway Operational Endpoints
- No custom gateway operational endpoints in the simplified runtime

## 4. IdentityAuth Service LLD

### 4.1 Responsibilities
- Authentication and token issuance
- Refresh token lifecycle
- Password reset OTP flow
- Dealer registration and admin approval flow
- User profile retrieval
- Internal user contact lookup for other services

### 4.2 API Endpoints
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | /api/auth/register | No | Public | Dealer registration |
| POST | /api/auth/login | No | Public | Login and token issuance |
| POST | /api/auth/refresh | No | Public | Access token refresh via cookie |
| POST | /api/auth/forgot-password | No | Public | Initiate OTP reset flow |
| POST | /api/auth/reset-password | No | Public | Complete password reset |
| POST | /api/auth/logout | Yes | Any authenticated | Logout and token revocation handling |
| GET | /api/users/profile | Yes | Any authenticated | Current user profile |
| GET | /api/admin/dealers | Yes | Admin | Dealer list with paging/search |
| GET | /api/admin/dealers/{id} | Yes | Admin | Dealer detail |
| PUT | /api/admin/dealers/{id}/approve | Yes | Admin | Approve dealer |
| PUT | /api/admin/dealers/{id}/reject | Yes | Admin | Reject dealer |
| PUT | /api/admin/dealers/{id}/credit-limit | Yes | Admin | Update dealer credit limit |
| GET | /api/internal/users/{id}/contact | Internal key | Internal | Resolve user contact data |

### 4.3 Data Model
- Users
- DealerProfiles
- RefreshTokens
- OtpRecords
- OutboxMessages

### 4.4 Important Business Rules
- Dealer registration enters Pending status
- Login blocked unless status is Active
- Duplicate email and GST are rejected
- Reject and approve actions emit outbox events
- Credit limit update requires successful payment service sync before local commit

### 4.5 Integrations
- Payment internal credit limit update HTTP call
- Notification ingest call for password reset notifications
- Redis token revocation store

### 4.6 Hosted Workers
- IdentityOutboxDispatcher publishes pending outbox events to RabbitMQ exchange supplychain.events with routing key identity.<eventType>

## 5. CatalogInventory Service LLD

### 5.1 Responsibilities
- Product and category management
- Stock transaction management
- Dealer stock subscriptions
- Inventory lock and deduction operations

### 5.2 API Endpoints
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | /api/products | Yes | Admin | Create product |
| PUT | /api/products/{id} | Yes | Admin | Update product |
| PUT | /api/products/{id}/deactivate | Yes | Admin | Deactivate product |
| POST | /api/products/{id}/restock | Yes | Admin, Warehouse | Restock product |
| GET | /api/products | Optional | Public, role aware inactive filter | Product paging |
| GET | /api/products/categories | Optional | Public | Category list |
| GET | /api/products/{id} | Optional | Public | Product detail |
| GET | /api/products/search | Optional | Public, role aware inactive filter | Product search |
| GET | /api/products/{id}/stock | Yes | Admin, Warehouse | Stock level read |
| POST | /api/inventory/soft-lock | Yes | Admin, Dealer, OrderService | Reserve stock |
| POST | /api/inventory/hard-deduct | Yes | Admin, Warehouse, Logistics | Final stock deduction |
| POST | /api/inventory/release-soft-lock | Yes | Admin, OrderService | Release reserved stock |
| POST | /api/inventory/subscriptions | Yes | Dealer | Subscribe stock alert |
| DELETE | /api/inventory/subscriptions | Yes | Dealer | Unsubscribe stock alert |

### 5.3 Data Model
- Products
- Categories
- StockTransactions
- StockSubscriptions
- OutboxMessages

### 5.4 Important Business Rules
- SKU is unique
- Available stock is computed from total minus reserved
- Inactive visibility only allowed for Admin or Warehouse when requested

### 5.5 Hosted Workers
- CatalogOutboxDispatcher publishes routing key catalog.<eventType>

## 6. Order Service LLD

### 6.1 Responsibilities
- Order aggregate lifecycle
- Dealer order creation and retrieval
- Staff and admin status operations
- Credit hold decisions
- Returns
- Bulk status transition execution

### 6.2 API Endpoints
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | /api/orders | Yes | Dealer | Create order |
| GET | /api/orders/my | Yes | Dealer | Dealer order list |
| GET | /api/orders/{id} | Yes | Role aware | Get order by id with ownership check |
| PUT | /api/orders/{id}/status | Yes | Admin, Warehouse, Logistics | Update status |
| POST | /api/orders/{id}/cancel | Yes | Dealer, Admin | Cancel order |
| POST | /api/orders/{id}/returns | Yes | Dealer | Request return |
| GET | /api/admin/orders | Yes | Admin, Warehouse, Logistics | Get all orders |
| POST | /api/admin/orders/bulk-status | Yes | Admin, Warehouse, Logistics | Validate or apply bulk transition |
| PUT | /api/admin/orders/{id}/approve-hold | Yes | Admin, Warehouse, Logistics | Approve hold |
| PUT | /api/admin/orders/{id}/reject-hold | Yes | Admin, Warehouse, Logistics | Reject hold |

### 6.3 Data Model
- Orders
- OrderLines
- OrderStatusHistory
- ReturnRequests
- OutboxMessages

### 6.4 Order State Machine
Allowed transitions:
- Placed -> Processing, OnHold, Cancelled
- OnHold -> Processing, Cancelled
- Processing -> ReadyForDispatch, Cancelled
- ReadyForDispatch -> InTransit, Cancelled
- InTransit -> Delivered, Exception
- Exception -> InTransit, Cancelled
- Delivered -> Closed, ReturnRequested
- ReturnRequested -> ReturnApproved, ReturnRejected
- ReturnApproved -> Closed
- ReturnRejected -> Closed
- Closed -> none
- Cancelled -> none

### 6.5 Core Flows
- Create order calls Payment credit check
- If credit not approved, order enters OnHold and emits AdminApprovalRequired
- If approved, order transitions to Processing and emits OrderPlaced
- Cancel and return flows emit corresponding outbox events

### 6.6 Hosted Workers
- OrderOutboxDispatcher publishes routing key order.<eventType>

## 7. LogisticsTracking Service LLD

### 7.1 Responsibilities
- Shipment creation and lifecycle
- Agent and vehicle assignment
- Shipment event timeline
- Shipment operational handover and retry state

### 7.2 API Endpoints
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | /api/logistics/shipments | Yes | Admin, Warehouse, Logistics | Create shipment |
| GET | /api/logistics/shipments/{shipmentId} | Yes | Any authenticated | Shipment detail |
| GET | /api/logistics/shipments/my | Yes | Dealer | Dealer shipments |
| GET | /api/logistics/shipments | Yes | Admin, Warehouse, Logistics, Agent | All shipments |
| PUT | /api/logistics/shipments/{shipmentId}/assign-agent | Yes | Admin, Logistics | Assign agent |
| PUT | /api/logistics/shipments/{shipmentId}/assign-vehicle | Yes | Admin, Logistics | Assign vehicle |
| PUT | /api/logistics/shipments/{shipmentId}/status | Yes | Admin, Logistics, Agent | Update shipment status |
| GET | /api/logistics/shipments/{shipmentId}/ops-state | Yes | Admin, Warehouse, Logistics, Agent, Dealer | Read ops state |
| POST | /api/logistics/shipments/ops-states/batch | Yes | Admin, Warehouse, Logistics, Agent, Dealer | Read batch ops states |
| PUT | /api/logistics/shipments/{shipmentId}/ops-state | Yes | Admin, Logistics | Upsert ops state |

### 7.3 Data Model
- Shipments
- ShipmentEvents
- ShipmentOpsStates
- OutboxMessages

### 7.4 Shipment Rules
- Agent assignment transitions Created to Assigned if needed
- Vehicle assignment not allowed for Delivered or Returned
- Status update blocked after Delivered or Returned
- Delivered status sets delivered timestamp

### 7.5 Ops State Rules
- SyncWithShipment computes Pending, Ready, or Completed based on assignment and status
- Retry metadata and exception reasons are normalized and bounded

### 7.6 Hosted Workers
- LogisticsOutboxDispatcher publishes routing key logistics.<eventType>

## 8. PaymentInvoice Service LLD

### 8.1 Responsibilities
- Dealer credit account
- Credit check API
- Settlement and credit updates
- Payment gateway order and verification
- Invoice generation and retrieval
- Invoice collection workflow state and activity timeline

### 8.2 API Endpoints
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | /api/payment/gateway/orders | Yes | Dealer | Create gateway order |
| POST | /api/payment/gateway/verify | Yes | Dealer | Verify payment and optional capture |
| POST | /api/payment/dealers/{dealerId}/account | Yes | Admin | Seed dealer account |
| GET | /api/payment/dealers/{dealerId}/credit-check | No | Public | Credit check by amount |
| PUT | /api/payment/dealers/{dealerId}/credit-limit | Yes | Admin | Update credit limit |
| PUT | /api/payment/internal/dealers/{dealerId}/credit-limit | Internal key | Internal | Internal credit limit update |
| POST | /api/payment/dealers/{dealerId}/settlements | Yes | Admin, Dealer | Settle outstanding |
| POST | /api/payment/invoices | Yes | Admin | Generate invoice |
| GET | /api/payment/invoices/{invoiceId} | Yes | Admin, Dealer | Get invoice |
| GET | /api/payment/dealers/{dealerId}/invoices | Yes | Admin, Dealer | Dealer invoices |
| GET | /api/payment/invoices/{invoiceId}/workflow | Yes | Admin, Dealer | Get workflow state |
| GET | /api/payment/dealers/{dealerId}/invoice-workflows | Yes | Admin, Dealer | Get dealer workflow states |
| PUT | /api/payment/invoices/{invoiceId}/workflow | Yes | Admin, Dealer | Upsert workflow state |
| GET | /api/payment/invoices/{invoiceId}/workflow-activities | Yes | Admin, Dealer | List workflow activities |
| POST | /api/payment/invoices/{invoiceId}/workflow-activities | Yes | Admin, Dealer | Add workflow activity |
| GET | /api/payment/invoices/{invoiceId}/download | Yes | Admin, Dealer | Download invoice PDF |

### 8.3 Data Model
- DealerCreditAccounts
- Invoices
- InvoiceLines
- InvoiceWorkflowStates
- InvoiceWorkflowActivities
- PaymentRecords
- OutboxMessages

### 8.4 Core Rules
- Credit check auto creates account if missing
- Invoice generation enforces idempotency key uniqueness
- Workflow state defaults to Pending with due date invoiceCreated + 7 days
- Reminder count clamped to 0..99
- Workflow and activity type normalization applied

### 8.5 Gateway Integration
- Razorpay basic auth request for order creation
- Signature verification using HMAC SHA256
- Optional payment capture after verification

### 8.6 Hosted Workers
- PaymentOutboxDispatcher publishes routing key payment.<eventType>

## 9. Notification Service LLD

### 9.1 Responsibilities
- Persist notification messages
- Ingest cross service integration events
- Expose recipient scoped and admin scoped reads
- Process email channel delivery and digesting

### 9.2 API Endpoints
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | /api/notifications/manual | Yes | Admin | Create manual notification |
| POST | /api/notifications/ingest | No | Public integration | Ingest integration event |
| GET | /api/notifications/my | Yes | Authenticated | My notifications |
| GET | /api/notifications | Yes | Admin | All notifications |
| GET | /api/notifications/{id} | Yes | Authenticated | Notification detail with recipient check |
| PUT | /api/notifications/{id}/sent | Yes | Admin | Mark sent |
| PUT | /api/notifications/{id}/failed | Yes | Admin | Mark failed |

### 9.3 Data Model
- Notifications
- OutboxMessages

### 9.4 Message Rules
- Event notifications normalize source and event names to lower case
- Channel resolution defaults to InApp unless event mapping routes to Email
- MarkSent sets SentAtUtc and clears failure reason
- MarkFailed sets failure reason

### 9.5 Hosted Workers
- NotificationEventConsumer
- NotificationEmailDispatcher

### 9.6 Event Consumer Details
- Consumes queue notification.events.queue
- Binds to exchange supplychain.events with routing key #
- Uses dead letter exchange and dead letter queue on repeated failure
- Parses source and event from routing key
- Attempts recipient user id extraction from payload fields

### 9.7 Email Dispatcher Details
- Polls pending Email channel notifications in batches
- Resolves recipient email from payload or Identity internal contact endpoint
- Sends immediate emails for high priority identity reset events
- Batches remaining emails into workflow digest groups
- Renders branded HTML templates and text fallback
- Marks notification sent or failed per message

### 9.8 Design Note
- Notification repository writes outbox entry for manual notification creation
- Current async notification processing primarily uses event consumer and email dispatcher

## 10. Frontend LLD

### 10.1 Responsibilities
- Role aware navigation and feature access
- API orchestration and UI validation
- Operational dashboards and workflow views

### 10.2 Route and Guarding Model
- Auth guard for protected shell routes
- Role guard for role restricted pages
- Shared pages apply action level checks using role evaluation in components

### 10.3 Major Feature Modules
- Authentication
- Dashboard
- Profile
- Catalog product list and detail
- Cart and checkout
- Orders list and detail
- Shipments list and detail
- Invoices list and detail
- Notifications list and preferences
- Admin dealer list and detail

### 10.4 Frontend API Services
- Auth API
- Admin API
- Catalog API
- Order API and AdminOrder API
- Logistics API
- Payment API
- Notification API

### 10.5 Frontend Workflow Specific Logic
- Checkout validates cart against latest product stock and pricing before order creation
- Invoice workflow service computes automation patch for elapsed promise to pay and follow up scheduling
- Shipment detail UI exposes actions based on role and shipment or ops state

## 11. Async Event Processing LLD Summary

### 11.1 Producers
- Identity outbox dispatcher
- Catalog outbox dispatcher
- Order outbox dispatcher
- Logistics outbox dispatcher
- Payment outbox dispatcher

### 11.2 Broker
- RabbitMQ topic exchange: supplychain.events

### 11.3 Consumer
- Notification event consumer ingests all events and creates notification records

### 11.4 Delivery Channel
- Notification email dispatcher sends Email channel messages and digests

## 12. Security LLD

### 12.1 Token Validation
- Gateway validates JWT for protected routes
- Services validate JWT with issuer, audience, signature, and lifetime
- Identity additionally checks token revocation store

### 12.2 Authorization Model
- Endpoint role attributes in controllers
- UI role guard plus component level action gating

### 12.3 Internal Calls
- Internal endpoints use X-Internal-Api-Key checks
- Identity internal contact endpoint for notification resolver
- Payment internal credit limit endpoint for identity sync

## 13. Error Handling LLD

### 13.1 Validation
- FluentValidation errors mapped to 400 with property details

### 13.2 Domain Rule Violations
- InvalidOperationException mapped to 400 where handled

### 13.3 Authorization
- Unauthorized mapped to 401
- Role mismatch mapped to 403 by framework policy handling

### 13.4 Async Failures
- Outbox message retries with max attempts, then failed state
- Notification event dead lettering after redelivery failure
- Email send failures persisted to notification failure reason

## 14. Logging and Metrics LLD
- Serilog request logging in all services
- Gateway uses standard request logging; no custom in-memory latency metrics endpoint
- Health endpoint per service for basic monitoring

## 15. Persistence and Migration LLD
- EF Core code first contexts per service
- Startup migration execution in Program
- Service-specific migration scripts available for controlled apply

## 16. Testing Recommendations for Implementation Validation

### 16.1 Unit Tests
- Domain state transitions
- Validation rules
- Workflow normalization logic

### 16.2 Integration Tests
- Controller authorization per role
- Repository persistence and constraints
- External integration adapters with mocked transport

### 16.3 Contract Tests
- Gateway route mapping and status code pass through
- Outbox event payload shape
- Notification consumer payload parsing

### 16.4 End To End Tests
- Dealer registration to admin approval to order placement
- Prepaid payment verification and invoice retrieval
- Shipment lifecycle to notification and email delivery

## 17. Open Implementation Considerations
- Add centralized distributed tracing across gateway and services
- Add stronger ownership checks for dealer scoped resource access on all relevant payment and workflow endpoints
- Add explicit Notification outbox dispatcher if external notification subscribers are needed
- Add policy hardening for internal endpoints via network controls and mTLS where applicable

## 18. AI Augmentation for Autonomous Exception Playbooks

### 18.1 Objective
- Keep rule-based exception detection as system of record
- Add AI as a decision support layer for prioritization, recommended actions, and operator explanation
- Improve recovery speed without removing governance controls

### 18.2 AI Use Cases in Scope
- Exception triage priority scoring (which issue to resolve first)
- Next best action recommendations from approved playbook catalog
- Impact estimation before execution (delay risk, service impact, cost impact)
- Natural language explanation for why a recommendation was generated
- Post-resolution learning tags (root cause class and recurring pattern hints)

### 18.3 AI Use Cases Out of Scope (Phase 1)
- AI directly executing high-risk operational actions without approval
- AI replacing authorization and policy checks
- AI writing directly to domain tables without validation through application services

### 18.4 Component Design
- Add an AI Orchestration component (new microservice or module in existing operations layer)
- Inputs:
	- Exception events from existing domain streams
	- Current entity state from Order, LogisticsTracking, CatalogInventory, PaymentInvoice
	- Historical outcomes from resolved exceptions
- Outputs:
	- Structured recommendation payload
	- Confidence score
	- Explanation and simulation summary

### 18.5 Proposed API Surface
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | /api/operations/exceptions/{id}/ai-recommendation | Yes | Admin, Warehouse, Logistics | Generate AI recommendation for exception |
| POST | /api/operations/exceptions/{id}/simulate | Yes | Admin, Warehouse, Logistics | Simulate recommended actions before commit |
| POST | /api/operations/recommendations/{id}/approve | Yes | Admin, Logistics | Approve recommendation for execution |
| POST | /api/operations/recommendations/{id}/reject | Yes | Admin, Logistics | Reject recommendation and capture reason |
| GET | /api/operations/exceptions/{id}/ai-explanation | Yes | Admin, Warehouse, Logistics | Retrieve explainability summary |

### 18.6 Recommendation Contract
- ExceptionId
- PlaybookType
- SuggestedActions[]
- ExpectedImpact:
	- etaReductionMinutes
	- serviceRiskBefore
	- serviceRiskAfter
	- costDeltaEstimate
- ConfidenceScore (0.0 to 1.0)
- ExplanationText
- RequiresHumanApproval (boolean)

### 18.7 Guardrails and Governance
- Validate AI output against strict schema before any action is visible or executable
- Apply policy rules after AI suggestion (role permissions, ownership checks, domain constraints)
- Require human approval for medium and high impact changes
- Auto-fallback to deterministic rule-based playbook if AI fails, times out, or confidence is below threshold
- Store full audit trail: prompt context hash, model version, recommendation, approver, execution result

### 18.8 API Key and Secret Management
- External AI provider key is required only when AI inference is enabled
- Store provider key in environment variable or secret manager, not in source control
- Recommended key name: AI_PROVIDER_API_KEY
- Restrict outbound network access to approved AI endpoint only
- Rotate keys periodically and on incident

### 18.9 Prompting and Grounding Strategy
- Use internal operational context only (current exception, related order or shipment state, policy catalog, recent outcomes)
- Do not allow unrestricted external retrieval during decision generation
- Inject playbook catalog and hard constraints in prompt context to keep outputs policy-aligned
- Require structured JSON output mode for deterministic downstream validation

### 18.10 Rollout Plan
- Phase 1: AI Suggest mode only (human approves all actions)
- Phase 2: AI + simulation scorecard (human approves medium and high impact only)
- Phase 3: Limited auto-execution for low-risk actions with post-action review

### 18.11 Success Metrics
- Mean Time To Resolve exceptions
- Recommendation acceptance rate by role
- Accuracy of impact estimates versus actual outcomes
- Reduction in manual escalations
- SLA breach reduction for delayed shipments and held orders
isnt that 