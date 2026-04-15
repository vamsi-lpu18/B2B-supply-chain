# Supply Chain Management System - Complete Database Context

## Overview

This document provides comprehensive database context for the Supply Chain Management System, a microservices-based architecture with 6 independent services following the **Database-per-Service** pattern.

---

## Architecture Summary

- **Total Services**: 6 microservices
- **Total Tables**: 29 tables
- **Total Entities**: 28 domain entities + 1 shared (OutboxMessage)
- **Pattern**: Database-per-Service with Event-Driven Architecture
- **Consistency**: Eventual consistency via Outbox Pattern
- **Transaction Management**: Saga Pattern for distributed transactions

---

## 1. IdentityAuth Service Database

### Purpose
User authentication, authorization, dealer registration, and profile management.

### Tables (5)

#### 1.1 Users
**Primary Entity**: User accounts with role-based access control

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| UserId | GUID | PK | Unique user identifier |
| Email | varchar(256) | UNIQUE, NOT NULL | User email (login) |
| PasswordHash | varchar(1024) | NOT NULL | Hashed password |
| FullName | varchar(120) | NOT NULL | User's full name |
| PhoneNumber | varchar(20) | NOT NULL | Contact number |
| Role | enum | NOT NULL | Admin, WarehouseManager, DeliveryAgent, Dealer |
| Status | enum | NOT NULL | Pending, Active, Rejected, Suspended |
| CreditLimit | decimal(18,2) | | Credit limit for dealers |
| RejectionReason | varchar(400) | NULLABLE | Reason if rejected |
| CreatedAtUtc | datetime | NOT NULL | Registration timestamp |
| UpdatedAtUtc | datetime | NOT NULL | Last update timestamp |

**Indexes**:
- `Email` (UNIQUE)
- `(Role, Status, CreatedAtUtc)` (Composite)

#### 1.2 DealerProfiles
**Purpose**: Extended profile information for dealer users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| DealerProfileId | GUID | PK | Profile identifier |
| UserId | GUID | FK → Users.UserId, UNIQUE | One-to-one with User |
| BusinessName | varchar(180) | NOT NULL | Business name |
| GstNumber | varchar(20) | UNIQUE, NOT NULL | GST registration number |
| TradeLicenseNo | varchar(80) | NOT NULL | Trade license number |
| Address | varchar(300) | NOT NULL | Business address |
| City | varchar(100) | NOT NULL | City |
| State | varchar(100) | NOT NULL | State |
| PinCode | varchar(6) | NOT NULL | Postal code |
| IsInterstate | boolean | NOT NULL | Interstate business flag |

**Indexes**:
- `GstNumber` (UNIQUE)
- `UserId` (UNIQUE)

**Relationships**:
- User 1:1 DealerProfile (CASCADE DELETE)

#### 1.3 RefreshTokens
**Purpose**: JWT refresh token management

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| RefreshTokenId | GUID | PK | Token identifier |
| UserId | GUID | FK → Users.UserId | Token owner |
| TokenHash | varchar(128) | UNIQUE, NOT NULL | Hashed token value |
| CreatedAtUtc | datetime | NOT NULL | Token creation time |
| ExpiresAtUtc | datetime | NOT NULL | Token expiration time |
| IsRevoked | boolean | NOT NULL | Revocation status |
| RevokedAtUtc | datetime | NULLABLE | Revocation timestamp |

**Indexes**:
- `TokenHash` (UNIQUE)

**Relationships**:
- User 1:N RefreshToken (CASCADE DELETE)

#### 1.4 OtpRecords
**Purpose**: One-time password tracking for authentication

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| OtpRecordId | GUID | PK | OTP record identifier |
| UserId | GUID | FK → Users.UserId | OTP recipient |
| OtpHash | varchar(128) | NOT NULL | Hashed OTP value |
| CreatedAtUtc | datetime | NOT NULL | OTP generation time |
| ExpiresAtUtc | datetime | NOT NULL | OTP expiration time |
| IsUsed | boolean | NOT NULL | Usage status |
| UsedAtUtc | datetime | NULLABLE | Usage timestamp |

