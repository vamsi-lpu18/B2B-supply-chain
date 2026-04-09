import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartStore } from '../../core/stores/cart.store';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>Shopping Cart</h1>
        @if (cartStore.itemCount() > 0) {
          <button class="btn btn-danger btn-sm" (click)="clearCart()">Clear Cart</button>
        }
      </div>

      @if (cartStore.items().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">🛒</div>
          <div class="empty-title">Your cart is empty</div>
          <div class="empty-desc">Browse products and add items to your cart</div>
          <a routerLink="/products" class="btn btn-primary mt-4">Browse Products</a>
        </div>
      } @else {
        <div class="cart-layout">
          <div class="cart-items">
            @for (item of cartStore.items(); track item.productId) {
              <div class="cart-item card">
                <div class="cart-item-info">
                  <div class="cart-item-name">{{ item.productName }}</div>
                  <div class="text-xs text-secondary">SKU: {{ item.sku }}</div>
                  <div class="text-sm text-primary fw-600">{{ item.unitPrice | currency:'INR':'symbol':'1.2-2' }} each</div>
                  @if (item.note) {
                    <div class="text-xs text-secondary mt-1">Note: {{ item.note }}</div>
                  }
                </div>
                <div class="cart-item-qty-wrap">
                  <div class="cart-item-qty">
                    <button class="btn btn-ghost btn-sm" (click)="decrement(item.productId, item.quantity, item.minOrderQty, item.availableStock)">−</button>
                    <input type="number"
                           class="qty-input"
                           [value]="qtyValue(item.productId, item.quantity)"
                           (input)="onQtyInput(item.productId, $any($event.target).value)"
                           (blur)="applyQty(item.productId, item.minOrderQty, item.availableStock)"
                           (keydown.enter)="applyQty(item.productId, item.minOrderQty, item.availableStock)">
                    <button class="btn btn-ghost btn-sm" (click)="increment(item.productId, item.quantity, item.minOrderQty, item.availableStock)">+</button>
                  </div>
                  <div class="qty-meta">Min {{ item.minOrderQty }} · Max {{ maxPurchasable(item.minOrderQty, item.availableStock) }}</div>
                  <div class="d-flex gap-1 flex-wrap justify-center">
                    <button class="btn btn-ghost btn-sm" (click)="applyQuickQty(item.productId, item.minOrderQty, item.availableStock, 1)">Min</button>
                    <button class="btn btn-ghost btn-sm" (click)="applyQuickQty(item.productId, item.minOrderQty, item.availableStock, 2)">Min x2</button>
                    <button class="btn btn-ghost btn-sm" (click)="applyQuickQty(item.productId, item.minOrderQty, item.availableStock, 5)">Min x5</button>
                    <button class="btn btn-ghost btn-sm" (click)="applyMaxQty(item.productId, item.minOrderQty, item.availableStock)">Max</button>
                  </div>
                </div>
                <div class="cart-item-total fw-600">{{ item.lineTotal | currency:'INR':'symbol':'1.2-2' }}</div>
                <button class="btn btn-ghost btn-icon" (click)="cartStore.removeItem(item.productId)">🗑️</button>
                <div class="cart-note-wrap">
                  <label class="text-xs text-secondary">Line Note</label>
                  <input type="text"
                         class="form-control"
                         style="min-width:220px"
                         maxlength="160"
                         placeholder="Add handling or delivery note"
                         [value]="noteValue(item.productId, item.note || '')"
                         (input)="onNoteInput(item.productId, $any($event.target).value)"
                         (blur)="applyNote(item.productId)">
                </div>
              </div>
            }
          </div>

          <div class="cart-summary card">
            <h2 class="mb-4">Order Summary</h2>
            <div class="summary-row">
              <span>Items ({{ cartStore.itemCount() }})</span>
              <span>{{ cartStore.total() | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-row fw-600" style="font-size:18px">
              <span>Total</span>
              <span class="text-primary">{{ cartStore.total() | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
            <a routerLink="/checkout" class="btn btn-primary w-full btn-lg mt-4">Proceed to Checkout →</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cart-layout { 
      display: grid; 
      grid-template-columns: 1fr 360px; 
      gap: 24px; 
      align-items: start; 
    }
    .cart-items { display: flex; flex-direction: column; gap: 14px; }
    .cart-item { 
      display: flex; 
      align-items: center; 
      gap: 18px; 
      padding: 20px; 
      transition: box-shadow var(--t-base) var(--ease), border-color var(--t-base) var(--ease);
    }
    .cart-item:hover {
      box-shadow: 0 14px 32px rgba(15, 23, 42, 0.10);
      border-color: #c8d7e8;
    }
    .cart-item-info { flex: 1; min-width: 0; }
    .cart-item-name { 
      font-weight: 600; 
      font-size: .9375rem; 
      color: var(--text-primary);
      line-height: 1.3;
      margin-bottom: 4px;
    }
    .cart-item-qty { 
      display: flex; 
      align-items: center; 
      gap: 10px; 
      background: var(--gray-50);
      padding: 4px 8px;
      border-radius: var(--r-lg);
    }
    .cart-item-qty-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .qty-input {
      width: 72px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 8px;
      text-align: center;
      font-weight: 700;
      background: #fff;
    }
    .qty-meta {
      font-size: 11px;
      color: var(--text-tertiary);
      font-weight: 600;
      letter-spacing: .01em;
    }
    .qty-display { 
      min-width: 36px; 
      text-align: center; 
      font-weight: 700; 
      font-size: .9375rem;
      color: var(--text-primary);
    }
    .cart-item-total { 
      min-width: 110px; 
      text-align: right; 
      font-size: 1.0625rem;
      color: var(--brand-700);
    }
    .cart-note-wrap {
      flex-basis: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
    }
    .cart-summary {
      position: sticky;
      top: 88px;
      padding: 24px;
    }
    .cart-summary h2 {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 20px;
    }
    .summary-row { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 10px; 
      font-size: .875rem;
      color: var(--text-secondary);
    }
    .summary-divider { 
      border-top: 1px solid var(--border); 
      margin: 16px 0; 
    }
    .w-full { width: 100%; justify-content: center; }
    @media (max-width: 768px) { 
      .cart-layout { grid-template-columns: 1fr; }
      .cart-summary { position: static; }
    }
  `]
})
export class CartComponent {
  readonly cartStore = inject(CartStore);
  private readonly toast = inject(ToastService);
  private readonly qtyDraft = signal<Record<string, string>>({});
  private readonly noteDraft = signal<Record<string, string>>({});

  qtyValue(productId: string, quantity: number): string {
    const draft = this.qtyDraft()[productId];
    return draft ?? String(quantity);
  }

  maxPurchasable(minOrderQty: number, availableStock: number): number {
    const min = Math.max(1, Math.trunc(minOrderQty));
    const available = Math.max(0, Math.trunc(availableStock));
    if (available < min) {
      return 0;
    }

    return Math.floor(available / min) * min;
  }

  onQtyInput(productId: string, value: string): void {
    this.qtyDraft.update(current => ({ ...current, [productId]: value }));
  }

  noteValue(productId: string, note: string): string {
    const draft = this.noteDraft()[productId];
    return draft ?? note;
  }

  onNoteInput(productId: string, value: string): void {
    this.noteDraft.update(current => ({ ...current, [productId]: value }));
  }

  applyNote(productId: string): void {
    const draft = this.noteDraft()[productId];
    if (draft === undefined) {
      return;
    }

    this.cartStore.updateNote(productId, draft);
    this.noteDraft.update(current => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  applyQty(productId: string, minOrderQty: number, availableStock: number): void {
    const draft = this.qtyDraft()[productId];
    if (draft === undefined) {
      return;
    }

    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      this.clearDraft(productId);
      return;
    }

    const normalized = this.cartStore.normalizeQuantity(parsed, minOrderQty, availableStock);
    if (normalized <= 0) {
      this.cartStore.removeItem(productId);
      this.toast.warning('Item is no longer available in stock');
      this.clearDraft(productId);
      return;
    }

    this.cartStore.updateQuantity(productId, normalized);
    this.clearDraft(productId);
  }

  increment(productId: string, qty: number, minOrderQty: number, availableStock: number): void {
    const step = Math.max(1, Math.trunc(minOrderQty));
    const normalized = this.cartStore.normalizeQuantity(qty + step, minOrderQty, availableStock);
    if (normalized === qty) {
      this.toast.warning('Cannot exceed available stock');
      return;
    }

    this.cartStore.updateQuantity(productId, normalized);
    this.clearDraft(productId);
  }

  applyQuickQty(productId: string, minOrderQty: number, availableStock: number, multiplier: number): void {
    const base = Math.max(1, Math.trunc(minOrderQty));
    const target = base * Math.max(1, Math.trunc(multiplier));
    const normalized = this.cartStore.normalizeQuantity(target, minOrderQty, availableStock);
    if (normalized <= 0) {
      this.toast.warning('Item is no longer available in stock');
      return;
    }

    this.cartStore.updateQuantity(productId, normalized);
    this.clearDraft(productId);
  }

  applyMaxQty(productId: string, minOrderQty: number, availableStock: number): void {
    const max = this.maxPurchasable(minOrderQty, availableStock);
    if (max <= 0) {
      this.toast.warning('Item is no longer available in stock');
      return;
    }

    this.cartStore.updateQuantity(productId, max);
    this.clearDraft(productId);
  }

  decrement(productId: string, qty: number, minOrderQty: number, availableStock: number): void {
    const step = Math.max(1, Math.trunc(minOrderQty));
    const normalized = this.cartStore.normalizeQuantity(qty - step, minOrderQty, availableStock);
    if (normalized === qty) {
      this.toast.warning(`Minimum order quantity is ${minOrderQty}`);
      return;
    }

    this.cartStore.updateQuantity(productId, normalized);
    this.clearDraft(productId);
  }

  clearCart(): void {
    this.qtyDraft.set({});
    this.noteDraft.set({});
    this.cartStore.clear();
  }

  private clearDraft(productId: string): void {
    this.qtyDraft.update(current => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }
}
