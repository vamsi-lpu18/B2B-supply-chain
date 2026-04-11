# Supply Chain Platform UML Diagram Pack

## 1. Use Case View

```mermaid
flowchart LR
    Dealer((Dealer))
    Admin((Admin))
    Warehouse((Warehouse))
    Logistics((Logistics))
    Agent((Agent))

    UC1[Register and Login]
    UC2[Browse Catalog]
    UC3[Place Order]
    UC4[Approve Dealer]
    UC5[Manage Product and Inventory]
    UC6[Manage Order Lifecycle]
    UC7[Execute Shipment Lifecycle]
    UC8[Generate Invoice and Track Collection]
    UC9[Read and Process Notifications]

    Dealer --> UC1
    Dealer --> UC2
    Dealer --> UC3
    Dealer --> UC8
    Dealer --> UC9

    Admin --> UC4
    Admin --> UC5
    Admin --> UC6
    Admin --> UC7
    Admin --> UC8
    Admin --> UC9

    Warehouse --> UC5
    Warehouse --> UC6
    Warehouse --> UC7

    Logistics --> UC6
    Logistics --> UC7

    Agent --> UC7
```

## 2. Component Diagram

```mermaid
flowchart TB
    FE[Angular Frontend]
    GW[Ocelot Gateway]

    IA[IdentityAuth Service]
    CI[CatalogInventory Service]
    OR[Order Service]
    LT[LogisticsTracking Service]
    PI[PaymentInvoice Service]
    NO[Notification Service]

    SQL[(SQL Server Databases)]
    RMQ[(RabbitMQ)]
    REDIS[(Redis)]
    SMTP[(SMTP Server)]
    RZP[(Razorpay)]

    FE --> GW
    GW --> IA
    GW --> CI
    GW --> OR
    GW --> LT
    GW --> PI
    GW --> NO

    IA --> SQL
    CI --> SQL
    OR --> SQL
    LT --> SQL
    PI --> SQL
    NO --> SQL

    IA --> REDIS

    IA -. publishes outbox .-> RMQ
    CI -. publishes outbox .-> RMQ
    OR -. publishes outbox .-> RMQ
    LT -. publishes outbox .-> RMQ
    PI -. publishes outbox .-> RMQ

    RMQ --> NO
    NO --> SMTP
    PI --> RZP
```

## 3. Deployment Diagram

```mermaid
flowchart LR
    User[(Browser User)] --> Frontend[Angular App :4200]
    Frontend --> Gateway[Ocelot Gateway :5000]

    Gateway --> S1[IdentityAuth API :8001]
    Gateway --> S2[CatalogInventory API :8002]
    Gateway --> S3[Order API :8003]
    Gateway --> S4[LogisticsTracking API :8004]
    Gateway --> S5[PaymentInvoice API :8005]
    Gateway --> S6[Notification API :8006]

    S1 --> DB1[(IdentityAuth DB)]
    S2 --> DB2[(CatalogInventory DB)]
    S3 --> DB3[(Order DB)]
    S4 --> DB4[(LogisticsTracking DB)]
    S5 --> DB5[(PaymentInvoice DB)]
    S6 --> DB6[(Notification DB)]

    S1 --> Redis[(Redis)]
    S1 --> MQ[(RabbitMQ)]
    S2 --> MQ
    S3 --> MQ
    S4 --> MQ
    S5 --> MQ
    MQ --> S6
```

## 4. Sequence Diagram - Dealer Onboarding

```mermaid
sequenceDiagram
    autonumber
    participant D as Dealer
    participant FE as Frontend
    participant GW as Gateway
    participant IA as IdentityAuth
    participant AD as Admin
    participant PI as PaymentInvoice
    participant NO as Notification

    D->>FE: Submit registration form
    FE->>GW: POST /identity/api/auth/register
    GW->>IA: Forward register request
    IA-->>GW: 201 Created (Pending dealer)
    GW-->>FE: Registration accepted

    AD->>FE: Review dealer
    FE->>GW: PUT /identity/api/admin/dealers/{id}/approve
    GW->>IA: Approve dealer
    IA->>PI: Internal credit-limit update
    IA->>NO: Publish/ingest approval notification event
    IA-->>GW: 200 Dealer approved
    GW-->>FE: Success
```

## 5. Sequence Diagram - Order and Hold Path