**Relationships**:
- User 1:N OtpRecord (CASCADE DELETE)

#### 1.5 OutboxMessages
**Purpose**: Event publishing for inter-service communication

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| MessageId | GUID | PK | Message identifier |
| EventType | varchar(200) | NOT NULL | Event type name |
| Payload | text | NOT NULL | JSON event payload |
| Status | enum | NOT NULL | Pending, Sent, Failed |
| Error | varchar(2000) | NULLABLE | Error message if failed |
| CreatedAtUtc | datetime | NOT NULL | Event creation time |
| ProcessedAtUtc | datetime | NULLABLE | Processing timestamp |

---

## 2. CatalogInventory Service Database

### Purpose
Product catalog management, inventory tracking, and stock subscriptions.

### Tables (5)

#### 2.1 Categories
**Primary Entity**: Hierarchical product categorization

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| CategoryId | GUID | PK | Category identifier |
| Name | varchar(140) | NOT NULL | Category name |
| ParentCategoryId | GUID | FK → Categories.CategoryId, NULLABLE | Parent category (self-reference) |

**Indexes**:
- `ParentCategoryId`

**Relationships**:
- Category 1:N Category (Self-referencing hierarchy, RESTRICT DELETE)

#### 2.2 Products
**Primary Entity**: Product catalog with inventory

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ProductId | GUID | PK | Product identifier |
| Sku | varchar(60) | UNIQUE, NOT NULL | Stock keeping unit |
| Name | varchar(200) | NOT NULL | Product name |
| Description | varchar(2000) | NOT NULL | Product description |
| CategoryId | GUID | FK → Categories.CategoryId | Product category |
| UnitPrice | decimal(18,2) | NOT NULL | Price per unit |
| MinOrderQty | int | NOT NULL | Minimum order quantity |
| TotalStock | int | NOT NULL | Total inventory |
| ReservedStock | int | NOT NULL | Reserved for orders |
| IsActive | boolean | NOT NULL | Active status |
| ImageUrl | varchar(500) | NULLABLE | Product image URL |
| CreatedAtUtc | datetime | NOT NULL | Creation timestamp |
| UpdatedAtUtc | datetime | NOT NULL | Last update timestamp |
| AvailableStock | computed | | TotalStock - ReservedStock |

**Indexes**:
- `Sku` (UNIQUE)

**Relationships**:
- Category 1:N Product (RESTRICT DELETE)

#### 2.3 StockTransactions
**Purpose**: Audit trail for all inventory movements

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| TxId | GUID | PK | Transaction identifier |
| ProductId | GUID | FK → Products.ProductId | Product reference |
| TransactionType | enum | NOT NULL | Opening, Restock, Reserve, Release, Deduct, DeductReserved |
| Quantity | int | NOT NULL | Transaction quantity |
| ReferenceId | varchar(120) | NOT NULL | Reference (OrderId, etc.) |
| CreatedAtUtc | datetime | NOT NULL | Transaction timestamp |

**Relationships**:
- Product 1:N StockTransaction (CASCADE DELETE)

#### 2.4 StockSubscriptions
**Purpose**: Dealer notifications for product restocking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| StockSubscriptionId | GUID | PK | Subscription identifier |
| DealerId | GUID | NOT NULL, INDEXED | Dealer user ID |
| ProductId | GUID | FK → Products.ProductId | Subscribed product |
| CreatedAtUtc | datetime | NOT NULL | Subscription timestamp |

**Indexes**:
- `(DealerId, ProductId)` (UNIQUE composite)

**Relationships**:
- Product 1:N StockSubscription (CASCADE DELETE)

#### 2.5 OutboxMessages
Same structure as IdentityAuth service.

---

## 3. Order Service Database

### Purpose
Order processing, saga orchestration, return management, and order lifecycle tracking.

### Tables (6)

