import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PaymentApiService } from '../../../core/api/payment-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { InvoiceDto } from '../../../core/models/payment.models';
import { UserRole } from '../../../core/models/enums';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-content">
      <div class="page-header"><h1>Invoices</h1></div>

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
            <thead><tr><th>Invoice #</th><th>Order ID</th><th>GST Type</th><th>Grand Total</th><th>Created</th><th></th></tr></thead>
            <tbody>
              @for (inv of invoices(); track inv.invoiceId) {
                <tr [routerLink]="['/invoices', inv.invoiceId]">
                  <td class="fw-600">{{ inv.invoiceNumber }}</td>
                  <td class="text-xs text-secondary">{{ inv.orderId | slice:0:8 }}...</td>
                  <td><span class="badge badge-info">{{ inv.gstType }}</span></td>
                  <td class="fw-600 text-primary">{{ inv.grandTotal | currency:'INR':'symbol':'1.2-2' }}</td>
                  <td class="text-sm">{{ inv.createdAtUtc | date:'dd MMM yyyy' }}</td>
                  <td><a [routerLink]="['/invoices', inv.invoiceId]" class="btn btn-ghost btn-sm">View →</a></td>
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
  private readonly authStore  = inject(AuthStore);

  readonly loading  = signal(true);
  readonly invoices = signal<InvoiceDto[]>([]);

  ngOnInit(): void {
    const userId = this.authStore.user()?.userId;
    if (!userId) { this.loading.set(false); return; }
    this.paymentApi.getDealerInvoices(userId).subscribe({
      next: r => { this.invoices.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
