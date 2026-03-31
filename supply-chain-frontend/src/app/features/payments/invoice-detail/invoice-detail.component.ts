import { Component, inject, signal, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PaymentApiService } from '../../../core/api/payment-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { InvoiceDto } from '../../../core/models/payment.models';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-content">
      <div class="page-header">
        <div>
          <a routerLink="/invoices" class="btn btn-ghost mb-2">← Invoices</a>
          <h1>{{ invoice()?.invoiceNumber ?? 'Invoice' }}</h1>
        </div>
        @if (invoice()) {
          <button class="btn btn-primary" (click)="download()" [disabled]="downloading()">
            @if (downloading()) { ⏳ } 📥 Download PDF
          </button>
        }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:400px;border-radius:8px"></div>
      } @else if (invoice()) {
        <div class="card mb-4">
          <div class="invoice-header-grid">
            <div><span class="field-label">Invoice #</span><span class="fw-600">{{ invoice()!.invoiceNumber }}</span></div>
            <div><span class="field-label">Order ID</span><a [routerLink]="['/orders', invoice()!.orderId]" class="text-primary">View Order →</a></div>
            <div><span class="field-label">GST Type</span><span class="badge badge-info">{{ invoice()!.gstType }}</span></div>
            <div><span class="field-label">GST Rate</span><span>{{ invoice()!.gstRate }}%</span></div>
            <div><span class="field-label">Created</span><span>{{ invoice()!.createdAtUtc | date:'dd MMM yyyy' }}</span></div>
          </div>
        </div>

        <div class="card mb-4">
          <h2 class="mb-4">Line Items</h2>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Product</th><th>SKU</th><th>HSN</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
              <tbody>
                @for (l of invoice()!.lines; track l.invoiceLineId) {
                  <tr>
                    <td class="fw-600">{{ l.productName }}</td>
                    <td class="text-sm text-secondary">{{ l.sku }}</td>
                    <td class="text-sm">{{ l.hsnCode }}</td>
                    <td>{{ l.quantity }}</td>
                    <td>{{ l.unitPrice | currency:'INR':'symbol':'1.2-2' }}</td>
                    <td class="fw-600">{{ l.lineTotal | currency:'INR':'symbol':'1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="max-width:300px;margin-left:auto">
          <div class="summary-row mb-2"><span>Subtotal</span><span>{{ invoice()!.subtotal | currency:'INR':'symbol':'1.2-2' }}</span></div>
          <div class="summary-row mb-2"><span>GST ({{ invoice()!.gstRate }}%)</span><span>{{ invoice()!.gstAmount | currency:'INR':'symbol':'1.2-2' }}</span></div>
          <div class="summary-divider"></div>
          <div class="summary-row fw-700" style="font-size:18px"><span>Grand Total</span><span class="text-primary">{{ invoice()!.grandTotal | currency:'INR':'symbol':'1.2-2' }}</span></div>
        </div>
      } @else {
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-title">Invoice not found</div>
          <a routerLink="/invoices" class="btn btn-primary mt-4">Back to Invoices</a>
        </div>
      }
    </div>
  `,
  styles: [`
    .invoice-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .field-label { display: block; font-size: 11px; color: #616161; text-transform: uppercase; margin-bottom: 4px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 14px; }
    .summary-divider { border-top: 1px solid #e0e0e0; margin: 8px 0; }
  `]
})
export class InvoiceDetailComponent implements OnInit {
  readonly id = input.required<string>();
  private readonly paymentApi = inject(PaymentApiService);
  private readonly toast      = inject(ToastService);

  readonly loading    = signal(true);
  readonly downloading = signal(false);
  readonly invoice    = signal<InvoiceDto | null>(null);

  ngOnInit(): void {
    this.paymentApi.getInvoiceById(this.id()).subscribe({
      next: i => { this.invoice.set(i); this.loading.set(false); },
      error: () => { this.invoice.set(null); this.loading.set(false); }
    });
  }

  download(): void {
    this.downloading.set(true);
    this.paymentApi.downloadInvoice(this.id()).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${this.invoice()?.invoiceNumber ?? this.id()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloading.set(false);
      },
      error: () => { this.toast.error('PDF not available'); this.downloading.set(false); }
    });
  }
}
