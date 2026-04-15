# Supply Chain Management System - Complete ER Diagram

## Database Architecture Overview

This document presents the complete Entity-Relationship diagram for the Supply Chain Management System, a microservices-based architecture with 6 independent services, each with its own database following the Database-per-Service pattern.

---

## 1. IdentityAuth Service Database

### Entities

#### User
- **UserId** (PK, GUID)
- Email (Unique, varchar(256))
- PasswordHash (varchar(1024))
- FullName (varchar(120))
- PhoneNumber (varchar(20))
- Role (enum: Admin, WarehouseManager, DeliveryAgent, Dealer)
- Status (enum: Pending, Active, Rejected, Suspended)
- CreditLimit (decimal(18,2))
- RejectionReason (varchar(400), nullable)
- CreatedAtUtc (datetime)
- UpdatedAtUtc (datetime)

#### DealerProfile
- **DealerProfileId** (PK, GUID)
- **UserId** (FK → User.UserId, Unique)
- BusinessName (varchar(180))
- GstNumber (varchar(20), Unique)
- TradeLicenseNo (varchar(80))
- Address (varchar(300))
- City (varchar(100))
- State (varchar(100))
- PinCode (varchar(6))
- IsInterstate (boolean)

#### RefreshToken
- **RefreshTokenId** (PK, GUID)
- **UserId** (FK → User.UserId)
- TokenHash (varchar(128), Unique)
- CreatedAtUtc (datetime)
- ExpiresAtUtc (datetime)
- IsRevoked (boolean)
- RevokedAtUtc (datetime, nullable)

#### OtpRecord
- **OtpRecordId** (PK, GUID)
- **UserId** (FK → User.UserId)
- OtpHash (varchar(128))
- CreatedAtUtc (datetime)
- ExpiresAtUtc (datetime)
- IsUsed (boolean)
- UsedAtUtc (datetime, nullable)

#### OutboxMessage
- **MessageId** (PK, GUID)
- EventType (varchar(200))
- Payload (text)
- Status (enum: Pending, Sent, Failed)
- Error (varchar(2000), nullable)
- CreatedAtUtc (datetime)
- ProcessedAtUtc (datetime, nullable)

### Relationships
- User 1:1 DealerProfile (One user can have one dealer profile)
- User 1:N RefreshToken (One user can have multiple refresh tokens)
- User 1:N OtpRecord (One user can have multiple OTP records)

---

## 2. CatalogInventory Service Database

### Entities

#### Category
- **CategoryId** (PK, GUID)
- Name (varchar(140))
- **ParentCategoryId** (FK → Category.CategoryId, nullable)

#### Product
- **ProductId** (PK, GUID)
- Sku (varchar(60), Unique)
- Name (varchar(200))
- Description (varchar(2000))
- **CategoryId** (FK → Category.CategoryId)
- UnitPrice (decimal(18,2))
- MinOrderQty (int)
- TotalStock (int)
- ReservedStock (int)
- IsActive (boolean)
- ImageUrl (varchar(500), nullable)
- CreatedAtUtc (datetime)
- UpdatedAtUtc (datetime)
- AvailableStock (computed: TotalStock - ReservedStock)

#### StockTransaction
- **TxId** (PK, GUID)
- **ProductId** (FK → Product.ProductId)
- TransactionType (enum: Opening, Restock, Reserve, Release, Deduct, DeductReserved)
- Quantity (int)
- ReferenceId (varchar(120))
- CreatedAtUtc (datetime)

#### StockSubscription
- **StockSubscriptionId** (PK, GUID)
- DealerId (GUID, indexed)
- **ProductId** (FK → Product.ProductId)
- CreatedAtUtc (datetime)
- Unique constraint on (DealerId, ProductId)

#### OutboxMessage
- Same structure as IdentityAuth service

### Relationships
- Category 1:N Category (Self-referencing for parent-child hierarchy)
- Category 1:N Product (One category has many products)
- Product 1:N StockTransaction (One product has many transactions)
- Product 1:N StockSubscription (One product can have many dealer subscriptions)

---

## 3. Order Service Database

### Entities

