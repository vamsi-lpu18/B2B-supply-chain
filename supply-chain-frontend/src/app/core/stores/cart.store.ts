import { Injectable, signal, computed, effect } from '@angular/core';
import { CartItem } from '../models/shared.models';

const CART_KEY = 'sc_cart';

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly _items = signal<CartItem[]>(this._load());

  readonly items = this._items.asReadonly();
  readonly itemCount = computed(() => this._items().reduce((s, i) => s + i.quantity, 0));
  readonly total = computed(() => this._items().reduce((s, i) => s + i.lineTotal, 0));

  constructor() {
    // Persist to localStorage on every change
    effect(() => {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(this._items()));
      } catch { /* ignore */ }
    });
  }

  addItem(item: Omit<CartItem, 'lineTotal'>): void {
    this._items.update(items => {
      const idx = items.findIndex(i => i.productId === item.productId);
      if (idx >= 0) {
        return items.map((i, n) => n === idx
          ? { ...i, quantity: i.quantity + item.quantity, lineTotal: (i.quantity + item.quantity) * i.unitPrice }
          : i);
      }
      return [...items, { ...item, lineTotal: item.quantity * item.unitPrice }];
    });
  }

  updateQuantity(productId: string, quantity: number): void {
    this._items.update(items =>
      items.map(i => i.productId === productId
        ? { ...i, quantity, lineTotal: quantity * i.unitPrice }
        : i)
    );
  }

  removeItem(productId: string): void {
    this._items.update(items => items.filter(i => i.productId !== productId));
  }

  clear(): void {
    this._items.set([]);
  }

  private _load(): CartItem[] {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
}