#### 3.1 Orders
**Primary Entity**: Order aggregate root

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| OrderId | GUID | PK | Order identifier |
| OrderNumber | varchar(32) | UNIQUE, NOT NULL | Human-readable order number |
| DealerId | GUID | NOT NULL, INDEXED | Dealer who placed order |
| Status | enum | NOT NULL | Order status (13 states) |
| TotalAmount | decimal(18,2) | NOT NULL | Order total |
| CreditHoldStatus | enum | NOT NULL | NotRequired, PendingApproval, Approved, Rejected |
| PaymentMode | enum | NOT NULL | Cash, Credit |
| PlacedAtUtc | datetime | NOT NULL | Order placement time |
| CancellationReason | varchar(400) | NULLABLE | Reason if cancelled |

**Indexes**:
- `OrderNumber` (UNIQUE)
- `(DealerId, PlacedAtUtc)` (Composite)
- `(Status, PlacedAtUtc)` (Composite)

**Order Status Flow**:
```
Placed → OnHold (if credit check needed)
      → Processing → ReadyForDispatch → InTransit → Delivered
      → Exception (issues during processing)
      → Closed (completed)
      → Cancelled (by user/admin)
      → ReturnRequested → ReturnApproved/ReturnRejected
```

#### 3.2 OrderLines
**Purpose**: Line items within an order

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| OrderLineId | GUID | PK | Line item identifier |
| OrderId | GUID | FK → Orders.OrderId | Parent order |
| ProductId | GUID | NOT NULL | Product reference |
| ProductName | varchar(220) | NOT NULL | Product name snapshot |
| Sku | varchar(60) | NOT NULL | SKU snapshot |
| Quantity | int | NOT NULL | Ordered quantity |
| UnitPrice | decimal(18,2) | NOT NULL | Price snapshot |
| LineTotal | computed | | UnitPrice * Quantity |

**Relationships**:
- OrderAggregate 1:N OrderLine (CASCADE DELETE)

#### 3.3 OrderStatusHistory
**Purpose**: Audit trail for order status changes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| HistoryId | GUID | PK | History record identifier |
| OrderId | GUID | FK → Orders.OrderId | Order reference |
| FromStatus | enum | NOT NULL | Previous status |
| ToStatus | enum | NOT NULL | New status |
| ChangedByUserId | GUID | NOT NULL | User who made change |
| ChangedByRole | varchar(40) | NOT NULL | User role |
| ChangedAtUtc | datetime | NOT NULL | Change timestamp |

**Relationships**:
- OrderAggregate 1:N OrderStatusHistory (CASCADE DELETE)

#### 3.4 ReturnRequests
**Purpose**: Order return request management

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ReturnRequestId | GUID | PK | Return request identifier |
| OrderId | GUID | FK → Orders.OrderId, UNIQUE | One return per order |
| RequestedByDealerId | GUID | NOT NULL | Dealer requesting return |
| Reason | varchar(500) | NOT NULL | Return reason |
| RequestedAtUtc | datetime | NOT NULL | Request timestamp |
| IsApproved | boolean | NOT NULL | Approval status |
| IsRejected | boolean | NOT NULL | Rejection status |
| ReviewedAtUtc | datetime | NULLABLE | Review timestamp |

**Relationships**:
- OrderAggregate 1:1 ReturnRequest (CASCADE DELETE)

#### 3.5 OrderSagaStates
**Purpose**: Saga orchestration state tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| OrderId | GUID | PK | Order identifier |
| OrderNumber | varchar(32) | NOT NULL | Order number |
| DealerId | GUID | NOT NULL | Dealer ID |
| CurrentState | enum | NOT NULL | Saga state |
| StartedAtUtc | datetime | NOT NULL | Saga start time |
| UpdatedAtUtc | datetime | NOT NULL | Last update time |
| CompletedAtUtc | datetime | NULLABLE | Completion time |
| LastMessage | varchar(500) | NULLABLE | Last status message |

**Saga States**:
```
Started → InventoryReserved → PaymentProcessed → InvoiceGenerated 
       → ShipmentCreated → Completed
       → Failed → Compensating → Compensated
```

#### 3.6 OutboxMessages
Same structure as IdentityAuth service.

---

## 4. PaymentInvoice Service Database

### Purpose
Invoice generation, payment processing, credit account management, and invoice workflow tracking.

### Tables (7)