#### OrderAggregate
- **OrderId** (PK, GUID)
- OrderNumber (varchar(32), Unique)
- DealerId (GUID, indexed)
- Status (enum: Placed, OnHold, Processing, ReadyForDispatch, InTransit, Delivered, Exception, Closed, Cancelled, ReturnRequested, ReturnApproved, ReturnRejected)
- TotalAmount (decimal(18,2))
- CreditHoldStatus (enum: NotRequired, PendingApproval, Approved, Rejected)
- PaymentMode (enum: Cash, Credit)
- PlacedAtUtc (datetime)
- CancellationReason (varchar(400), nullable)

#### OrderLine
- **OrderLineId** (PK, GUID)
- **OrderId** (FK → OrderAggregate.OrderId)
- ProductId (GUID)
- ProductName (varchar(220))
- Sku (varchar(60))
- Quantity (int)
- UnitPrice (decimal(18,2))
- LineTotal (computed: UnitPrice * Quantity)

#### OrderStatusHistory
- **HistoryId** (PK, GUID)
- **OrderId** (FK → OrderAggregate.OrderId)
- FromStatus (enum: OrderStatus)
- ToStatus (enum: OrderStatus)
- ChangedByUserId (GUID)
- ChangedByRole (varchar(40))
- ChangedAtUtc (datetime)

#### ReturnRequest
- **ReturnRequestId** (PK, GUID)
- **OrderId** (FK → OrderAggregate.OrderId, Unique)
- RequestedByDealerId (GUID)
- Reason (varchar(500))
- RequestedAtUtc (datetime)
- IsApproved (boolean)
- IsRejected (boolean)
- ReviewedAtUtc (datetime, nullable)

#### OrderSagaStateEntity
- **OrderId** (PK, GUID)
- OrderNumber (varchar(32))
- DealerId (GUID)
- CurrentState (enum: Started, InventoryReserved, PaymentProcessed, InvoiceGenerated, ShipmentCreated, Completed, Failed, Compensating, Compensated)
- StartedAtUtc (datetime)
- UpdatedAtUtc (datetime)
- CompletedAtUtc (datetime, nullable)
- LastMessage (varchar(500), nullable)

#### OutboxMessage
- Same structure as IdentityAuth service

### Relationships
- OrderAggregate 1:N OrderLine (One order has many order lines)
- OrderAggregate 1:N OrderStatusHistory (One order has many status history records)
- OrderAggregate 1:1 ReturnRequest (One order can have one return request)

---

## 4. PaymentInvoice Service Database

### Entities

#### DealerCreditAccount
- **AccountId** (PK, GUID)
- DealerId (GUID, Unique indexed)
- CreditLimit (decimal(18,2))
- CurrentOutstanding (decimal(18,2))
- AvailableCredit (computed: CreditLimit - CurrentOutstanding)

#### Invoice
- **InvoiceId** (PK, GUID)
- InvoiceNumber (varchar(40), Unique)
- OrderId (GUID)
- DealerId (GUID, indexed)
- IdempotencyKey (varchar(64), Unique)
- Subtotal (decimal(18,2))
- GstType (enum: CGST_SGST, IGST)
- GstRate (decimal(6,2))
- GstAmount (decimal(18,2))
- GrandTotal (decimal(18,2))
- PdfStoragePath (varchar(500), nullable)
- CreatedAtUtc (datetime)

#### InvoiceLine
- **InvoiceLineId** (PK, GUID)
- **InvoiceId** (FK → Invoice.InvoiceId)
- ProductId (GUID)
- ProductName (varchar(220))
- Sku (varchar(60))
- HsnCode (varchar(20))
- Quantity (int)
- UnitPrice (decimal(18,2))
- LineTotal (computed: UnitPrice * Quantity)

#### InvoiceWorkflowState
- **InvoiceId** (PK, FK → Invoice.InvoiceId)
- Status (enum: Pending, FollowUp, PromiseToPay, Overdue, Paid, WrittenOff)
- DueAtUtc (datetime)
- PromiseToPayAtUtc (datetime, nullable)
- NextFollowUpAtUtc (datetime, nullable)
- InternalNote (varchar(500))
- ReminderCount (int)
- LastReminderAtUtc (datetime, nullable)
- UpdatedAtUtc (datetime)

