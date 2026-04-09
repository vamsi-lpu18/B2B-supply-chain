import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { PaymentApiService } from '../api/payment-api.service';
import {
  InvoiceWorkflowStateDto,
  InvoiceWorkflowStatus,
  UpsertInvoiceWorkflowRequest
} from '../models/payment.models';

export type { InvoiceWorkflowStatus } from '../models/payment.models';

export type InvoiceWorkflowState = InvoiceWorkflowStateDto;

export interface InvoiceWorkflowPatch {
  status?: InvoiceWorkflowStatus;
  dueAtUtc?: string;
  promiseToPayAtUtc?: string | null;
  nextFollowUpAtUtc?: string | null;
  internalNote?: string;
  reminderCount?: number;
  lastReminderAtUtc?: string | null;
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class InvoiceWorkflowService {
  private readonly paymentApi = inject(PaymentApiService);

  get(invoiceId: string, createdAtUtc: string): Observable<InvoiceWorkflowState> {
    return this.paymentApi.getInvoiceWorkflow(invoiceId).pipe(
      map(state => this.normalizeState(state, createdAtUtc)),
      catchError(() => {
        const fallback = this.createDefault(invoiceId, createdAtUtc);
        return this.paymentApi
          .upsertInvoiceWorkflow(invoiceId, this.toUpsertRequest(fallback))
          .pipe(
            map(state => this.normalizeState(state, createdAtUtc)),
            catchError(() => of(fallback))
          );
      })
    );
  }

  getDealerWorkflows(dealerId: string): Observable<InvoiceWorkflowState[]> {
    return this.paymentApi.getDealerInvoiceWorkflows(dealerId).pipe(
      map(states => states.map(state => this.normalizeState(state))),
      catchError(() => of([]))
    );
  }

  update(invoiceId: string, createdAtUtc: string, patch: InvoiceWorkflowPatch): Observable<InvoiceWorkflowState> {
    return this.get(invoiceId, createdAtUtc).pipe(
      switchMap(current => {
        const next: InvoiceWorkflowState = {
          ...current,
          status: patch.status ? this.normalizeStatus(patch.status) : current.status,
          dueAtUtc: patch.dueAtUtc ? this.normalizeDueAtUtc(patch.dueAtUtc, current.dueAtUtc) : current.dueAtUtc,
          promiseToPayAtUtc: patch.promiseToPayAtUtc !== undefined
            ? this.normalizeOptionalIso(patch.promiseToPayAtUtc)
            : current.promiseToPayAtUtc,
          nextFollowUpAtUtc: patch.nextFollowUpAtUtc !== undefined
            ? this.normalizeOptionalIso(patch.nextFollowUpAtUtc)
            : current.nextFollowUpAtUtc,
          internalNote: patch.internalNote !== undefined ? this.normalizeNote(patch.internalNote) : current.internalNote,
          reminderCount: patch.reminderCount !== undefined ? this.normalizeReminderCount(patch.reminderCount) : current.reminderCount,
          lastReminderAtUtc: patch.lastReminderAtUtc !== undefined ? this.normalizeOptionalIso(patch.lastReminderAtUtc) : current.lastReminderAtUtc,
          updatedAtUtc: new Date().toISOString()
        };

        return this.paymentApi.upsertInvoiceWorkflow(invoiceId, this.toUpsertRequest(next)).pipe(
          map(state => this.normalizeState(state, createdAtUtc))
        );
      })
    );
  }

  markReminderSent(invoiceId: string, createdAtUtc: string): Observable<InvoiceWorkflowState> {
    return this.get(invoiceId, createdAtUtc).pipe(
      switchMap(previous => {
        const nextReminderCount = previous.reminderCount + 1;
        const now = new Date();
        const nextFollowUp = new Date(now.getTime() + TWO_DAYS_MS).toISOString();

        return this.update(invoiceId, createdAtUtc, {
          status: previous.status === 'paid' ? 'paid' : 'reminder-sent',
          promiseToPayAtUtc: null,
          reminderCount: nextReminderCount,
          lastReminderAtUtc: now.toISOString(),
          nextFollowUpAtUtc: previous.status === 'paid' ? null : nextFollowUp
        });
      })
    );
  }

  setPromiseToPay(
    invoiceId: string,
    createdAtUtc: string,
    promiseToPayAtUtc: string,
    internalNote?: string
  ): Observable<InvoiceWorkflowState> {
    const normalizedPromiseAtUtc = this.normalizeDueAtUtc(promiseToPayAtUtc, new Date().toISOString());

    return this.update(invoiceId, createdAtUtc, {
      status: 'promise-to-pay',
      promiseToPayAtUtc: normalizedPromiseAtUtc,
      nextFollowUpAtUtc: normalizedPromiseAtUtc,
      internalNote
    });
  }

  computeAutomationPatch(state: InvoiceWorkflowState): InvoiceWorkflowPatch | null {
    const now = Date.now();

    if (state.status === 'promise-to-pay' && state.promiseToPayAtUtc) {
      const promiseAt = new Date(state.promiseToPayAtUtc).getTime();
      if (Number.isFinite(promiseAt) && promiseAt < now) {
        const nextFollowUpAtUtc = new Date(now + TWO_DAYS_MS).toISOString();
        return {
          status: 'reminder-sent',
          reminderCount: state.reminderCount + 1,
          lastReminderAtUtc: new Date(now).toISOString(),
          nextFollowUpAtUtc
        };
      }
    }

    if (state.status === 'reminder-sent' && !state.nextFollowUpAtUtc) {
      const nextFollowUpAtUtc = new Date(now + TWO_DAYS_MS).toISOString();
      return { nextFollowUpAtUtc };
    }

    return null;
  }

  private createDefault(invoiceId: string, createdAtUtc: string): InvoiceWorkflowState {
    const created = new Date(createdAtUtc);
    const safeCreated = Number.isFinite(created.getTime()) ? created : new Date();
    const due = new Date(safeCreated);
    due.setDate(due.getDate() + 7);

    return {
      invoiceId,
      status: 'pending',
      dueAtUtc: due.toISOString(),
      promiseToPayAtUtc: undefined,
      nextFollowUpAtUtc: undefined,
      internalNote: '',
      reminderCount: 0,
      lastReminderAtUtc: undefined,
      updatedAtUtc: new Date().toISOString()
    };
  }

  private normalizeState(state: InvoiceWorkflowStateDto, createdAtUtc?: string): InvoiceWorkflowState {
    return {
      invoiceId: String(state.invoiceId ?? ''),
      status: this.normalizeStatus(state.status),
      dueAtUtc: this.normalizeDueAtUtc(
        String(state.dueAtUtc ?? ''),
        createdAtUtc ? this.createDefault(String(state.invoiceId ?? ''), createdAtUtc).dueAtUtc : new Date().toISOString()
      ),
      promiseToPayAtUtc: this.normalizeOptionalIso(state.promiseToPayAtUtc),
      nextFollowUpAtUtc: this.normalizeOptionalIso(state.nextFollowUpAtUtc),
      internalNote: this.normalizeNote(String(state.internalNote ?? '')),
      reminderCount: this.normalizeReminderCount(Number(state.reminderCount ?? 0)),
      lastReminderAtUtc: this.normalizeOptionalIso(state.lastReminderAtUtc),
      updatedAtUtc: this.normalizeDueAtUtc(String(state.updatedAtUtc ?? ''), new Date().toISOString())
    };
  }

  private toUpsertRequest(state: InvoiceWorkflowState): UpsertInvoiceWorkflowRequest {
    return {
      status: state.status,
      dueAtUtc: state.dueAtUtc,
      promiseToPayAtUtc: state.promiseToPayAtUtc ?? null,
      nextFollowUpAtUtc: state.nextFollowUpAtUtc ?? null,
      internalNote: this.normalizeNote(state.internalNote),
      reminderCount: this.normalizeReminderCount(state.reminderCount),
      lastReminderAtUtc: state.lastReminderAtUtc ?? null
    };
  }

  private normalizeStatus(value: unknown): InvoiceWorkflowStatus {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (
      normalized === 'pending' ||
      normalized === 'reminder-sent' ||
      normalized === 'promise-to-pay' ||
      normalized === 'paid' ||
      normalized === 'disputed' ||
      normalized === 'escalated'
    ) {
      return normalized;
    }

    return 'pending';
  }

  private normalizeDueAtUtc(value: string, fallbackIso: string): string {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toISOString();
    }

    const fallback = new Date(fallbackIso);
    return Number.isFinite(fallback.getTime()) ? fallback.toISOString() : new Date().toISOString();
  }

  private normalizeNote(value: string): string {
    return value.trim().slice(0, 500);
  }

  private normalizeReminderCount(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }

    return Math.min(99, Math.floor(value));
  }

  private normalizeOptionalIso(value: unknown): string | undefined {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return undefined;
    }

    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) {
      return undefined;
    }

    return date.toISOString();
  }
}