#### 4.1 DealerCreditAccounts
**Primary Entity**: Dealer credit limit and outstanding tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| AccountId | GUID | PK | Account identifier |
| DealerId | GUID | UNIQUE, NOT NULL | Dealer user ID |
| CreditLimit | decimal(18,2) | NOT NULL | Maximum credit limit |
| CurrentOutstanding | decimal(18,2) | NOT NULL | Current outstanding amount |
| AvailableCredit | computed | | CreditLimit - CurrentOutstanding |

**Indexes**:
- `DealerId` (UNIQUE)

#### 4.2 Invoices
**Primary Entity**: Invoice aggregate root

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| InvoiceId | GUID | PK | Invoice identifier |
| InvoiceNumber | varchar(40) | UNIQUE, NOT NULL | Human-readable invoice number |
| OrderId | GUID | NOT NULL | Order reference |
| DealerId | GUID | NOT NULL, INDEXED | Dealer reference |
| IdempotencyKey | varchar(64) | UNIQUE, NOT NULL | Duplicate prevention |
| Subtotal | decimal(18,2) | NOT NULL | Pre-tax total |
| GstType | enum | NOT NULL | CGST_SGST, IGST |
| GstRate | decimal(6,2) | NOT NULL | GST percentage |
| GstAmount | decimal(18,2) | NOT NULL | GST amount |
| GrandTotal | decimal(18,2) | NOT NULL | Final total |
| PdfStoragePath | varchar(500) | NULLABLE | PDF file path |
| CreatedAtUtc | datetime | NOT NULL | Invoice creation time |

**Indexes**:
- `InvoiceNumber` (UNIQUE)
- `IdempotencyKey` (UNIQUE)
- `(DealerId, CreatedAtUtc)` (Composite)

#### 4.3 InvoiceLines
**Purpose**: Line items within an invoice

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| InvoiceLineId | GUID | PK | Line item identifier |
| InvoiceId | GUID | FK → Invoices.InvoiceId | Parent invoice |
| ProductId | GUID | NOT NULL | Product reference |
| ProductName | varchar(220) | NOT NULL | Product name snapshot |
| Sku | varchar(60) | NOT NULL | SKU snapshot |
| HsnCode | varchar(20) | NOT NULL | HSN code for GST |
| Quantity | int | NOT NULL | Invoiced quantity |
| UnitPrice | decimal(18,2) | NOT NULL | Price snapshot |
| LineTotal | computed | | UnitPrice * Quantity |

**Relationships**:
- Invoice 1:N InvoiceLine (CASCADE DELETE)

#### 4.4 InvoiceWorkflowStates
**Purpose**: Invoice payment workflow state

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| InvoiceId | GUID | PK, FK → Invoices.InvoiceId | One-to-one with Invoice |
| Status | enum | NOT NULL | Pending, FollowUp, PromiseToPay, Overdue, Paid, WrittenOff |
| DueAtUtc | datetime | NOT NULL | Payment due date |
| PromiseToPayAtUtc | datetime | NULLABLE | Promised payment date |
| NextFollowUpAtUtc | datetime | NULLABLE | Next follow-up date |
| InternalNote | varchar(500) | NOT NULL | Internal notes |
| ReminderCount | int | NOT NULL | Number of reminders sent |
| LastReminderAtUtc | datetime | NULLABLE | Last reminder timestamp |
| UpdatedAtUtc | datetime | NOT NULL | Last update time |

**Relationships**:
- Invoice 1:1 InvoiceWorkflowState (CASCADE DELETE)

#### 4.5 InvoiceWorkflowActivities
**Purpose**: Audit trail for invoice workflow actions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ActivityId | GUID | PK | Activity identifier |
| InvoiceId | GUID | FK → Invoices.InvoiceId | Invoice reference |
| Type | enum | NOT NULL | Created, ReminderSent, FollowUpScheduled, etc. |
| Message | varchar(300) | NOT NULL | Activity description |
| CreatedByRole | varchar(40) | NOT NULL | Role that created activity |
| CreatedAtUtc | datetime | NOT NULL | Activity timestamp |

