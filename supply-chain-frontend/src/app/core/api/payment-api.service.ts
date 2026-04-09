import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import {
  CreditCheckResponse, PaymentUpdateCreditLimitRequest, SeedDealerAccountRequest,
  SettleOutstandingRequest, GenerateInvoiceRequest, InvoiceDto, DealerCreditAccountDto,
  CreateGatewayOrderRequest, GatewayOrderDto, VerifyGatewayPaymentRequest, GatewayPaymentVerificationDto,
  InvoiceWorkflowStateDto, UpsertInvoiceWorkflowRequest, InvoiceWorkflowActivityDto, AddInvoiceWorkflowActivityRequest
} from '../models/payment.models';
import { findMockInvoiceById, mockInvoicesForDealer } from '../mocks/payment-invoice.mocks';

@Injectable({ providedIn: 'root' })
export class PaymentApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/payments/api/payment';

  seedDealerAccount(dealerId: string, req: SeedDealerAccountRequest): Observable<DealerCreditAccountDto> {
    return this.http.post<DealerCreditAccountDto>(`${this.base}/dealers/${dealerId}/account`, req);
  }

  checkCredit(dealerId: string, amount: number): Observable<CreditCheckResponse> {
    const params = new HttpParams().set('amount', amount);
    return this.http.get<CreditCheckResponse>(`${this.base}/dealers/${dealerId}/credit-check`, { params });
  }

  updateCreditLimit(dealerId: string, req: PaymentUpdateCreditLimitRequest): Observable<DealerCreditAccountDto> {
    return this.http.put<DealerCreditAccountDto>(`${this.base}/dealers/${dealerId}/credit-limit`, req);
  }

  settleOutstanding(dealerId: string, req: SettleOutstandingRequest): Observable<DealerCreditAccountDto> {
    return this.http.post<DealerCreditAccountDto>(`${this.base}/dealers/${dealerId}/settlements`, req);
  }

  createGatewayOrder(req: CreateGatewayOrderRequest): Observable<GatewayOrderDto> {
    return this.http.post<GatewayOrderDto>(`${this.base}/gateway/orders`, req);
  }

  verifyGatewayPayment(req: VerifyGatewayPaymentRequest): Observable<GatewayPaymentVerificationDto> {
    return this.http.post<GatewayPaymentVerificationDto>(`${this.base}/gateway/verify`, req);
  }

  generateInvoice(req: GenerateInvoiceRequest): Observable<InvoiceDto> {
    return this.http.post<InvoiceDto>(`${this.base}/invoices`, req);
  }

  getInvoiceById(invoiceId: string): Observable<InvoiceDto> {
    return this.http.get<InvoiceDto>(`${this.base}/invoices/${invoiceId}`).pipe(
      catchError(() => {
        const mock = findMockInvoiceById(invoiceId);
        return mock
          ? of(mock)
          : throwError(() => new Error(`Invoice ${invoiceId} not found`));
      })
    );
  }

  getDealerInvoices(dealerId: string): Observable<InvoiceDto[]> {
    return this.http.get<InvoiceDto[]>(`${this.base}/dealers/${dealerId}/invoices`).pipe(
      map(invoices => invoices.length > 0 ? invoices : mockInvoicesForDealer(dealerId)),
      catchError(() => of(mockInvoicesForDealer(dealerId)))
    );
  }

  downloadInvoice(invoiceId: string): Observable<Blob> {
    return this.http.get(`${this.base}/invoices/${invoiceId}/download`, { responseType: 'blob' });
  }

  getInvoiceWorkflow(invoiceId: string): Observable<InvoiceWorkflowStateDto> {
    return this.http.get<InvoiceWorkflowStateDto>(`${this.base}/invoices/${invoiceId}/workflow`);
  }

  getDealerInvoiceWorkflows(dealerId: string): Observable<InvoiceWorkflowStateDto[]> {
    return this.http.get<InvoiceWorkflowStateDto[]>(`${this.base}/dealers/${dealerId}/invoice-workflows`);
  }

  upsertInvoiceWorkflow(invoiceId: string, req: UpsertInvoiceWorkflowRequest): Observable<InvoiceWorkflowStateDto> {
    return this.http.put<InvoiceWorkflowStateDto>(`${this.base}/invoices/${invoiceId}/workflow`, req);
  }

  getInvoiceWorkflowActivities(invoiceId: string): Observable<InvoiceWorkflowActivityDto[]> {
    return this.http.get<InvoiceWorkflowActivityDto[]>(`${this.base}/invoices/${invoiceId}/workflow-activities`);
  }

  addInvoiceWorkflowActivity(invoiceId: string, req: AddInvoiceWorkflowActivityRequest): Observable<InvoiceWorkflowActivityDto> {
    return this.http.post<InvoiceWorkflowActivityDto>(`${this.base}/invoices/${invoiceId}/workflow-activities`, req);
  }
}