#### InvoiceWorkflowActivity
- **ActivityId** (PK, GUID)
- **InvoiceId** (FK → Invoice.InvoiceId)
- Type (enum: Created, ReminderSent, FollowUpScheduled, PromiseToPayRecorded, PaymentReceived, MarkedOverdue, WrittenOff)
- Message (varchar(300))
- CreatedByRole (varchar(40))
- CreatedAtUtc (datetime)

#### PaymentRecord
- **PaymentRecordId** (PK, GUID)
- OrderId (GUID)
- DealerId (GUID)
- PaymentMode (enum: Cash, Credit)
- Amount (decimal(18,2))
- ReferenceNo (varchar(100), nullable)
- CreatedAtUtc (datetime)

#### OutboxMessage
- Same structure as IdentityAuth service

### Relationships
- Invoice 1:N InvoiceLine (One invoice has many invoice lines)
- Invoice 1:1 InvoiceWorkflowState (One invoice has one workflow state)
- Invoice 1:N InvoiceWorkflowActivity (One invoice has many workflow activities)

---

## 5. LogisticsTracking Service Database

### Entities

#### Shipment
- **ShipmentId** (PK, GUID)
- OrderId (GUID)
- DealerId (GUID, indexed)
- ShipmentNumber (varchar(32), Unique)
- DeliveryAddress (varchar(500))
- City (varchar(100))
- State (varchar(100))
- PostalCode (varchar(12))
- AssignedAgentId (GUID, nullable, indexed)
- VehicleNumber (varchar(32), nullable)
- AssignmentDecisionStatus (enum: Pending, Accepted, Rejected)
- AssignmentDecisionReason (varchar(500), nullable)
- AssignmentDecisionAtUtc (datetime, nullable)
- DeliveryAgentRating (int, nullable, 1-5)
- DeliveryAgentRatingComment (varchar(500), nullable)
- DeliveryAgentRatedAtUtc (datetime, nullable)
- DeliveryAgentRatedByUserId (GUID, nullable)
- Status (enum: Created, Assigned, PickedUp, InTransit, OutForDelivery, Delivered, Returned, Exception)
- CreatedAtUtc (datetime)
- DeliveredAtUtc (datetime, nullable)

#### ShipmentEvent
- **ShipmentEventId** (PK, GUID)
- **ShipmentId** (FK → Shipment.ShipmentId)
- Status (enum: ShipmentStatus)
- Note (varchar(500))
- UpdatedByUserId (GUID)
- UpdatedByRole (varchar(40))
- CreatedAtUtc (datetime)

#### ShipmentOpsState
- **ShipmentId** (PK, FK → Shipment.ShipmentId)
- HandoverState (enum: Pending, Ready, Exception, Completed)
- HandoverExceptionReason (varchar(300), nullable)
- RetryRequired (boolean)
- RetryCount (int)
- RetryReason (varchar(300), nullable)
- NextRetryAtUtc (datetime, nullable)
- LastRetryScheduledAtUtc (datetime, nullable)
- UpdatedAtUtc (datetime)

#### OutboxMessage
- Same structure as IdentityAuth service

### Relationships
- Shipment 1:N ShipmentEvent (One shipment has many events)
- Shipment 1:1 ShipmentOpsState (One shipment has one operational state)

---

## 6. Notification Service Database

### Entities

#### NotificationMessage
- **NotificationId** (PK, GUID)
- RecipientUserId (GUID, nullable, indexed)
- Title (varchar(180))
- Body (varchar(4000))
- SourceService (varchar(100))
- EventType (varchar(100))
- Channel (enum: InApp, Email, SMS)
- Status (enum: Pending, Sent, Failed)
- CreatedAtUtc (datetime, indexed)
- SentAtUtc (datetime, nullable)
- FailureReason (varchar(1000), nullable)

#### OutboxMessage
- Same structure as IdentityAuth service

### Relationships
- No internal relationships (standalone entity)

---

## Cross-Service Relationships (Logical, Not Physical)

### Inter-Service Data Flow

