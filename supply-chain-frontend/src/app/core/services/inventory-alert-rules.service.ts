import { Injectable, signal } from '@angular/core';

export interface InventoryAlertRules {
  lowStockThreshold: number;
  includeOutOfStock: boolean;
}

const STORAGE_KEY = 'scp.inventory-alert-rules.v1';
const DEFAULT_RULES: InventoryAlertRules = {
  lowStockThreshold: 10,
  includeOutOfStock: true
};

@Injectable({ providedIn: 'root' })
export class InventoryAlertRulesService {
  private readonly _rules = signal<InventoryAlertRules>(this.load());

  readonly rules = this._rules.asReadonly();

  updateLowStockThreshold(value: number): void {
    this.setRules({
      ...this._rules(),
      lowStockThreshold: this.sanitizeThreshold(value)
    });
  }

  updateIncludeOutOfStock(value: boolean): void {
    this.setRules({
      ...this._rules(),
      includeOutOfStock: !!value
    });
  }

  private setRules(next: InventoryAlertRules): void {
    this._rules.set(next);
    this.persist(next);
  }

  private sanitizeThreshold(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_RULES.lowStockThreshold;
    }

    const normalized = Math.trunc(value);
    return Math.max(1, Math.min(999, normalized));
  }

  private load(): InventoryAlertRules {
    if (typeof window === 'undefined') {
      return DEFAULT_RULES;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return DEFAULT_RULES;
      }

      const parsed = JSON.parse(raw) as Partial<InventoryAlertRules>;
      return {
        lowStockThreshold: this.sanitizeThreshold(Number(parsed.lowStockThreshold ?? DEFAULT_RULES.lowStockThreshold)),
        includeOutOfStock: parsed.includeOutOfStock ?? DEFAULT_RULES.includeOutOfStock
      };
    } catch {
      return DEFAULT_RULES;
    }
  }

  private persist(rules: InventoryAlertRules): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // Ignore localStorage failures.
    }
  }
}
