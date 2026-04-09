import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of } from 'rxjs';
import { PaymentApiService } from '../../../core/api/payment-api.service';
import { NotificationApiService } from '../../../core/api/notification-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { InvoiceWorkflowService, InvoiceWorkflowState, InvoiceWorkflowStatus } from '../../../core/services/invoice-workflow.service';
import { InvoiceWorkflowActivityService } from '../../../core/services/invoice-workflow-activity.service';
import { InvoiceDto } from '../../../core/models/payment.models';
import { NotificationChannel, UserRole } from '../../../core/models/enums';

type InvoiceWorkflowFilter = 'all' | 'action-required' | 'overdue' | InvoiceWorkflowStatus;
type InvoiceAgingBucket = 'all' | 'current' | '1-7' | '8-15' | '16+';
type InvoiceWorkflowComputedStatus = InvoiceWorkflowStatus | 'overdue';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>Invoices</h1>
        <button class="btn btn-secondary btn-sm" (click)="exportCsv()" [disabled]="invoices().length === 0">Export CSV</button>
      </div>

      @if (isAdmin()) {
        <div class="d-flex gap-2 mb-4 flex-wrap">
          <input type="text"
                 class="form-control"
                 style="min-width:320px"
                 placeholder="Enter dealer ID to view invoices"
                 [(ngModel)]="dealerIdInput">
          <button class="btn btn-primary btn-sm" (click)="loadForDealer()">Load</button>
        </div>
      }

      <div class="d-flex gap-3 mb-6 flex-wrap">
        <input type="search"
               class="form-control"
               style="min-width:220px"
               placeholder="Search invoice/order"
               [(ngModel)]="searchQuery"
               (ngModelChange)="onFilterChange()">

        <select class="form-control" style="width:160px" [(ngModel)]="gstFilter" (ngModelChange)="onFilterChange()">
          <option value="all">All GST</option>
          <option value="IGST">IGST</option>
          <option value="CGST_SGST">CGST/SGST</option>
        </select>

        <input type="date" class="form-control" style="width:170px" [(ngModel)]="fromDate" (ngModelChange)="onFilterChange()">
        <input type="date" class="form-control" style="width:170px" [(ngModel)]="toDate" (ngModelChange)="onFilterChange()">

        <input type="number" class="form-control" style="width:160px" placeholder="Min total" [(ngModel)]="minAmount" (ngModelChange)="onFilterChange()">
        <input type="number" class="form-control" style="width:160px" placeholder="Max total" [(ngModel)]="maxAmount" (ngModelChange)="onFilterChange()">

        <select class="form-control" style="width:190px" [(ngModel)]="workflowFilter" (ngModelChange)="onFilterChange()">
          <option value="all">All Workflow</option>
          <option value="action-required">Action Required</option>
          <option value="overdue">Overdue</option>
          <option value="pending">Pending</option>
          <option value="reminder-sent">Reminder Sent</option>
          <option value="promise-to-pay">Promise To Pay</option>
          <option value="disputed">Disputed</option>
          <option value="escalated">Escalated</option>
          <option value="paid">Paid</option>
        </select>

        <select class="form-control" style="width:170px" [(ngModel)]="agingFilter" (ngModelChange)="onFilterChange()">
          <option value="all">All Aging</option>
          <option value="current">Current</option>
          <option value="1-7">1-7 days</option>
          <option value="8-15">8-15 days</option>
          <option value="16+">16+ days</option>
        </select>
      </div>

      <div class="d-flex gap-3 mb-4 flex-wrap">
        <div class="card" style="min-width:160px">
          <div class="text-xs text-secondary">Visible Invoices</div>
          <div class="fw-700" style="font-size:20px">{{ invoices().length }}</div>
        </div>
        <div class="card" style="min-width:180px">
          <div class="text-xs text-secondary">Action Required</div>
          <div class="fw-700" style="font-size:20px">{{ actionRequiredCount() }}</div>
        </div>
        <div class="card" style="min-width:220px">
          <div class="text-xs text-secondary">Overdue Amount</div>
          <div class="fw-700 text-danger" style="font-size:20px">{{ overdueAmount() | currency:'INR':'symbol':'1.2-2' }}</div>
        </div>
        <div class="card" style="min-width:220px">
          <div class="text-xs text-secondary">Selected Amount</div>
          <div class="fw-700 text-primary" style="font-size:20px">{{ selectedAmount() | currency:'INR':'symbol':'1.2-2' }}</div>
        </div>
        <div class="card" style="min-width:200px">
          <div class="text-xs text-secondary">Follow-up Due</div>
          <div class="fw-700" style="font-size:20px">{{ followUpDueCount() }}</div>
        </div>
      </div>

      @if (canManageWorkflow() && invoices().length > 0) {
        <div class="card mb-4">
          <div class="d-flex gap-2 align-center flex-wrap">
            <label class="text-sm d-flex align-center gap-2" style="margin-right:8px">
              <input type="checkbox"
                     [checked]="selectAllVisibleChecked()"
                     [indeterminate]="selectAllVisibleIndeterminate()"
                     (change)="toggleSelectAllVisible($any($event.target).checked)">
              Select all visible
            </label>
            <span class="badge badge-info">{{ selectedCount() }} selected</span>
            <button class="btn btn-ghost btn-sm" (click)="clearSelection()" [disabled]="selectedCount() === 0">Clear</button>
            <button class="btn btn-secondary btn-sm"
                    (click)="bulkSendReminders()"
                    [disabled]="bulkActionLoading() || reminderEligibleCount() === 0">Bulk Reminder ({{ reminderEligibleCount() }})</button>
            <button class="btn btn-success btn-sm"
                    (click)="bulkMarkAsPaid()"
                    [disabled]="bulkActionLoading() || paidEligibleCount() === 0">Bulk Paid ({{ paidEligibleCount() }})</button>
            <button class="btn btn-warning btn-sm"
                    (click)="bulkMarkAsDisputed()"
                    [disabled]="bulkActionLoading() || disputedEligibleCount() === 0">Bulk Dispute ({{ disputedEligibleCount() }})</button>
            <button class="btn btn-danger btn-sm"
                    (click)="bulkEscalate()"
                    [disabled]="bulkActionLoading() || escalationEligibleCount() === 0">Bulk Escalate ({{ escalationEligibleCount() }})</button>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="skeleton" style="height:300px;border-radius:8px"></div>
      } @else if (invoices().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">🧾</div>
          <div class="empty-title">No invoices found</div>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:42px">
                  <input type="checkbox"
                         [checked]="selectAllVisibleChecked()"
                         [indeterminate]="selectAllVisibleIndeterminate()"
                         (click)="$event.stopPropagation()"
                         (change)="toggleSelectAllVisible($any($event.target).checked)">
                </th>
                <th>Invoice #</th><th>Order ID</th><th>GST Type</th><th>Grand Total</th><th>Due By</th><th>Aging</th><th>Workflow</th><th>Created</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (inv of invoices(); track inv.invoiceId) {
                <tr [routerLink]="['/invoices', inv.invoiceId]">
                  <td (click)="$event.stopPropagation()">
                    <input type="checkbox"
                           [checked]="isSelected(inv.invoiceId)"
                           (change)="toggleSelection(inv.invoiceId, $any($event.target).checked)">
                  </td>
                  <td class="fw-600">{{ inv.invoiceNumber }}</td>
                  <td class="text-xs text-secondary">{{ inv.orderId | slice:0:8 }}...</td>
                  <td><span class="badge badge-info">{{ inv.gstType }}</span></td>
                  <td class="fw-600 text-primary">{{ inv.grandTotal | currency:'INR':'symbol':'1.2-2' }}</td>
                  <td class="text-sm">{{ dueDateLabel(inv) }}</td>
                  <td>
                    <span class="badge" [class]="agingBadge(inv)">{{ agingLabel(inv) }}</span>
                  </td>
                  <td>
                    <span class="badge" [class]="workflowBadge(inv)">{{ workflowLabel(inv) }}</span>
                  </td>
                  <td class="text-sm">{{ inv.createdAtUtc | date:'dd MMM yyyy' }}</td>
                  <td>
                    <div class="d-flex gap-2 flex-wrap" (click)="$event.stopPropagation()">
                      <a [routerLink]="['/invoices', inv.invoiceId]" class="btn btn-ghost btn-sm">View →</a>
                      @if (canManageWorkflow()) {
                        <button class="btn btn-secondary btn-sm"
                                (click)="sendReminder(inv, $event)"
                          [disabled]="bulkActionLoading() || actionInvoiceId() === inv.invoiceId || workflowStatus(inv) === 'paid'">Reminder</button>
                        <button class="btn btn-success btn-sm"
                                (click)="markAsPaid(inv, $event)"
                          [disabled]="bulkActionLoading() || workflowStatus(inv) === 'paid'">Paid</button>
                        <button class="btn btn-warning btn-sm"
                                (click)="markAsDisputed(inv, $event)"
                          [disabled]="bulkActionLoading() || workflowStatus(inv) === 'paid'">Dispute</button>
                        <button class="btn btn-danger btn-sm"
                                (click)="escalate(inv, $event)"
                          [disabled]="bulkActionLoading() || actionInvoiceId() === inv.invoiceId || workflowStatus(inv) === 'paid' || workflowStatus(inv) === 'escalated'">Escalate</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `
})
export class InvoiceListComponent implements OnInit {
  private readonly paymentApi = inject(PaymentApiService);
  private readonly notificationApi = inject(NotificationApiService);
  private readonly authStore  = inject(AuthStore);
  private readonly toast      = inject(ToastService);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly workflowActivity = inject(InvoiceWorkflowActivityService);

  readonly loading  = signal(true);
  readonly allInvoices = signal<InvoiceDto[]>([]);
  readonly invoices = signal<InvoiceDto[]>([]);
  readonly workflowMap = signal<Record<string, InvoiceWorkflowState>>({});
  readonly selectedInvoiceIds = signal<Record<string, true>>({});
  readonly actionInvoiceId = signal<string | null>(null);
  readonly bulkActionLoading = signal(false);

  dealerIdInput = '';
  searchQuery = '';
  gstFilter: 'all' | string = 'all';
  fromDate = '';
  toDate = '';
  minAmount: number | null = null;
  maxAmount: number | null = null;
  workflowFilter: InvoiceWorkflowFilter = 'all';
  agingFilter: InvoiceAgingBucket = 'all';

  readonly isAdmin = () => this.authStore.hasRole(UserRole.Admin);
  readonly canManageWorkflow = () => this.authStore.hasRole(UserRole.Admin);

  ngOnInit(): void {
    if (this.isAdmin()) {
      this.loading.set(false);
      return;
    }

    const userId = this.authStore.user()?.userId;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    this.fetchInvoices(userId);
  }

  loadForDealer(): void {
    const dealerId = this.dealerIdInput.trim();
    if (!dealerId) {
      this.toast.warning('Enter a dealer ID to load invoices');
      return;
    }

    this.fetchInvoices(dealerId);
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  isSelected(invoiceId: string): boolean {
    return !!this.selectedInvoiceIds()[invoiceId];
  }

  toggleSelection(invoiceId: string, selected: boolean): void {
    this.selectedInvoiceIds.update(current => {
      const next = { ...current };
      if (selected) {
        next[invoiceId] = true;
      } else {
        delete next[invoiceId];
      }

      return next;
    });
  }

  toggleSelectAllVisible(selected: boolean): void {
    this.selectedInvoiceIds.update(current => {
      const next = { ...current };
      this.invoices().forEach(invoice => {
        if (selected) {
          next[invoice.invoiceId] = true;
        } else {
          delete next[invoice.invoiceId];
        }
      });

      return next;
    });
  }

  clearSelection(): void {
    this.selectedInvoiceIds.set({});
  }

  selectedCount(): number {
    return this.selectedVisibleInvoices().length;
  }

  selectedAmount(): number {
    return this.selectedVisibleInvoices().reduce((sum, invoice) => sum + invoice.grandTotal, 0);
  }

  selectAllVisibleChecked(): boolean {
    const totalVisible = this.invoices().length;
    return totalVisible > 0 && this.selectedCount() === totalVisible;
  }

  selectAllVisibleIndeterminate(): boolean {
    const selected = this.selectedCount();
    const totalVisible = this.invoices().length;
    return selected > 0 && selected < totalVisible;
  }

  actionRequiredCount(): number {
    return this.invoices().filter(invoice => this.isActionRequired(invoice)).length;
  }

  overdueAmount(): number {
    return this.invoices()
      .filter(invoice => this.workflowStatus(invoice) === 'overdue')
      .reduce((sum, invoice) => sum + invoice.grandTotal, 0);
  }

  followUpDueCount(): number {
    return this.invoices().filter(invoice => this.isFollowUpDue(invoice)).length;
  }

  reminderEligibleCount(): number {
    return this.reminderEligibleInvoices().length;
  }

  paidEligibleCount(): number {
    return this.paidEligibleInvoices().length;
  }

  disputedEligibleCount(): number {
    return this.disputedEligibleInvoices().length;
  }

  escalationEligibleCount(): number {
    return this.escalationEligibleInvoices().length;
  }

  bulkSendReminders(): void {
    if (!this.canManageWorkflow()) {
      return;
    }

    const targets = this.reminderEligibleInvoices();
    if (targets.length === 0) {
      this.toast.info('Select at least one non-paid invoice for reminders');
      return;
    }

    this.bulkActionLoading.set(true);
    this.runBulkWorkflowUpdate(targets, invoice => this.invoiceWorkflow.markReminderSent(invoice.invoiceId, invoice.createdAtUtc), {
      onSuccess: () => {
        const preview = targets.slice(0, 8).map(invoice => invoice.invoiceNumber).join(', ');
        const overflow = targets.length > 8 ? ` and ${targets.length - 8} more` : '';
        this.notificationApi.createManual({
          channel: NotificationChannel.Email,
          title: `Bulk payment reminders (${targets.length})`,
          body: `Payment reminders triggered for ${targets.length} invoices: ${preview}${overflow}.`
        }).subscribe({
          next: () => {
            this.toast.success(`Reminder workflow updated for ${targets.length} invoice(s)`);
            this.bulkActionLoading.set(false);
          },
          error: () => {
            this.toast.error('Reminder workflow updated, but notification dispatch failed');
            this.bulkActionLoading.set(false);
          }
        });
      },
      onError: () => {
        this.toast.error('Failed to update reminder workflow for selected invoices');
        this.bulkActionLoading.set(false);
      }
    });
  }

  bulkMarkAsPaid(): void {
    if (!this.canManageWorkflow()) {
      return;
    }

    const targets = this.paidEligibleInvoices();
    if (targets.length === 0) {
      this.toast.info('Select at least one invoice that is not already paid');
      return;
    }

    this.bulkActionLoading.set(true);
    this.runBulkWorkflowUpdate(targets, invoice => this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'paid' }), {
      onSuccess: () => {
        this.toast.success(`${targets.length} invoice(s) marked as paid`);
        this.bulkActionLoading.set(false);
      },
      onError: () => {
        this.toast.error('Failed to mark selected invoices as paid');
        this.bulkActionLoading.set(false);
      }
    });
  }

  bulkMarkAsDisputed(): void {
    if (!this.canManageWorkflow()) {
      return;
    }

    const targets = this.disputedEligibleInvoices();
    if (targets.length === 0) {
      this.toast.info('Select at least one invoice that is not already paid');
      return;
    }

    this.bulkActionLoading.set(true);
    this.runBulkWorkflowUpdate(targets, invoice => this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'disputed' }), {
      onSuccess: () => {
        this.toast.info(`${targets.length} invoice(s) moved to disputed workflow`);
        this.bulkActionLoading.set(false);
      },
      onError: () => {
        this.toast.error('Failed to move selected invoices to disputed workflow');
        this.bulkActionLoading.set(false);
      }
    });
  }

  bulkEscalate(): void {
    if (!this.canManageWorkflow()) {
      return;
    }

    const targets = this.escalationEligibleInvoices();
    if (targets.length === 0) {
      this.toast.info('Select at least one invoice eligible for escalation');
      return;
    }

    this.bulkActionLoading.set(true);
    this.runBulkWorkflowUpdate(targets, invoice => this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'escalated' }), {
      onSuccess: () => {
        const overdueTotal = targets.reduce((sum, invoice) => sum + this.daysPastDue(invoice), 0);
        this.notificationApi.createManual({
          channel: NotificationChannel.InApp,
          title: `Bulk invoice escalation (${targets.length})`,
          body: `Collection escalation created for ${targets.length} invoices. Cumulative overdue days: ${overdueTotal}.`
        }).subscribe({
          next: () => {
            this.toast.warning(`${targets.length} invoice(s) escalated`);
            this.bulkActionLoading.set(false);
          },
          error: () => {
            this.toast.error('Escalation workflow updated, but escalation notification failed');
            this.bulkActionLoading.set(false);
          }
        });
      },
      onError: () => {
        this.toast.error('Failed to escalate selected invoices');
        this.bulkActionLoading.set(false);
      }
    });
  }

  exportCsv(): void {
    if (this.invoices().length === 0) {
      return;
    }

    const headers = [
      'Invoice Number',
      'Invoice Id',
      'Order Id',
      'Dealer Id',
      'GST Type',
      'GST Rate',
      'Subtotal',
      'GST Amount',
      'Grand Total',
      'Due At UTC',
      'Aging (Days Past Due)',
      'Workflow Status',
      'Promise To Pay UTC',
      'Reminder Count',
      'Last Reminder At UTC',
      'Next Follow-up At UTC',
      'Internal Note',
      'Created At UTC'
    ];

    const lines = [headers.join(',')];
    this.invoices().forEach(invoice => {
      const workflow = this.workflowOf(invoice);
      const row = [
        this.escapeCsv(invoice.invoiceNumber),
        this.escapeCsv(invoice.invoiceId),
        this.escapeCsv(invoice.orderId),
        this.escapeCsv(invoice.dealerId),
        this.escapeCsv(invoice.gstType),
        invoice.gstRate.toFixed(2),
        invoice.subtotal.toFixed(2),
        invoice.gstAmount.toFixed(2),
        invoice.grandTotal.toFixed(2),
        this.escapeCsv(workflow.dueAtUtc),
        String(this.daysPastDue(invoice)),
        this.escapeCsv(this.workflowStatus(invoice)),
        this.escapeCsv(workflow.promiseToPayAtUtc ?? ''),
        String(workflow.reminderCount),
        this.escapeCsv(workflow.lastReminderAtUtc ?? ''),
        this.escapeCsv(workflow.nextFollowUpAtUtc ?? ''),
        this.escapeCsv(workflow.internalNote),
        this.escapeCsv(invoice.createdAtUtc)
      ];
      lines.push(row.join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `invoices-export-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);

    this.toast.success(`Exported ${this.invoices().length} invoice(s)`);
  }

  dueDateLabel(invoice: InvoiceDto): string {
    return new Date(this.workflowOf(invoice).dueAtUtc).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  agingLabel(invoice: InvoiceDto): string {
    const days = this.daysPastDue(invoice);
    return days === 0 ? 'Current' : `${days} day(s)`;
  }

  agingBadge(invoice: InvoiceDto): string {
    const bucket = this.agingBucket(invoice);
    if (bucket === 'current') {
      return 'badge badge-success';
    }

    if (bucket === '1-7') {
      return 'badge badge-warning';
    }

    if (bucket === '8-15') {
      return 'badge badge-error';
    }

    return 'badge badge-error';
  }

  workflowLabel(invoice: InvoiceDto): string {
    const status = this.workflowStatus(invoice);
    if (status === 'pending') return 'Pending';
    if (status === 'reminder-sent') return 'Reminder Sent';
    if (status === 'promise-to-pay') return 'Promise To Pay';
    if (status === 'paid') return 'Paid';
    if (status === 'disputed') return 'Disputed';
    if (status === 'escalated') return 'Escalated';
    return 'Overdue';
  }

  workflowBadge(invoice: InvoiceDto): string {
    const status = this.workflowStatus(invoice);
    if (status === 'paid') return 'badge badge-success';
    if (status === 'disputed') return 'badge badge-warning';
    if (status === 'escalated') return 'badge badge-error';
    if (status === 'reminder-sent' || status === 'promise-to-pay') return 'badge badge-info';
    if (status === 'overdue') return 'badge badge-error';
    return 'badge badge-neutral';
  }

  workflowStatus(invoice: InvoiceDto): InvoiceWorkflowComputedStatus {
    const base = this.workflowOf(invoice).status;
    if (base === 'paid' || base === 'disputed' || base === 'escalated') {
      return base;
    }

    return this.daysPastDue(invoice) > 0 ? 'overdue' : base;
  }

  sendReminder(invoice: InvoiceDto, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageWorkflow()) {
      return;
    }

    this.actionInvoiceId.set(invoice.invoiceId);
    this.invoiceWorkflow.markReminderSent(invoice.invoiceId, invoice.createdAtUtc).subscribe({
      next: next => {
        this.workflowMap.update(current => ({ ...current, [invoice.invoiceId]: next }));
        this.applyFilters();

        const dueLabel = this.dueDateLabel(invoice);
        const amountLabel = this.formatCurrency(invoice.grandTotal);
        this.notificationApi.createManual({
          channel: NotificationChannel.Email,
          title: `Payment reminder: ${invoice.invoiceNumber}`,
          body: `Invoice ${invoice.invoiceNumber} for ${amountLabel} is due by ${dueLabel}. Please arrange payment at the earliest.`
        }).subscribe({
          next: () => {
            this.toast.success(`Reminder sent for ${invoice.invoiceNumber}`);
            this.actionInvoiceId.set(null);
          },
          error: () => {
            this.toast.error('Reminder state saved, but notification dispatch failed');
            this.actionInvoiceId.set(null);
          }
        });
      },
      error: () => {
        this.toast.error(`Failed to update reminder workflow for ${invoice.invoiceNumber}`);
        this.actionInvoiceId.set(null);
      }
    });
  }

  markAsPaid(invoice: InvoiceDto, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageWorkflow()) {
      return;
    }

    this.actionInvoiceId.set(invoice.invoiceId);
    this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'paid' }).subscribe({
      next: next => {
        this.workflowMap.update(current => ({ ...current, [invoice.invoiceId]: next }));
        this.applyFilters();
        this.toast.success(`${invoice.invoiceNumber} marked as paid`);
        this.actionInvoiceId.set(null);
      },
      error: () => {
        this.toast.error(`Failed to mark ${invoice.invoiceNumber} as paid`);
        this.actionInvoiceId.set(null);
      }
    });
  }

  markAsDisputed(invoice: InvoiceDto, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageWorkflow()) {
      return;
    }

    this.actionInvoiceId.set(invoice.invoiceId);
    this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'disputed' }).subscribe({
      next: next => {
        this.workflowMap.update(current => ({ ...current, [invoice.invoiceId]: next }));
        this.applyFilters();
        this.toast.info(`${invoice.invoiceNumber} moved to disputed workflow`);
        this.actionInvoiceId.set(null);
      },
      error: () => {
        this.toast.error(`Failed to move ${invoice.invoiceNumber} to disputed workflow`);
        this.actionInvoiceId.set(null);
      }
    });
  }

  escalate(invoice: InvoiceDto, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageWorkflow()) {
      return;
    }

    this.actionInvoiceId.set(invoice.invoiceId);
    this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'escalated' }).subscribe({
      next: next => {
        this.workflowMap.update(current => ({ ...current, [invoice.invoiceId]: next }));
        this.applyFilters();

        this.notificationApi.createManual({
          channel: NotificationChannel.InApp,
          title: `Invoice escalated: ${invoice.invoiceNumber}`,
          body: `Collection escalation created for ${invoice.invoiceNumber}. Days overdue: ${this.daysPastDue(invoice)}.`
        }).subscribe({
          next: () => {
            this.toast.warning(`${invoice.invoiceNumber} escalated for collection follow-up`);
            this.actionInvoiceId.set(null);
          },
          error: () => {
            this.toast.error('Escalation state saved, but escalation notification failed');
            this.actionInvoiceId.set(null);
          }
        });
      },
      error: () => {
        this.toast.error(`Failed to escalate ${invoice.invoiceNumber}`);
        this.actionInvoiceId.set(null);
      }
    });
  }

  private fetchInvoices(dealerId: string): void {
    this.loading.set(true);
    this.paymentApi.getDealerInvoices(dealerId).subscribe({
      next: rows => {
        const sorted = [...rows].sort((left, right) => new Date(right.createdAtUtc).getTime() - new Date(left.createdAtUtc).getTime());
        this.allInvoices.set(sorted);
        this.clearSelection();
        this.hydrateWorkflow(sorted, dealerId);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load invoices');
      }
    });
  }

  private applyFilters(): void {
    let view = [...this.allInvoices()];
    const query = this.searchQuery.trim().toLowerCase();

    if (query) {
      view = view.filter(invoice =>
        invoice.invoiceNumber.toLowerCase().includes(query) ||
        invoice.orderId.toLowerCase().includes(query) ||
        invoice.invoiceId.toLowerCase().includes(query)
      );
    }

    if (this.gstFilter !== 'all') {
      view = view.filter(invoice => invoice.gstType === this.gstFilter);
    }

    if (this.fromDate) {
      const from = new Date(this.fromDate);
      from.setHours(0, 0, 0, 0);
      view = view.filter(invoice => new Date(invoice.createdAtUtc) >= from);
    }

    if (this.toDate) {
      const to = new Date(this.toDate);
      to.setHours(23, 59, 59, 999);
      view = view.filter(invoice => new Date(invoice.createdAtUtc) <= to);
    }

    if (this.minAmount !== null && Number.isFinite(this.minAmount)) {
      view = view.filter(invoice => invoice.grandTotal >= Number(this.minAmount));
    }

    if (this.maxAmount !== null && Number.isFinite(this.maxAmount)) {
      view = view.filter(invoice => invoice.grandTotal <= Number(this.maxAmount));
    }

    if (this.workflowFilter !== 'all') {
      view = view.filter(invoice => this.matchesWorkflowFilter(invoice));
    }

    if (this.agingFilter !== 'all') {
      view = view.filter(invoice => this.agingBucket(invoice) === this.agingFilter);
    }

    this.invoices.set(view);
    this.pruneSelectionToVisible();
  }

  private matchesWorkflowFilter(invoice: InvoiceDto): boolean {
    const status = this.workflowStatus(invoice);
    if (this.workflowFilter === 'action-required') {
      return status === 'pending' || status === 'reminder-sent' || status === 'promise-to-pay' || status === 'overdue';
    }

    if (this.workflowFilter === 'overdue') {
      return status === 'overdue';
    }

    return status === this.workflowFilter;
  }

  private daysPastDue(invoice: InvoiceDto): number {
    const dueAt = new Date(this.workflowOf(invoice).dueAtUtc).getTime();
    if (!Number.isFinite(dueAt)) {
      return 0;
    }

    const diffMs = Date.now() - dueAt;
    if (diffMs <= 0) {
      return 0;
    }

    return Math.floor(diffMs / 86400000);
  }

  private agingBucket(invoice: InvoiceDto): Exclude<InvoiceAgingBucket, 'all'> {
    const days = this.daysPastDue(invoice);
    if (days <= 0) {
      return 'current';
    }

    if (days <= 7) {
      return '1-7';
    }

    if (days <= 15) {
      return '8-15';
    }

    return '16+';
  }

  private selectedVisibleInvoices(): InvoiceDto[] {
    const selected = this.selectedInvoiceIds();
    return this.invoices().filter(invoice => !!selected[invoice.invoiceId]);
  }

  private isActionRequired(invoice: InvoiceDto): boolean {
    const status = this.workflowStatus(invoice);
    return status === 'pending' || status === 'reminder-sent' || status === 'promise-to-pay' || status === 'overdue' || this.isFollowUpDue(invoice);
  }

  private isFollowUpDue(invoice: InvoiceDto): boolean {
    const workflow = this.workflowOf(invoice);
    const candidate = workflow.nextFollowUpAtUtc ?? workflow.promiseToPayAtUtc;
    if (!candidate || this.workflowStatus(invoice) === 'paid') {
      return false;
    }

    const followUpAt = new Date(candidate).getTime();
    return Number.isFinite(followUpAt) && followUpAt <= Date.now();
  }

  private reminderEligibleInvoices(): InvoiceDto[] {
    return this.selectedVisibleInvoices().filter(invoice => this.workflowStatus(invoice) !== 'paid');
  }

  private paidEligibleInvoices(): InvoiceDto[] {
    return this.selectedVisibleInvoices().filter(invoice => this.workflowStatus(invoice) !== 'paid');
  }

  private disputedEligibleInvoices(): InvoiceDto[] {
    return this.selectedVisibleInvoices().filter(invoice => this.workflowStatus(invoice) !== 'paid');
  }

  private escalationEligibleInvoices(): InvoiceDto[] {
    return this.selectedVisibleInvoices().filter(invoice => {
      const status = this.workflowStatus(invoice);
      return status !== 'paid' && status !== 'escalated';
    });
  }

  private pruneSelectionToVisible(): void {
    const visibleIds = new Set(this.invoices().map(invoice => invoice.invoiceId));
    this.selectedInvoiceIds.update(current => {
      const next: Record<string, true> = {};
      Object.keys(current).forEach(invoiceId => {
        if (visibleIds.has(invoiceId)) {
          next[invoiceId] = true;
        }
      });

      return next;
    });
  }

  private workflowOf(invoice: InvoiceDto): InvoiceWorkflowState {
    const cached = this.workflowMap()[invoice.invoiceId];
    return cached ?? this.buildDefaultWorkflow(invoice);
  }

  private hydrateWorkflow(invoices: InvoiceDto[], dealerId: string): void {
    const defaults: Record<string, InvoiceWorkflowState> = {};
    invoices.forEach(invoice => {
      defaults[invoice.invoiceId] = this.buildDefaultWorkflow(invoice);
    });

    this.invoiceWorkflow.getDealerWorkflows(dealerId).subscribe({
      next: workflows => {
        const next = { ...defaults };
        workflows.forEach(workflow => {
          if (workflow.invoiceId && next[workflow.invoiceId]) {
            next[workflow.invoiceId] = workflow;
          }
        });

        this.workflowMap.set(next);

        const automations = invoices
          .map(invoice => {
            const state = next[invoice.invoiceId] ?? this.buildDefaultWorkflow(invoice);
            const patch = this.invoiceWorkflow.computeAutomationPatch(state);
            if (!patch) {
              return null;
            }

            return {
              invoice,
              autoFollowUpTriggered: state.status === 'promise-to-pay' && patch.status === 'reminder-sent',
              request: this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, patch)
            };
          })
          .filter(item => item !== null);

        if (automations.length === 0) {
          this.applyFilters();
          this.loading.set(false);
          return;
        }

        forkJoin(automations.map(item => item.request.pipe(
          map(state => ({
            invoiceId: item.invoice.invoiceId,
            state,
            autoFollowUpTriggered: item.autoFollowUpTriggered
          })),
          catchError(() => of(null))
        ))).subscribe({
          next: results => {
            const updates: Record<string, InvoiceWorkflowState> = {};
            results.forEach(result => {
              if (!result) {
                return;
              }

              updates[result.invoiceId] = result.state;
              if (result.autoFollowUpTriggered) {
                this.workflowActivity.add(
                  result.invoiceId,
                  'auto-follow-up',
                  'Promise-to-pay date elapsed. Follow-up reminder was auto-triggered.',
                  this.authStore.role() ?? 'System'
                ).subscribe({ error: () => {} });
              }
            });

            if (Object.keys(updates).length > 0) {
              this.workflowMap.update(current => ({ ...current, ...updates }));
            }

            this.applyFilters();
            this.loading.set(false);
          },
          error: () => {
            this.applyFilters();
            this.loading.set(false);
          }
        });
      },
      error: () => {
        this.workflowMap.set(defaults);
        this.applyFilters();
        this.loading.set(false);
      }
    });
  }

  private runBulkWorkflowUpdate(
    targets: InvoiceDto[],
    updater: (invoice: InvoiceDto) => ReturnType<InvoiceWorkflowService['update']>,
    callbacks: { onSuccess: () => void; onError: () => void }
  ): void {
    forkJoin(targets.map(invoice => updater(invoice).pipe(
      map(state => ({ invoiceId: invoice.invoiceId, state })),
      catchError(() => of(null))
    ))).subscribe({
      next: results => {
        const updates: Record<string, InvoiceWorkflowState> = {};
        const failed = results.some(result => result === null);

        results.forEach(result => {
          if (!result) {
            return;
          }

          updates[result.invoiceId] = result.state;
        });

        if (Object.keys(updates).length > 0) {
          this.workflowMap.update(current => ({ ...current, ...updates }));
          this.applyFilters();
          this.clearSelection();
        }

        if (failed) {
          callbacks.onError();
          return;
        }

        callbacks.onSuccess();
      },
      error: () => callbacks.onError()
    });
  }

  private buildDefaultWorkflow(invoice: InvoiceDto): InvoiceWorkflowState {
    const created = new Date(invoice.createdAtUtc);
    const safeCreated = Number.isFinite(created.getTime()) ? created : new Date();
    const due = new Date(safeCreated);
    due.setDate(due.getDate() + 7);

    return {
      invoiceId: invoice.invoiceId,
      status: 'pending',
      dueAtUtc: due.toISOString(),
      internalNote: '',
      reminderCount: 0,
      updatedAtUtc: new Date().toISOString()
    };
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  private escapeCsv(value: string): string {
    const normalized = value.replace(/"/g, '""');
    return `"${normalized}"`;
  }
}
