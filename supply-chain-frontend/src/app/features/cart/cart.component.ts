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
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss'
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