**Indexes**:
- `(InvoiceId, CreatedAtUtc)` (Composite)

**Relationships**:
- Invoice 1:N InvoiceWorkflowActivity (CASCADE DELETE)

#### 4.6 PaymentRecords
**Purpose**: Payment transaction records

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| PaymentRecordId | GUID | PK | Payment identifier |
| OrderId | GUID | NOT NULL | Order reference |
| DealerId | GUID | NOT NULL | Dealer reference |
| PaymentMode | enum | NOT NULL | Cash, Credit |
| Amount | decimal(18,2) | NOT NULL | Payment amount |
| ReferenceNo | varchar(100) | NULLABLE | Payment reference number |
| CreatedAtUtc | datetime | NOT NULL | Payment timestamp |

#### 4.7 OutboxMessages
Same structure as IdentityAuth service.

---

## 5. LogisticsTracking Service Database

### Purpose
Shipment tracking, delivery agent assignment, and operational state management.

### Tables (4)

#### 5.1 Shipments
**Primary Entity**: Shipment aggregate root

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ShipmentId | GUID | PK | Shipment identifier |
| OrderId | GUID | NOT NULL | Order reference |
| DealerId | GUID | NOT NULL, INDEXED | Dealer reference |
| ShipmentNumber | varchar(32) | UNIQUE, NOT NULL | Human-readable shipment number |
| DeliveryAddress | varchar(500) | NOT NULL | Delivery address |
| City | varchar(100) | NOT NULL | Delivery city |
| State | varchar(100) | NOT NULL | Delivery state |
| PostalCode | varchar(12) | NOT NULL | Postal code |
| AssignedAgentId | GUID | NULLABLE, INDEXED | Assigned delivery agent |
| VehicleNumber | varchar(32) | NULLABLE | Vehicle registration |
| AssignmentDecisionStatus | enum | NOT NULL | Pending, Accepted, Rejected |
| AssignmentDecisionReason | varchar(500) | NULLABLE | Decision reason |
| AssignmentDecisionAtUtc | datetime | NULLABLE | Decision timestamp |
| DeliveryAgentRating | int | NULLABLE | Rating (1-5) |
| DeliveryAgentRatingComment | varchar(500) | NULLABLE | Rating comment |
| DeliveryAgentRatedAtUtc | datetime | NULLABLE | Rating timestamp |
| DeliveryAgentRatedByUserId | GUID | NULLABLE | User who rated |
| Status | enum | NOT NULL | Shipment status (9 states) |
| CreatedAtUtc | datetime | NOT NULL | Creation timestamp |
| DeliveredAtUtc | datetime | NULLABLE | Delivery timestamp |

**Indexes**:
- `ShipmentNumber` (UNIQUE)
- `(DealerId, CreatedAtUtc)` (Composite)
- `(AssignedAgentId, CreatedAtUtc)` (Composite)
- `CreatedAtUtc`

**Shipment Status Flow**:
```
Created → Assigned → PickedUp → InTransit → OutForDelivery 
       → Delivered
       → Returned (if return approved)
       → Exception (issues during delivery)
```

#### 5.2 ShipmentEvents
**Purpose**: Audit trail for shipment status changes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ShipmentEventId | GUID | PK | Event identifier |
| ShipmentId | GUID | FK → Shipments.ShipmentId | Shipment reference |
| Status | enum | NOT NULL | Shipment status |
| Note | varchar(500) | NOT NULL | Event note |
| UpdatedByUserId | GUID | NOT NULL | User who updated |
| UpdatedByRole | varchar(40) | NOT NULL | User role |
| CreatedAtUtc | datetime | NOT NULL | Event timestamp |

**Relationships**:
- Shipment 1:N ShipmentEvent (CASCADE DELETE)

