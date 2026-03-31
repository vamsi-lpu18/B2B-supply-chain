# Email Trigger Matrix

This document maps email sending conditions that are currently implemented in the platform.

## How Email Is Triggered

1. Business services write integration events to outbox.
2. Outbox dispatchers publish to RabbitMQ exchange `supplychain.events`.
3. Notification consumer ingests routing keys as `(sourceService, eventType)`.
4. Notification channel policy marks selected events as `Email`.
5. Notification email dispatcher sends pending email notifications using SMTP.

## Implemented Email Conditions

| Source Service | Event Type | When It Happens | Recipient Resolution | Email Sent |
| --- | --- | --- | --- | --- |
| identity | dealerregistered | Dealer self-registration submitted | Payload `Email` | Yes |
| identity | passwordresetrequested | Dealer/user requests forgot password OTP | Payload `Email` | Yes |
| identity | passwordresetcompleted | Password reset completes successfully | Payload `Email` | Yes |
| identity | dealerapproved | Admin approves dealer account | Payload `Email` | Yes |
| identity | dealerrejected | Admin rejects dealer account | Payload `Email` | Yes |
| payment | dealercreditlimitupdated | Dealer credit limit updated in Payment service | `RecipientUserId` -> Identity internal contact lookup | Yes |
| payment | invoicegenerated | Invoice generated for dealer order | `RecipientUserId` -> Identity internal contact lookup | Yes |
| order | adminapprovalrequired | Order exceeds available credit and needs admin decision | `RecipientUserId` -> Identity internal contact lookup | Yes |
| order | orderplaced | Order accepted directly after credit check | `RecipientUserId` -> Identity internal contact lookup | Yes |
| order | orderapproved | On-hold order approved by admin | `RecipientUserId` -> Identity internal contact lookup | Yes |
| order | ordercancelled | Dealer/admin cancellation or rejection flow sets cancelled | `RecipientUserId` -> Identity internal contact lookup | Yes |
| order | returnrequested | Dealer requests return for an order | `RecipientUserId` -> Identity internal contact lookup | Yes |
| order | order* (dynamic status updates) | Any status transition emitted as `Order{Status}` | `RecipientUserId` -> Identity internal contact lookup | Yes |
| logistics | shipmentcreated | Warehouse/logistics creates shipment | `RecipientUserId` -> Identity internal contact lookup | Yes |
| logistics | shipmentassigned | Shipment assigned to delivery agent | `RecipientUserId` -> Identity internal contact lookup | Yes |
| logistics | shipmentstatusupdated | Shipment status changed with note | `RecipientUserId` -> Identity internal contact lookup | Yes |
| notification | manual notification with channel=email | Admin manually creates notification and chooses email channel | Depends on recipient ID or payload `Email` | Yes |

## Non-Email Event Conditions (Current Behavior)

These events are ingested as notifications but remain `InApp` channel by default:

- catalog product and stock events (`productcreated`, `productupdated`, `productdeactivated`, `stockrestored`, `stocksoftlocked`, `stockdeducted`, `stocksoftlockreleased`)
- any other event not explicitly mapped to email

## Notes

- Identity and Catalog now publish outbox events to RabbitMQ through dedicated outbox dispatchers.
- Email dispatch requires `Email:Enabled=true` in Notification settings.
- For events without payload email, Notification resolves recipient email from Identity internal endpoint using `X-Internal-Api-Key`.
