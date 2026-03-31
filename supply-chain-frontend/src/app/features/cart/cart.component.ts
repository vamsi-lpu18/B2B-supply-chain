import { Component, inject } from '@angular/core';
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
                </div>
                <div class="cart-item-qty">
                  <button class="btn btn-ghost btn-sm" (click)="decrement(item.productId, item.quantity, item.minOrderQty)">−</button>
                  <span class="qty-display">{{ item.quantity }}</span>
                  <button class="btn btn-ghost btn-sm" (click)="increment(item.productId, item.quantity, item.availableStock)">+</button>
                </div>
                <div class="cart-item-total fw-600">{{ item.lineTotal | currency:'INR':'symbol':'1.2-2' }}</div>
                <button class="btn btn-ghost btn-icon" (click)="cartStore.removeItem(item.productId)">🗑️</button>
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

  increment(productId: string, qty: number, max: number): void {
    if (qty < max) this.cartStore.updateQuantity(productId, qty + 1);
    else this.toast.warning('Cannot exceed available stock');
  }

  decrement(productId: string, qty: number, min: number): void {
    if (qty > min) this.cartStore.updateQuantity(productId, qty - 1);
    else this.toast.warning(`Minimum order quantity is ${min}`);
  }

  clearCart(): void { this.cartStore.clear(); }
}
