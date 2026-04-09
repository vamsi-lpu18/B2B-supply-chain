import { PaymentMode } from './enums';

export interface CreditCheckResponse {
  approved: boolean;
  availableCredit: number;
  creditLimit: number;
  currentOutstanding: number;
}

export interface PaymentUpdateCreditLimitRequest {
  creditLimit: number;
}

export interface SeedDealerAccountRequest {
  initialCreditLimit?: number;
}

export interface SettleOutstandingRequest {
  amount: number;
  referenceNo?: string;
}

export interface InvoiceLineInput {
  productId: string;
  productName: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
}

export interface GenerateInvoiceRequest {
  orderId: string;
  dealerId: string;
  isInterstate: boolean;
  paymentMode: PaymentMode;
  lines: InvoiceLineInput[];
}

export interface InvoiceLineDto {
  invoiceLineId: string;
  productId: string;
  productName: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceDto {
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  dealerId: string;
  idempotencyKey: string;
  gstType: string;
  gstRate: number;
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  pdfStoragePath: string;
  createdAtUtc: string;
  lines: InvoiceLineDto[];
}

export interface DealerCreditAccountDto {
  accountId: string;
  dealerId: string;
  creditLimit: number;
  currentOutstanding: number;
  availableCredit: number;
}

export interface CreateGatewayOrderRequest {
  amount: number;
  currency?: string;
  description?: string;
  receipt?: string;
}

export interface GatewayOrderDto {
  provider: string;
  keyId: string;
  gatewayOrderId: string;
  amountMinor: number;
  amount: number;
  currency: string;
  receipt: string;
  description: string;
  testMode: boolean;
}

export interface VerifyGatewayPaymentRequest {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
  amount: number;
  currency?: string;
  receipt?: string;
  description?: string;
}

export interface GatewayPaymentVerificationDto {
  verified: boolean;
  provider: string;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  failureReason?: string | null;
}

export type InvoiceWorkflowStatus =
  | 'pending'
  | 'reminder-sent'
  | 'promise-to-pay'
  | 'paid'
  | 'disputed'
  | 'escalated';

export interface InvoiceWorkflowStateDto {
  invoiceId: string;
  status: InvoiceWorkflowStatus;
  dueAtUtc: string;
  promiseToPayAtUtc?: string;
  nextFollowUpAtUtc?: string;
  internalNote: string;
  reminderCount: number;
  lastReminderAtUtc?: string;
  updatedAtUtc: string;
}

export interface UpsertInvoiceWorkflowRequest {
  status: InvoiceWorkflowStatus;
  dueAtUtc: string;
  promiseToPayAtUtc?: string | null;
  nextFollowUpAtUtc?: string | null;
  internalNote?: string;
  reminderCount: number;
  lastReminderAtUtc?: string | null;
}

export type InvoiceWorkflowActivityType =
  | 'workflow-saved'
  | 'reminder-sent'
  | 'promise-to-pay'
  | 'marked-paid'
  | 'marked-disputed'
  | 'escalated'
  | 'auto-follow-up';

export interface InvoiceWorkflowActivityDto {
  activityId: string;
  invoiceId: string;
  type: InvoiceWorkflowActivityType;
  message: string;
  createdByRole: string;
  createdAtUtc: string;
}

export interface AddInvoiceWorkflowActivityRequest {
  type: InvoiceWorkflowActivityType;
  message: string;
  createdByRole?: string;
}
