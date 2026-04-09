import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { PaymentApiService } from '../api/payment-api.service';
import {
  AddInvoiceWorkflowActivityRequest,
  InvoiceWorkflowActivityDto,
  InvoiceWorkflowActivityType
} from '../models/payment.models';

export type InvoiceWorkflowActivity = InvoiceWorkflowActivityDto;

@Injectable({ providedIn: 'root' })
export class InvoiceWorkflowActivityService {
  private readonly paymentApi = inject(PaymentApiService);

  list(invoiceId: string): Observable<InvoiceWorkflowActivity[]> {
    return this.paymentApi.getInvoiceWorkflowActivities(invoiceId).pipe(
      map(items => items
        .map(item => this.normalize(item))
        .sort((left, right) => new Date(right.createdAtUtc).getTime() - new Date(left.createdAtUtc).getTime())),
      catchError(() => of([]))
    );
  }

  add(
    invoiceId: string,
    type: InvoiceWorkflowActivityType,
    message: string,
    createdByRole: string
  ): Observable<InvoiceWorkflowActivity> {
    const request: AddInvoiceWorkflowActivityRequest = {
      type: this.normalizeType(type),
      message: this.normalizeMessage(message),
      createdByRole: String(createdByRole || 'System').trim() || 'System'
    };

    return this.paymentApi.addInvoiceWorkflowActivity(invoiceId, request).pipe(
      map(item => this.normalize(item))
    );
  }

  private normalize(item: InvoiceWorkflowActivityDto): InvoiceWorkflowActivity {
    return {
      activityId: String(item.activityId ?? ''),
      invoiceId: String(item.invoiceId ?? ''),
      type: this.normalizeType(item.type),
      message: this.normalizeMessage(String(item.message ?? '')),
      createdByRole: String(item.createdByRole ?? 'System').trim() || 'System',
      createdAtUtc: this.normalizeIso(String(item.createdAtUtc ?? new Date().toISOString()))
    };
  }

  private normalizeType(value: unknown): InvoiceWorkflowActivityType {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (
      normalized === 'workflow-saved' ||
      normalized === 'reminder-sent' ||
      normalized === 'promise-to-pay' ||
      normalized === 'marked-paid' ||
      normalized === 'marked-disputed' ||
      normalized === 'escalated' ||
      normalized === 'auto-follow-up'
    ) {
      return normalized;
    }

    return 'workflow-saved';
  }

  private normalizeIso(value: string): string {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toISOString();
    }

    return new Date().toISOString();
  }

  private normalizeMessage(value: string): string {
    return value.trim().slice(0, 300) || 'Workflow updated';
  }
}
