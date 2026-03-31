import { CreditHoldStatus, OrderStatus, PaymentMode } from './enums';

export interface CreateOrderLineRequest {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  minOrderQty: number;
}

export interface CreateOrderRequest {
  paymentMode: PaymentMode;
  idempotencyKey?: string;
  lines: CreateOrderLineRequest[];
}

export interface CancelOrderRequest {
  reason: string;
}

export interface UpdateOrderStatusRequest {
  newStatus: OrderStatus;
}

export interface ReturnRequestDto {
  reason: string;
}

export interface AdminDecisionRequest {
  reason?: string;
}

export interface OrderLineDto {
  orderLineId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderStatusHistoryDto {
  historyId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedByUserId: string;
  changedByRole: string;
  changedAtUtc: string;
}

export interface ReturnInfoDto {
  returnRequestId: string;
  reason: string;
  requestedAtUtc: string;
  isApproved: boolean;
  isRejected: boolean;
  reviewedAtUtc?: string;
}

export interface OrderDto {
  orderId: string;
  orderNumber: string;
  dealerId: string;
  status: OrderStatus;
  creditHoldStatus: CreditHoldStatus;
  paymentMode: PaymentMode;
  totalAmount: number;
  placedAtUtc: string;
  cancellationReason?: string;
  lines: OrderLineDto[];
  statusHistory: OrderStatusHistoryDto[];
  returnRequest?: ReturnInfoDto;
}

export interface OrderListItemDto {
  orderId: string;
  orderNumber: string;
  dealerId: string;
  status: OrderStatus;
  totalAmount: number;
  placedAtUtc: string;
}
