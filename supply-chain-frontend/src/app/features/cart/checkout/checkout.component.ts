import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartStore } from '../../../core/stores/cart.store';
import { AuthStore } from '../../../core/stores/auth.store';
import { OrderApiService } from '../../../core/api/order-api.service';
import { PaymentApiService } from '../../../core/api/payment-api.service';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { PaymentMode } from '../../../core/models/enums';
import { CreditCheckResponse, GatewayOrderDto } from '../../../core/models/payment.models';
import { catchError, forkJoin, map, of } from 'rxjs';

const CHECKOUT_DRAFT_KEY = 'sc_checkout_draft';

declare global {
  interface Window {
    Razorpay?: new (options: unknown) => {
      open: () => void;
      on: (event: string, callback: (response: any) => void) => void;
    };
  }
}

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>Checkout</h1>
        <a routerLink="/cart" class="btn btn-secondary">← Back to Cart</a>
      </div>

      <div class="checkout-layout">
        <!-- Order Items -->
        <div>
          <div class="card mb-4">
            <h2 class="mb-4">Order Items</h2>
            @for (item of cartStore.items(); track item.productId) {
              <div class="order-line">
                <div>
                  <div class="fw-600 text-sm">{{ item.productName }}</div>
                  <div class="text-xs text-secondary">{{ item.sku }} × {{ item.quantity }}</div>
                  @if (item.note) {
                    <div class="text-xs text-secondary">Note: {{ item.note }}</div>
                  }
                </div>
                <div class="fw-600">{{ item.lineTotal | currency:'INR':'symbol':'1.2-2' }}</div>
              </div>
            }
            <div class="order-total">
              <span class="fw-600">Total</span>
              <span class="fw-700 text-primary" style="font-size:20px">{{ cartStore.total() | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
          </div>

          <!-- Payment Mode -->
          <div class="card">
            <h2 class="mb-4">Payment Method</h2>
            <div class="payment-options">
              <label class="payment-option" [class.selected]="paymentMode === PaymentMode.COD">
                <input type="radio" [(ngModel)]="paymentMode" [value]="PaymentMode.COD" (change)="onPaymentChange()">
                <div>
                  <div class="fw-600">Cash on Delivery</div>
                  <div class="text-xs text-secondary">Pay when you receive</div>
                </div>
              </label>
              <label class="payment-option" [class.selected]="paymentMode === PaymentMode.PrePaid">
                <input type="radio" [(ngModel)]="paymentMode" [value]="PaymentMode.PrePaid" (change)="onPaymentChange()">
                <div>
                  <div class="fw-600">Credit (PrePaid)</div>
                  <div class="text-xs text-secondary">Use your credit limit</div>
                </div>
              </label>
            </div>

            @if (paymentMode === PaymentMode.PrePaid && creditCheck()) {
              <div class="credit-info mt-4" [class.credit-ok]="creditCheck()!.approved" [class.credit-fail]="!creditCheck()!.approved">
                @if (creditCheck()!.approved) {
                  ✅ Credit approved. Available: {{ creditCheck()!.availableCredit | currency:'INR':'symbol':'1.2-2' }}
                } @else {
                  ❌ Insufficient credit. Available: {{ creditCheck()!.availableCredit | currency:'INR':'symbol':'1.2-2' }}, Required: {{ cartStore.total() | currency:'INR':'symbol':'1.2-2' }}
                }
              </div>
            }
          </div>
        </div>

        <!-- Place Order -->
        <div class="card" style="align-self:start">
          <h2 class="mb-4">Place Order</h2>
          <div class="summary-row mb-2"><span>Items</span><span>{{ cartStore.itemCount() }}</span></div>
          <div class="summary-row mb-4"><span class="fw-600">Total</span><span class="fw-700 text-primary">{{ cartStore.total() | currency:'INR':'symbol':'1.2-2' }}</span></div>

          @if (errorMsg()) { <div class="alert-error mb-4">{{ errorMsg() }}</div> }

          <button class="btn btn-primary w-full btn-lg" (click)="placeOrder()"
                  [disabled]="loading()">
            @if (loading()) { <span class="spinner"></span> } Place Order
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .checkout-layout { display: grid; grid-template-columns: 1fr 300px; gap: 24px; align-items: start; }
    .order-line { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
    .order-total { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; margin-top: 4px; }
    .payment-options { display: flex; flex-direction: column; gap: 12px; }
    .payment-option { display: flex; align-items: center; gap: 12px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: border-color 200ms; }
    .payment-option.selected { border-color: #1976d2; background: #e3f2fd; }
    .credit-info { padding: 10px 12px; border-radius: 4px; font-size: 14px; }
    .credit-ok { background: #e8f5e9; color: #2e7d32; }
    .credit-fail { background: #ffebee; color: #c62828; }
    .summary-row { display: flex; justify-content: space-between; font-size: 14px; }
    .alert-error { background: #ffebee; color: #c62828; border-radius: 4px; padding: 10px 12px; font-size: 14px; }
    .w-full { width: 100%; justify-content: center; }
    .spinner { width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;display:inline-block; }
    @keyframes spin{to{transform:rotate(360deg);}}
    @media (max-width: 768px) { .checkout-layout { grid-template-columns: 1fr; } }
  `]
})
export class CheckoutComponent implements OnInit {
  readonly cartStore  = inject(CartStore);
  private readonly authStore   = inject(AuthStore);
  private readonly orderApi    = inject(OrderApiService);
  private readonly paymentApi  = inject(PaymentApiService);
  private readonly catalogApi  = inject(CatalogApiService);
  private readonly toast       = inject(ToastService);
  private readonly router      = inject(Router);

  readonly PaymentMode = PaymentMode;
  paymentMode = PaymentMode.COD;
  readonly loading     = signal(false);
  readonly errorMsg    = signal('');
  readonly creditCheck = signal<CreditCheckResponse | null>(null);

  ngOnInit(): void {
    if (this.cartStore.items().length === 0) {
      this.router.navigate(['/cart']);
      return;
    }

    this.restoreDraft();
    if (this.paymentMode === PaymentMode.PrePaid) {
      this.onPaymentChange();
    }
  }

  onPaymentChange(): void {
    this.persistDraft();

    if (this.paymentMode === PaymentMode.PrePaid) {
      const userId = this.authStore.user()?.userId;
      if (userId) {
        this.paymentApi.checkCredit(userId, this.cartStore.total()).subscribe({
          next: r => this.creditCheck.set(r),
          error: () => this.creditCheck.set(null)
        });
      }
    } else {
      this.creditCheck.set(null);
    }
  }

  placeOrder(): void {
    if (this.cartStore.items().length === 0) return;

    this.loading.set(true);
    this.errorMsg.set('');

    this.validateCartAgainstCurrentStock().subscribe({
      next: validation => {
        if (!validation.valid) {
          this.loading.set(false);
          this.errorMsg.set(validation.message);
          return;
        }

        if (this.paymentMode === PaymentMode.PrePaid) {
          this.startGatewayPaymentFlow();
          return;
        }

        this.submitOrder();
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set('Unable to validate stock right now. Please try again.');
      }
    });
  }

  private submitOrder(): void {
    this.loading.set(true);
    this.errorMsg.set('');

    const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.orderApi.createOrder({
      paymentMode: this.paymentMode,
      idempotencyKey,
      lines: this.cartStore.items().map(i => ({
        productId: i.productId, productName: i.productName, sku: i.sku,
        quantity: i.quantity, unitPrice: i.unitPrice, minOrderQty: i.minOrderQty
      }))
    }).subscribe({
      next: order => {
        this.loading.set(false);
        this.cartStore.clear();
        this.clearDraft();
        this.toast.success(`Order ${order.orderNumber} placed successfully!`);
        this.router.navigate(['/orders', order.orderId]);
      },
      error: err => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message || 'Failed to place order. Please try again.');
      }
    });
  }

  private startGatewayPaymentFlow(): void {
    const userId = this.authStore.user()?.userId;
    if (!userId) {
      this.errorMsg.set('Unable to identify current user. Please login again.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set('');

    this.ensureRazorpayLoaded()
      .then(() => {
        this.paymentApi.createGatewayOrder({
          amount: this.cartStore.total(),
          currency: 'INR',
          description: 'Order payment'
        }).subscribe({
          next: order => this.openRazorpayCheckout(order),
          error: () => {
            this.loading.set(false);
            this.errorMsg.set('Failed to initialize payment gateway.');
          }
        });
      })
      .catch(() => {
        this.loading.set(false);
        this.errorMsg.set('Failed to load payment gateway script.');
      });
  }

  private openRazorpayCheckout(order: GatewayOrderDto): void {
    const RazorpayCtor = window.Razorpay;
    if (!RazorpayCtor) {
      this.loading.set(false);
      this.errorMsg.set('Payment gateway is unavailable.');
      return;
    }

    const razorpay = new RazorpayCtor({
      key: order.keyId,
      amount: order.amountMinor,
      currency: order.currency,
      name: 'Supply Chain Platform',
      description: order.description,
      order_id: order.gatewayOrderId,
      handler: (response: any) => {
        this.verifyGatewayPayment(order, response);
      },
      modal: {
        ondismiss: () => {
          if (this.loading()) {
            this.loading.set(false);
          }
        }
      },
      theme: {
        color: '#1976d2'
      }
    });

    razorpay.on('payment.failed', (response: any) => {
      this.loading.set(false);
      this.errorMsg.set(response?.error?.description ?? 'Payment failed. Please try again.');
    });

    razorpay.open();
  }

  private verifyGatewayPayment(order: GatewayOrderDto, response: any): void {
    this.paymentApi.verifyGatewayPayment({
      gatewayOrderId: response?.razorpay_order_id,
      gatewayPaymentId: response?.razorpay_payment_id,
      signature: response?.razorpay_signature,
      amount: this.cartStore.total(),
      currency: order.currency,
      receipt: order.receipt,
      description: order.description
    }).subscribe({
      next: verification => {
        if (!verification.verified) {
          this.loading.set(false);
          this.errorMsg.set(verification.failureReason || 'Payment verification failed.');
          return;
        }

        this.submitOrder();
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set('Unable to verify payment. Please contact support.');
      }
    });
  }

  private ensureRazorpayLoaded(): Promise<void> {
    if (window.Razorpay) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-razorpay-checkout]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('script-load-failed')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.setAttribute('data-razorpay-checkout', 'true');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('script-load-failed'));
      document.body.appendChild(script);
    });
  }

  private validateCartAgainstCurrentStock() {
    const snapshot = [...this.cartStore.items()];
    if (snapshot.length === 0) {
      return of({ valid: false, message: 'Your cart is empty.' });
    }

    return forkJoin(
      snapshot.map(item =>
        this.catalogApi.getProductById(item.productId).pipe(
          map(product => ({ item, product })),
          catchError(() => of({ item, product: null }))
        )
      )
    ).pipe(
      map(rows => {
        let removedCount = 0;
        let adjustedCount = 0;

        for (const row of rows) {
          const product = row.product;
          if (!product || !product.isActive || product.availableStock <= 0) {
            this.cartStore.removeItem(row.item.productId);
            removedCount += 1;
            continue;
          }

          const normalizedQty = this.cartStore.normalizeQuantity(
            row.item.quantity,
            product.minOrderQty,
            product.availableStock
          );

          if (normalizedQty <= 0) {
            this.cartStore.removeItem(row.item.productId);
            removedCount += 1;
            continue;
          }

          const changed =
            normalizedQty !== row.item.quantity ||
            row.item.unitPrice !== product.unitPrice ||
            row.item.minOrderQty !== product.minOrderQty ||
            row.item.availableStock !== product.availableStock ||
            row.item.productName !== product.name ||
            row.item.sku !== product.sku;

          if (!changed) {
            continue;
          }

          this.cartStore.removeItem(row.item.productId);
          this.cartStore.addItem({
            productId: product.productId,
            productName: product.name,
            sku: product.sku,
            quantity: normalizedQty,
            unitPrice: product.unitPrice,
            minOrderQty: product.minOrderQty,
            availableStock: product.availableStock
          });

          adjustedCount += 1;
        }

        if (this.cartStore.items().length === 0) {
          this.router.navigate(['/cart']);
          return {
            valid: false,
            message: 'All cart items are unavailable now. Please add products again.'
          };
        }

        if (removedCount > 0 || adjustedCount > 0) {
          if (this.paymentMode === PaymentMode.PrePaid) {
            this.onPaymentChange();
          }

          this.toast.warning('Cart updated with latest stock and pricing. Please review and place order again.');
          return {
            valid: false,
            message: 'Cart updated due to stock changes. Review and place order again.'
          };
        }

        return { valid: true, message: '' };
      })
    );
  }

  private persistDraft(): void {
    try {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ paymentMode: this.paymentMode }));
    } catch {
      // Ignore localStorage failures.
    }
  }

  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as { paymentMode?: number };
      if (parsed.paymentMode === PaymentMode.COD || parsed.paymentMode === PaymentMode.PrePaid) {
        this.paymentMode = parsed.paymentMode;
      }
    } catch {
      // Ignore malformed draft data.
    }
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(CHECKOUT_DRAFT_KEY);
    } catch {
      // Ignore localStorage failures.
    }
  }
}
