import { Component, computed, inject, signal, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminApiService } from '../../../core/api/admin-api.service';
import { PaymentApiService } from '../../../core/api/payment-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { DealerDetailDto } from '../../../core/models/auth.models';
import { DealerCreditAccountDto, InvoiceDto } from '../../../core/models/payment.models';

@Component({
  selector: 'app-dealer-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dealer-detail.component.html',
  styleUrl: './dealer-detail.component.scss'
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
  readonly dealerInvoices   = signal<InvoiceDto[]>([]);
  readonly invoicesLoading  = signal(false);
  readonly showRejectDialog = signal(false);
  readonly showCreditDialog = signal(false);
  readonly showSettleDialog = signal(false);

  rejectReason    = '';
  newCreditLimit  = 0;
  settleAmount    = 0;
  settleRef       = '';

  readonly utilizationPercent = computed(() => {
    const account = this.creditAccount();
    if (!account || account.creditLimit <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (account.currentOutstanding / account.creditLimit) * 100));
  });

  readonly riskLabel = computed(() => {
    const account = this.creditAccount();
    if (!account) {
      return 'Unknown';
    }

    if (account.currentOutstanding <= 0) {
      return 'Healthy';
    }

    const utilization = this.utilizationPercent();
    if (utilization >= 90 || this.agingOver60Count() > 0) {
      return 'Overdue Risk';
    }

    if (utilization >= 70 || this.aging31To60Count() > 0) {
      return 'Watchlist';
    }

    return 'Healthy';
  });

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
        this.loadDealerInvoices();
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

  loadDealerInvoices(): void {
    this.invoicesLoading.set(true);
    this.paymentApi.getDealerInvoices(this.id()).subscribe({
      next: rows => {
        const sorted = [...rows].sort((left, right) => new Date(right.createdAtUtc).getTime() - new Date(left.createdAtUtc).getTime());
        this.dealerInvoices.set(sorted);
        this.invoicesLoading.set(false);
      },
      error: () => {
        this.dealerInvoices.set([]);
        this.invoicesLoading.set(false);
      }
    });
  }

  riskBadgeClass(): string {
    if (this.riskLabel() === 'Overdue Risk') return 'badge badge-error';
    if (this.riskLabel() === 'Watchlist') return 'badge badge-warning';
    if (this.riskLabel() === 'Healthy') return 'badge badge-success';
    return 'badge badge-neutral';
  }

  aging0To30Count(): number {
    return this.dealerInvoices().filter(invoice => this.invoiceAgeDays(invoice) <= 30).length;
  }

  aging31To60Count(): number {
    return this.dealerInvoices().filter(invoice => {
      const age = this.invoiceAgeDays(invoice);
      return age >= 31 && age <= 60;
    }).length;
  }

  agingOver60Count(): number {
    return this.dealerInvoices().filter(invoice => this.invoiceAgeDays(invoice) > 60).length;
  }

  latestAgingInvoices(): InvoiceDto[] {
    return this.dealerInvoices().slice(0, 5);
  }

  agingLabel(invoice: InvoiceDto): string {
    const age = this.invoiceAgeDays(invoice);
    if (age > 60) return `Overdue ${age}d`;
    if (age > 30) return `${age}d aging`;
    return `${age}d current`;
  }

  agingBadgeClass(invoice: InvoiceDto): string {
    const age = this.invoiceAgeDays(invoice);
    if (age > 60) return 'badge badge-error';
    if (age > 30) return 'badge badge-warning';
    return 'badge badge-success';
  }

  private invoiceAgeDays(invoice: InvoiceDto): number {
    const createdAt = new Date(invoice.createdAtUtc).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - createdAt);
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
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
      next: () => { this.toast.success('Credit limit updated'); this.showCreditDialog.set(false); this.loadCreditAccount(); this.loadDealerInvoices(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to update credit limit'));
        this.actionLoading.set(false);
      }
    });
  }

  settle(): void {
    this.actionLoading.set(true);
    this.paymentApi.settleOutstanding(this.id(), { amount: this.settleAmount, referenceNo: this.settleRef || undefined }).subscribe({
      next: acc => { this.creditAccount.set(acc); this.toast.success('Settlement recorded'); this.showSettleDialog.set(false); this.loadDealerInvoices(); this.actionLoading.set(false); },
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