```
User (IdentityAuth)
  ↓ DealerId
  ├→ OrderAggregate (Order)
  ├→ DealerCreditAccount (PaymentInvoice)
  ├→ Shipment (LogisticsTracking)
  └→ StockSubscription (CatalogInventory)

Product (CatalogInventory)
  ↓ ProductId
  ├→ OrderLine (Order)
  ├→ InvoiceLine (PaymentInvoice)
  └→ StockTransaction (CatalogInventory)

OrderAggregate (Order)
  ↓ OrderId
  ├→ Invoice (PaymentInvoice)
  ├→ Shipment (LogisticsTracking)
  ├→ PaymentRecord (PaymentInvoice)
  └→ OrderSagaStateEntity (Order)

Invoice (PaymentInvoice)
  ↓ InvoiceId
  └→ InvoiceWorkflowState (PaymentInvoice)

Shipment (LogisticsTracking)
  ↓ ShipmentId
  └→ ShipmentOpsState (LogisticsTracking)
```

---

## Database Indexes Summary

### IdentityAuth
- User.Email (Unique)
- User.(Role, Status, CreatedAtUtc)
- DealerProfile.GstNumber (Unique)
- DealerProfile.UserId (Unique)
- RefreshToken.TokenHash (Unique)

### CatalogInventory
- Product.Sku (Unique)
- Category.ParentCategoryId
- StockSubscription.(DealerId, ProductId) (Unique)

### Order
- OrderAggregate.OrderNumber (Unique)
- OrderAggregate.(DealerId, PlacedAtUtc)
- OrderAggregate.(Status, PlacedAtUtc)
- OrderStatusHistory.(OrderId, CreatedAtUtc)

### PaymentInvoice
- Invoice.InvoiceNumber (Unique)
- Invoice.IdempotencyKey (Unique)
- Invoice.(DealerId, CreatedAtUtc)
- DealerCreditAccount.DealerId (Unique)
- InvoiceWorkflowActivity.(InvoiceId, CreatedAtUtc)

### LogisticsTracking
- Shipment.ShipmentNumber (Unique)
- Shipment.(DealerId, CreatedAtUtc)
- Shipment.(AssignedAgentId, CreatedAtUtc)
- Shipment.CreatedAtUtc

### Notification
- NotificationMessage.RecipientUserId
- NotificationMessage.CreatedAtUtc
- NotificationMessage.(RecipientUserId, CreatedAtUtc)

---

## Enumerations Reference

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

### Shared (OutboxMessage)
- **OutboxStatus**: Pending, Sent, Failed

---

## Architecture Patterns

### 1. Database-per-Service Pattern
Each microservice has its own isolated database, ensuring loose coupling and independent scalability.

### 2. Outbox Pattern
Every service implements the Outbox pattern for reliable event publishing using the OutboxMessage table.

### 3. Saga Pattern
Order service implements orchestration-based saga using OrderSagaStateEntity for distributed transactions.

### 4. Aggregate Pattern (DDD)
- OrderAggregate with OrderLine, OrderStatusHistory, ReturnRequest
- Invoice with InvoiceLine
- Shipment with ShipmentEvent
- User with DealerProfile, RefreshToken, OtpRecord

### 5. Workflow State Pattern
- InvoiceWorkflowState for invoice lifecycle management
- ShipmentOpsState for shipment operational tracking
- OrderSagaStateEntity for order saga orchestration

---

## Data Consistency Strategies

### 1. Eventual Consistency
Cross-service data synchronization through domain events published via OutboxMessage tables.

### 2. Idempotency
Invoice generation uses IdempotencyKey to prevent duplicate invoice creation.

### 3. Soft Reservations
CatalogInventory uses ReservedStock to handle inventory reservations before order confirmation.

### 4. Audit Trail
- OrderStatusHistory tracks all order state transitions
- ShipmentEvent tracks all shipment updates
- InvoiceWorkflowActivity tracks all invoice workflow actions

---

## Total Database Statistics

- **Total Services**: 6
- **Total Tables**: 29
- **Total Entities**: 28
- **Total Enumerations**: 15
- **Total Relationships**: 25+ (within services)
- **Cross-Service Logical Links**: 10+

---

**Document Version**: 1.0  
**Last Updated**: April 14, 2026  
**Architecture**: Microservices with Database-per-Service Pattern