#### 5.3 ShipmentOpsStates
**Purpose**: Operational state for warehouse handover and retry logic

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ShipmentId | GUID | PK, FK → Shipments.ShipmentId | One-to-one with Shipment |
| HandoverState | enum | NOT NULL | Pending, Ready, Exception, Completed |
| HandoverExceptionReason | varchar(300) | NULLABLE | Exception reason |
| RetryRequired | boolean | NOT NULL | Retry flag |
| RetryCount | int | NOT NULL | Number of retries |
| RetryReason | varchar(300) | NULLABLE | Retry reason |
| NextRetryAtUtc | datetime | NULLABLE | Next retry time |
| LastRetryScheduledAtUtc | datetime | NULLABLE | Last retry schedule time |
| UpdatedAtUtc | datetime | NOT NULL | Last update time |

**Relationships**:
- Shipment 1:1 ShipmentOpsState (CASCADE DELETE)

#### 5.4 OutboxMessages
Same structure as IdentityAuth service.

---

## 6. Notification Service Database

### Purpose
Multi-channel notification management (InApp, Email, SMS).

### Tables (2)

#### 6.1 Notifications
**Primary Entity**: Notification messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| NotificationId | GUID | PK | Notification identifier |
| RecipientUserId | GUID | NULLABLE, INDEXED | Recipient user ID |
| Title | varchar(180) | NOT NULL | Notification title |
| Body | varchar(4000) | NOT NULL | Notification body |
| SourceService | varchar(100) | NOT NULL | Originating service |
| EventType | varchar(100) | NOT NULL | Event type |
| Channel | enum | NOT NULL | InApp, Email, SMS |
| Status | enum | NOT NULL | Pending, Sent, Failed |
| CreatedAtUtc | datetime | NOT NULL, INDEXED | Creation timestamp |
| SentAtUtc | datetime | NULLABLE | Sent timestamp |
| FailureReason | varchar(1000) | NULLABLE | Failure reason |

**Indexes**:
- `RecipientUserId`
- `CreatedAtUtc`
- `(RecipientUserId, CreatedAtUtc)` (Composite)

#### 6.2 OutboxMessages
Same structure as IdentityAuth service.

---

## Cross-Service Relationships (Logical)

These are logical relationships maintained through GUIDs, not physical foreign keys across databases.

### User (IdentityAuth) References
```
User.UserId (as DealerId)
  ├→ OrderAggregate.DealerId (Order)
  ├→ DealerCreditAccount.DealerId (PaymentInvoice)
  ├→ Invoice.DealerId (PaymentInvoice)
  ├→ PaymentRecord.DealerId (PaymentInvoice)
  ├→ Shipment.DealerId (LogisticsTracking)
  ├→ Shipment.AssignedAgentId (LogisticsTracking)
  ├→ StockSubscription.DealerId (CatalogInventory)
  └→ NotificationMessage.RecipientUserId (Notification)
```

### Product (CatalogInventory) References
```
Product.ProductId
  ├→ OrderLine.ProductId (Order)
  ├→ InvoiceLine.ProductId (PaymentInvoice)
  └→ StockTransaction.ProductId (CatalogInventory)
```

### Order (Order) References
```
OrderAggregate.OrderId
  ├→ Invoice.OrderId (PaymentInvoice)
  ├→ Shipment.OrderId (LogisticsTracking)
  ├→ PaymentRecord.OrderId (PaymentInvoice)
  └→ OrderSagaStateEntity.OrderId (Order)
```

---

## Data Consistency Patterns

### 1. Outbox Pattern
Every service implements the Outbox pattern for reliable event publishing:
- Events are written to OutboxMessages table in the same transaction as domain changes
- Background dispatcher publishes events to message broker
- Ensures at-least-once delivery

### 2. Saga Pattern
Order service orchestrates distributed transactions:
- OrderSagaStateEntity tracks saga progress
- Compensating transactions on failure
- States: Started → InventoryReserved → PaymentProcessed → InvoiceGenerated → ShipmentCreated → Completed

### 3. Idempotency
- Invoice.IdempotencyKey prevents duplicate invoice generation
- Event handlers use idempotency keys to prevent duplicate processing

### 4. Soft Reservations
- CatalogInventory.ReservedStock holds inventory during order processing
- Released on cancellation or deducted on confirmation

### 5. Audit Trails
- OrderStatusHistory: All order state transitions
- ShipmentEvent: All shipment updates
- InvoiceWorkflowActivity: All invoice workflow actions
- StockTransaction: All inventory movements

