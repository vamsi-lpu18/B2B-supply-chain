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

  normalizeQuantity(quantity: number, minOrderQty: number, availableStock: number): number {
    const safeMin = Math.max(1, Math.trunc(minOrderQty));
    const safeAvailable = Math.max(0, Math.trunc(availableStock));
    const requested = Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0;

    if (safeAvailable === 0) {
      return 0;
    }

    if (safeAvailable < safeMin) {
      return 0;
    }

    const maxPurchasable = Math.floor(safeAvailable / safeMin) * safeMin;
    let next = requested;

    if (next < safeMin) {
      next = safeMin;
    }

    if (next > maxPurchasable) {
      next = maxPurchasable;
    }

    next = Math.floor(next / safeMin) * safeMin;
    return Math.max(safeMin, Math.min(maxPurchasable, next));
  }

  addItem(item: Omit<CartItem, 'lineTotal'>): void {
    this._items.update(items => {
      const incomingQty = this.normalizeQuantity(item.quantity, item.minOrderQty, item.availableStock);
      if (incomingQty <= 0) {
        return items;
      }

      const normalizedMinOrderQty = Math.max(1, Math.trunc(item.minOrderQty));
      const normalizedAvailableStock = Math.max(0, Math.trunc(item.availableStock));

      const idx = items.findIndex(i => i.productId === item.productId);
      if (idx >= 0) {
        const existing = items[idx];
        const mergedQty = this.normalizeQuantity(existing.quantity + incomingQty, normalizedMinOrderQty, normalizedAvailableStock);

        if (mergedQty <= 0) {
          return items.filter(i => i.productId !== item.productId);
        }

        return items.map((i, n) => n === idx
          ? {
              ...i,
              productName: item.productName,
              sku: item.sku,
              note: i.note,
              unitPrice: item.unitPrice,
              minOrderQty: normalizedMinOrderQty,
              availableStock: normalizedAvailableStock,
              quantity: mergedQty,
              lineTotal: mergedQty * item.unitPrice
            }
          : i);
      }

      return [
        ...items,
        {
          ...item,
          note: item.note?.trim() || '',
          minOrderQty: normalizedMinOrderQty,
          availableStock: normalizedAvailableStock,
          quantity: incomingQty,
          lineTotal: incomingQty * item.unitPrice
        }
      ];
    });
  }

  updateNote(productId: string, note: string): void {
    const normalized = note.trim().slice(0, 160);
    this._items.update(items =>
      items.map(item =>
        item.productId === productId
          ? { ...item, note: normalized }
          : item
      )
    );
  }

  updateQuantity(productId: string, quantity: number): void {
    this._items.update(items =>
      items
        .map(i => {
          if (i.productId !== productId) {
            return i;
          }

          const normalizedQty = this.normalizeQuantity(quantity, i.minOrderQty, i.availableStock);
          if (normalizedQty <= 0) {
            return null;
          }

          return {
            ...i,
            quantity: normalizedQty,
            lineTotal: normalizedQty * i.unitPrice
          };
        })
        .filter((i): i is CartItem => i !== null)
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
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(item => this._sanitizeItem(item))
        .filter((item): item is CartItem => item !== null);
    } catch { return []; }
  }

  private _sanitizeItem(raw: unknown): CartItem | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const item = raw as Partial<CartItem>;
    if (!item.productId || !item.productName || !item.sku) {
      return null;
    }

    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return null;
    }

    const minOrderQty = Math.max(1, Math.trunc(Number(item.minOrderQty ?? 1)));
    const availableStock = Math.max(0, Math.trunc(Number(item.availableStock ?? 0)));
    const requestedQty = Number(item.quantity ?? minOrderQty);
    const quantity = this.normalizeQuantity(requestedQty, minOrderQty, availableStock);

    if (quantity <= 0) {
      return null;
    }

    return {
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity,
      note: String(item.note ?? '').trim().slice(0, 160),
      unitPrice,
      minOrderQty,
      availableStock,
      lineTotal: quantity * unitPrice
    };
  }
}
