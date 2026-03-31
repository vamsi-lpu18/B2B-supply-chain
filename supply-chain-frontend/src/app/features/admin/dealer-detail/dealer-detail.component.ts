import { Component, inject, signal, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminApiService } from '../../../core/api/admin-api.service';
import { PaymentApiService } from '../../../core/api/payment-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { DealerDetailDto } from '../../../core/models/auth.models';
import { DealerCreditAccountDto } from '../../../core/models/payment.models';

@Component({
  selector: 'app-dealer-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content">
      <div class="page-header">
        <div>
          <a routerLink="/admin/dealers" class="btn btn-ghost mb-2">← Dealers</a>
          <h1>{{ dealer()?.fullName ?? 'Dealer Detail' }}</h1>
        </div>
        @if (dealer() && dealer()!.status === 'Pending') {
          <div class="d-flex gap-2">
            <button class="btn btn-primary" (click)="approve()" [disabled]="actionLoading()">✅ Approve</button>
            <button class="btn btn-danger" (click)="showRejectDialog.set(true)">❌ Reject</button>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:400px;border-radius:8px"></div>
      } @else if (dealer()) {
        <div class="grid-2 mb-4">
          <!-- Dealer Info -->
          <div class="card">
            <h2 class="mb-4">Business Information</h2>
            <div class="detail-grid">
              <div class="detail-field"><span class="field-label">Status</span><span class="badge" [class]="statusBadge(dealer()!.status)">{{ dealer()!.status }}</span></div>
              <div class="detail-field"><span class="field-label">Email</span><span>{{ dealer()!.email }}</span></div>
              <div class="detail-field"><span class="field-label">Phone</span><span>{{ dealer()!.phoneNumber }}</span></div>
              <div class="detail-field"><span class="field-label">Business</span><span>{{ dealer()!.businessName }}</span></div>
              <div class="detail-field"><span class="field-label">GST Number</span><span>{{ dealer()!.gstNumber }}</span></div>
              <div class="detail-field"><span class="field-label">Trade License</span><span>{{ dealer()!.tradeLicenseNo }}</span></div>
              <div class="detail-field"><span class="field-label">Interstate</span><span>{{ dealer()!.isInterstate ? 'Yes' : 'No' }}</span></div>
              <div class="detail-field"><span class="field-label">Registered</span><span>{{ dealer()!.registeredAtUtc | date:'dd MMM yyyy' }}</span></div>
            </div>
            <div class="mt-4">
              <span class="field-label">Address</span>
              <p>{{ dealer()!.address }}, {{ dealer()!.city }}, {{ dealer()!.state }} - {{ dealer()!.pinCode }}</p>
            </div>
            @if (dealer()!.rejectionReason) {
              <div class="alert-error mt-4">Rejection Reason: {{ dealer()!.rejectionReason }}</div>
            }
          </div>

          <!-- Credit Account -->
          <div class="card">
            <h2 class="mb-4">Credit Account</h2>
            @if (creditAccount()) {
              <div class="detail-grid mb-4">
                <div class="detail-field"><span class="field-label">Credit Limit</span><span class="fw-700 text-primary">{{ creditAccount()!.creditLimit | currency:'INR':'symbol':'1.2-2' }}</span></div>
                <div class="detail-field"><span class="field-label">Outstanding</span><span class="fw-600 text-error">{{ creditAccount()!.currentOutstanding | currency:'INR':'symbol':'1.2-2' }}</span></div>
                <div class="detail-field"><span class="field-label">Available</span><span class="fw-600 text-success">{{ creditAccount()!.availableCredit | currency:'INR':'symbol':'1.2-2' }}</span></div>
              </div>
              <div class="d-flex gap-2 flex-wrap">
                <button class="btn btn-secondary btn-sm" (click)="showCreditDialog.set(true)">Update Credit Limit</button>
                <button class="btn btn-secondary btn-sm" (click)="showSettleDialog.set(true)">Settle Outstanding</button>
              </div>
            } @else {
              <p class="text-secondary text-sm mb-4">No credit account found</p>
              <button class="btn btn-primary btn-sm" (click)="seedAccount()">Create Credit Account</button>
            }
          </div>
        </div>
      } @else {
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-title">Dealer not found</div>
          <a routerLink="/admin/dealers" class="btn btn-primary mt-4">Back to Dealers</a>
        </div>
      }

      <!-- Reject Dialog -->
      @if (showRejectDialog()) {
        <div class="modal-backdrop" (click)="showRejectDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Reject Dealer</h2><button class="btn btn-ghost btn-icon" (click)="showRejectDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Rejection Reason *</label>
                <textarea class="form-control" [(ngModel)]="rejectReason" rows="3"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRejectDialog.set(false)">Cancel</button>
              <button class="btn btn-danger" (click)="reject()" [disabled]="!rejectReason.trim() || actionLoading()">Reject</button>
            </div>
          </div>
        </div>
      }

      <!-- Credit Limit Dialog -->
      @if (showCreditDialog()) {
        <div class="modal-backdrop" (click)="showCreditDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Update Credit Limit</h2><button class="btn btn-ghost btn-icon" (click)="showCreditDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>New Credit Limit (INR) *</label>
                <input type="number" class="form-control" [(ngModel)]="newCreditLimit" min="0" step="0.01">
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showCreditDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="updateCreditLimit()" [disabled]="newCreditLimit < 0 || actionLoading()">Update</button>
            </div>
          </div>
        </div>
      }

      <!-- Settle Dialog -->
      @if (showSettleDialog()) {
        <div class="modal-backdrop" (click)="showSettleDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Settle Outstanding</h2><button class="btn btn-ghost btn-icon" (click)="showSettleDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Amount (INR) *</label>
                <input type="number" class="form-control" [(ngModel)]="settleAmount" min="0.01" step="0.01">
              </div>
              <div class="form-group">
                <label>Reference No</label>
                <input type="text" class="form-control" [(ngModel)]="settleRef" placeholder="TXN-12345">
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showSettleDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="settle()" [disabled]="settleAmount <= 0 || actionLoading()">Settle</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .detail-field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { font-size: 11px; color: #616161; text-transform: uppercase; }
    .alert-error { background: #ffebee; color: #c62828; border-radius: 4px; padding: 10px 12px; font-size: 14px; }
  `]
})
export class DealerDetailComponent implements OnInit {
  readonly id = input.required<string>();

  private readonly adminApi   = inject(AdminApiService);
  private readonly paymentApi = inject(PaymentApiService);
  private readonly toast      = inject(ToastService);

  readonly loading          = signal(true);
  readonly actionLoading    = signal(false);
  readonly dealer           = signal<DealerDetailDto | null>(null);
  readonly creditAccount    = signal<DealerCreditAccountDto | null>(null);
  readonly showRejectDialog = signal(false);
  readonly showCreditDialog = signal(false);
  readonly showSettleDialog = signal(false);

  rejectReason    = '';
  newCreditLimit  = 0;
  settleAmount    = 0;
  settleRef       = '';

  statusBadge(s: string): string {
    if (s === 'Active') return 'badge badge-success';
    if (s === 'Pending') return 'badge badge-warning';
    if (s === 'Rejected') return 'badge badge-error';
    return 'badge badge-neutral';
  }

  ngOnInit(): void {
    this.adminApi.getDealerById(this.id()).subscribe({
      next: d => {
        this.dealer.set(d);
        this.newCreditLimit = d.creditLimit;
        this.loading.set(false);
        this.loadCreditAccount();
      },
      error: () => { this.dealer.set(null); this.loading.set(false); }
    });
  }

  loadCreditAccount(): void {
    this.paymentApi.checkCredit(this.id(), 0).subscribe({
      next: r => this.creditAccount.set({ accountId: '', dealerId: this.id(), creditLimit: r.creditLimit, currentOutstanding: r.currentOutstanding, availableCredit: r.availableCredit }),
      error: () => this.creditAccount.set(null)
    });
  }

  approve(): void {
    this.actionLoading.set(true);
    this.adminApi.approveDealer(this.id()).subscribe({
      next: () => { this.toast.success('Dealer approved'); this.dealer.update(d => d ? { ...d, status: 'Active' } : d); this.actionLoading.set(false); },
      error: () => this.actionLoading.set(false)
    });
  }

  reject(): void {
    this.actionLoading.set(true);
    this.adminApi.rejectDealer(this.id(), { reason: this.rejectReason }).subscribe({
      next: () => { this.toast.success('Dealer rejected'); this.showRejectDialog.set(false); this.dealer.update(d => d ? { ...d, status: 'Rejected', rejectionReason: this.rejectReason } : d); this.actionLoading.set(false); },
      error: () => this.actionLoading.set(false)
    });
  }

  seedAccount(): void {
    this.paymentApi.seedDealerAccount(this.id(), { initialCreditLimit: 50000 }).subscribe({
      next: acc => { this.creditAccount.set(acc); this.toast.success('Credit account created'); },
      error: err => this.toast.error(this.getErrorMessage(err, 'Failed to create credit account'))
    });
  }

  updateCreditLimit(): void {
    this.actionLoading.set(true);
    this.adminApi.updateCreditLimit(this.id(), { creditLimit: this.newCreditLimit }).subscribe({
      next: () => { this.toast.success('Credit limit updated'); this.showCreditDialog.set(false); this.loadCreditAccount(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to update credit limit'));
        this.actionLoading.set(false);
      }
    });
  }

  settle(): void {
    this.actionLoading.set(true);
    this.paymentApi.settleOutstanding(this.id(), { amount: this.settleAmount, referenceNo: this.settleRef || undefined }).subscribe({
      next: acc => { this.creditAccount.set(acc); this.toast.success('Settlement recorded'); this.showSettleDialog.set(false); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to settle outstanding amount'));
        this.actionLoading.set(false);
      }
    });
  }

  private getErrorMessage(err: unknown, fallback: string): string {
    const candidate = err as { error?: { message?: string; title?: string } };
    return candidate?.error?.message ?? candidate?.error?.title ?? fallback;
  }
}