---

## Enumeration Reference

### IdentityAuth
- **UserRole**: Admin, WarehouseManager, DeliveryAgent, Dealer
- **UserStatus**: Pending, Active, Rejected, Suspended

### CatalogInventory
- **StockTransactionType**: Opening, Restock, Reserve, Release, Deduct, DeductReserved

### Order
- **OrderStatus**: Placed, OnHold, Processing, ReadyForDispatch, InTransit, Delivered, Exception, Closed, Cancelled, ReturnRequested, ReturnApproved, ReturnRejected
- **CreditHoldStatus**: NotRequired, PendingApproval, Approved, Rejected
- **PaymentMode**: Cash, Credit
- **OrderSagaState**: Started, InventoryReserved, PaymentProcessed, InvoiceGenerated, ShipmentCreated, Completed, Failed, Compensating, Compensated

### PaymentInvoice
- **GstType**: CGST_SGST, IGST
- **InvoiceWorkflowStatus**: Pending, FollowUp, PromiseToPay, Overdue, Paid, WrittenOff
- **InvoiceWorkflowActivityType**: Created, ReminderSent, FollowUpScheduled, PromiseToPayRecorded, PaymentReceived, MarkedOverdue, WrittenOff
- **PaymentMode**: Cash, Credit

### LogisticsTracking
- **ShipmentStatus**: Created, Assigned, PickedUp, InTransit, OutForDelivery, Delivered, Returned, Exception
- **AssignmentDecisionStatus**: Pending, Accepted, Rejected
- **HandoverState**: Pending, Ready, Exception, Completed

### Notification
- **NotificationChannel**: InApp, Email, SMS
- **NotificationStatus**: Pending, Sent, Failed

### Shared
- **OutboxStatus**: Pending, Sent, Failed

---

## Index Strategy Summary

### Performance Indexes
- **Unique constraints**: Email, Sku, OrderNumber, InvoiceNumber, ShipmentNumber, GstNumber, TokenHash, IdempotencyKey
- **Foreign key indexes**: All FK columns for join performance
- **Composite indexes**: 
  - `(Role, Status, CreatedAtUtc)` - User queries
  - `(DealerId, PlacedAtUtc)` - Dealer order history
  - `(Status, PlacedAtUtc)` - Order status queries
  - `(DealerId, CreatedAtUtc)` - Dealer invoices/shipments
  - `(RecipientUserId, CreatedAtUtc)` - User notifications

---

## Database Statistics

| Service | Tables | Entities | Relationships | Enums |
|---------|--------|----------|---------------|-------|
| IdentityAuth | 5 | 4 + OutboxMessage | 3 | 2 |
| CatalogInventory | 5 | 4 + OutboxMessage | 3 | 1 |
| Order | 6 | 5 + OutboxMessage | 4 | 4 |
| PaymentInvoice | 7 | 6 + OutboxMessage | 4 | 4 |
| LogisticsTracking | 4 | 3 + OutboxMessage | 2 | 3 |
| Notification | 2 | 1 + OutboxMessage | 0 | 2 |
| **TOTAL** | **29** | **28** | **16** | **16** |

---

## Key Business Rules

### Credit Management
- Default credit limit: ₹500,000
- Credit orders require admin approval if exceeds available credit
- Invoice due: 7 days from generation
- Automated reminders at 3, 5, 7 days
- Overdue after 7 days

### Order Processing
- Minimum order quantity enforced per product
- Inventory soft-reserved during order processing
- Credit hold triggers admin approval workflow
- Return window: 48 hours from delivery

### Inventory Management
- TotalStock = physical inventory
- ReservedStock = soft reservations
- AvailableStock = TotalStock - ReservedStock
- Stock subscriptions notify dealers on restock

### Shipment Lifecycle
- Agent can accept/reject assignment
- Vehicle number required before pickup
- Delivery agent rating (1-5 stars) post-delivery
- Retry logic for handover exceptions

---

**Document Version**: 1.0  
**Last Updated**: April 14, 2026  
**Generated By**: Kiro AI Assistant
