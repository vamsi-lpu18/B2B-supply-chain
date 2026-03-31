// Matches backend IdentityAuth.Domain.Enums
export enum UserRole {
  Admin = 'Admin',
  Dealer = 'Dealer',
  Warehouse = 'Warehouse',
  Logistics = 'Logistics',
  Agent = 'Agent'
}

export enum UserStatus {
  Pending = 'Pending',
  Active = 'Active',
  Rejected = 'Rejected',
  Suspended = 'Suspended'
}

// Matches backend Order.Domain.Enums
export enum OrderStatus {
  Placed = 0,
  OnHold = 1,
  Processing = 2,
  ReadyForDispatch = 3,
  InTransit = 4,
  Exception = 5,
  Delivered = 6,
  ReturnRequested = 7,
  ReturnApproved = 8,
  ReturnRejected = 9,
  Closed = 10,
  Cancelled = 11
}

export enum PaymentMode {
  COD = 0,
  PrePaid = 1
}

export enum CreditHoldStatus {
  NotRequired = 0,
  PendingApproval = 1,
  Approved = 2,
  Rejected = 3
}

// Matches backend LogisticsTracking.Domain.Enums
export enum ShipmentStatus {
  Created = 0,
  Assigned = 1,
  PickedUp = 2,
  InTransit = 3,
  OutForDelivery = 4,
  Delivered = 5,
  DeliveryFailed = 6,
  Returned = 7
}

// Matches backend Notification.Domain.Enums
export enum NotificationChannel {
  InApp = 0,
  Email = 1,
  Sms = 2,
  Push = 3
}

export enum NotificationStatus {
  Pending = 0,
  Sent = 1,
  Failed = 2
}

// Matches backend PaymentInvoice.Domain.Enums
export enum GstType {
  IGST = 0,
  CGST_SGST = 1
}

// ─── Display helpers ─────────────────────────────────────────────────────────
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Placed]:          'Placed',
  [OrderStatus.OnHold]:          'On Hold',
  [OrderStatus.Processing]:      'Processing',
  [OrderStatus.ReadyForDispatch]:'Ready for Dispatch',
  [OrderStatus.InTransit]:       'In Transit',
  [OrderStatus.Exception]:       'Exception',
  [OrderStatus.Delivered]:       'Delivered',
  [OrderStatus.ReturnRequested]: 'Return Requested',
  [OrderStatus.ReturnApproved]:  'Return Approved',
  [OrderStatus.ReturnRejected]:  'Return Rejected',
  [OrderStatus.Closed]:          'Closed',
  [OrderStatus.Cancelled]:       'Cancelled'
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  [OrderStatus.Placed]:          'badge-primary',
  [OrderStatus.OnHold]:          'badge-warning',
  [OrderStatus.Processing]:      'badge-warning',
  [OrderStatus.ReadyForDispatch]:'badge-info',
  [OrderStatus.InTransit]:       'badge-info',
  [OrderStatus.Exception]:       'badge-error',
  [OrderStatus.Delivered]:       'badge-success',
  [OrderStatus.ReturnRequested]: 'badge-warning',
  [OrderStatus.ReturnApproved]:  'badge-success',
  [OrderStatus.ReturnRejected]:  'badge-error',
  [OrderStatus.Closed]:          'badge-neutral',
  [OrderStatus.Cancelled]:       'badge-error'
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  [ShipmentStatus.Created]:        'Created',
  [ShipmentStatus.Assigned]:       'Assigned',
  [ShipmentStatus.PickedUp]:       'Picked Up',
  [ShipmentStatus.InTransit]:      'In Transit',
  [ShipmentStatus.OutForDelivery]: 'Out for Delivery',
  [ShipmentStatus.Delivered]:      'Delivered',
  [ShipmentStatus.DeliveryFailed]: 'Delivery Failed',
  [ShipmentStatus.Returned]:       'Returned'
};

export const SHIPMENT_STATUS_BADGE: Record<ShipmentStatus, string> = {
  [ShipmentStatus.Created]:        'badge-neutral',
  [ShipmentStatus.Assigned]:       'badge-info',
  [ShipmentStatus.PickedUp]:       'badge-info',
  [ShipmentStatus.InTransit]:      'badge-primary',
  [ShipmentStatus.OutForDelivery]: 'badge-warning',
  [ShipmentStatus.Delivered]:      'badge-success',
  [ShipmentStatus.DeliveryFailed]: 'badge-error',
  [ShipmentStatus.Returned]:       'badge-neutral'
};

/** Valid next statuses for order status transitions */
export const ORDER_STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.Placed]:          [OrderStatus.OnHold, OrderStatus.Processing, OrderStatus.Cancelled],
  [OrderStatus.OnHold]:          [OrderStatus.Processing, OrderStatus.Cancelled],
  [OrderStatus.Processing]:      [OrderStatus.ReadyForDispatch, OrderStatus.Cancelled],
  [OrderStatus.ReadyForDispatch]:[OrderStatus.InTransit],
  [OrderStatus.InTransit]:       [OrderStatus.Exception, OrderStatus.Delivered],
  [OrderStatus.Exception]:       [OrderStatus.InTransit, OrderStatus.Cancelled],
  [OrderStatus.Delivered]:       [OrderStatus.Closed],
  [OrderStatus.ReturnRequested]: [OrderStatus.ReturnApproved, OrderStatus.ReturnRejected],
  [OrderStatus.ReturnApproved]:  [OrderStatus.Closed],
  [OrderStatus.ReturnRejected]:  [OrderStatus.Closed],
};