```mermaid
sequenceDiagram
    autonumber
    participant D as Dealer
    participant FE as Frontend
    participant GW as Gateway
    participant OR as Order Service
    participant PI as PaymentInvoice
    participant MQ as RabbitMQ
    participant NO as Notification
    participant AD as Admin

    D->>FE: Checkout
    FE->>GW: POST /orders/api/orders
    GW->>OR: Create order
    OR->>PI: GET credit-check

    alt Credit approved
        OR->>OR: Status = Processing
        OR->>MQ: Publish order.placed
        MQ->>NO: Notify dealer
        OR-->>GW: 201 Created
        GW-->>FE: Order placed
    else Credit not approved
        OR->>OR: Status = OnHold
        OR->>MQ: Publish order.adminapprovalrequired
        MQ->>NO: Notify admin
        OR-->>GW: 201 Created (OnHold)
        GW-->>FE: Await manual approval

        AD->>FE: Approve hold
        FE->>GW: PUT /orders/api/admin/orders/{id}/approve-hold
        GW->>OR: Approve hold
        OR->>MQ: Publish order.approved
        MQ->>NO: Notify dealer
    end
```

## 6. Class Diagram (Core Domain Snapshot)

```mermaid
classDiagram
    class User {
      +Guid UserId
      +string Email
      +string Role
      +string Status
      +DateTime CreatedAtUtc
    }

    class DealerProfile {
      +Guid DealerProfileId
      +Guid UserId
      +string BusinessName
      +string GstNumber
      +decimal CreditLimit
      +bool IsApproved
    }

    class Product {
      +Guid ProductId
      +string Sku
      +string Name
      +decimal UnitPrice
      +int AvailableQuantity
      +bool IsActive
    }

    class Order {
      +Guid OrderId
      +Guid DealerId
      +OrderStatus Status
      +DateTime PlacedAtUtc
      +decimal TotalAmount
    }

    class OrderLine {
      +Guid OrderLineId
      +Guid OrderId
      +Guid ProductId
      +int Quantity
      +decimal UnitPrice
    }

    class Shipment {
      +Guid ShipmentId
      +Guid OrderId
      +Guid DealerId
      +Guid AssignedAgentId
      +ShipmentStatus Status
    }

    class Invoice {
      +Guid InvoiceId
      +Guid OrderId
      +Guid DealerId
      +decimal GrandTotal
      +DateTime CreatedAtUtc
    }

    class NotificationMessage {
      +Guid NotificationId
      +Guid RecipientUserId
      +string Channel
      +string Status
      +DateTime CreatedAtUtc
    }

    User "1" --> "0..1" DealerProfile : owns
    Order "1" --> "1..*" OrderLine : contains
    Order "1" --> "0..1" Shipment : tracks
    Order "1" --> "0..1" Invoice : billed as
    User "1" --> "0..*" NotificationMessage : receives
```

## 7. State Diagram - Order Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Placed
    Placed --> OnHold
    Placed --> Processing
    Placed --> Cancelled

    OnHold --> Processing
    OnHold --> Cancelled

    Processing --> ReadyForDispatch
    Processing --> Cancelled

    ReadyForDispatch --> InTransit
    ReadyForDispatch --> Cancelled

    InTransit --> Delivered
    InTransit --> Exception

    Exception --> InTransit
    Exception --> Cancelled

    Delivered --> Closed
    Delivered --> ReturnRequested

    ReturnRequested --> ReturnApproved
    ReturnRequested --> ReturnRejected

    ReturnApproved --> Closed
    ReturnRejected --> Closed

    Closed --> [*]
    Cancelled --> [*]
```

## 8. Activity Diagram - Invoice Collection Workflow

```mermaid
flowchart TD
    A[Start: Invoice generated] --> B[Create default workflow state]
    B --> C{Dealer payment done?}

    C -- Yes --> D[Mark paid]
    D --> Z[End]

    C -- No --> E[Reminder sent]
    E --> F{Promise to pay received?}

    F -- Yes --> G[Set promise-to-pay date]
    G --> H{Promise date elapsed?}
    H -- No --> I[Wait until promise date]
    I --> H
    H -- Yes --> J[Auto move to reminder-sent and increment reminder count]
    J --> K{Exceeded attempts or dispute?}

    F -- No --> K
    K -- No --> E
    K -- Yes --> L[Escalate or mark disputed]
    L --> Z
```
