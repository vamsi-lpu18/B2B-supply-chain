import { Injectable } from '@angular/core';

export type DeliveryAttemptOutcome = 'failed' | 'rescheduled' | 'no-response' | 'address-issue' | 'other';

export interface ShipmentDeliveryAttempt {
  attemptId: string;
  shipmentId: string;
  reason: string;
  outcome: DeliveryAttemptOutcome;
  createdAtUtc: string;
  createdByRole: string;
}

const STORAGE_KEY_PREFIX = 'scp.shipment-delivery-attempts.v1';

@Injectable({ providedIn: 'root' })
export class ShipmentDeliveryAttemptsService {
  list(shipmentId: string): ShipmentDeliveryAttempt[] {
    return this.loadAll()
      .filter(item => item.shipmentId === shipmentId)
      .sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
  }

  add(shipmentId: string, reason: string, outcome: DeliveryAttemptOutcome, createdByRole: string): ShipmentDeliveryAttempt {
    const attempt: ShipmentDeliveryAttempt = {
      attemptId: this.createId(),
      shipmentId,
      reason: reason.trim(),
      outcome,
      createdAtUtc: new Date().toISOString(),
      createdByRole: createdByRole.trim() || 'System'
    };

    const next = [...this.loadAll(), attempt];
    this.persistAll(next);
    return attempt;
  }

  private storageKey(): string {
    return STORAGE_KEY_PREFIX;
  }

  private loadAll(): ShipmentDeliveryAttempt[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey());
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as ShipmentDeliveryAttempt[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(item => !!item && typeof item === 'object')
        .map(item => ({
          attemptId: String(item.attemptId ?? ''),
          shipmentId: String(item.shipmentId ?? ''),
          reason: String(item.reason ?? '').trim(),
          outcome: this.normalizeOutcome(item.outcome),
          createdAtUtc: String(item.createdAtUtc ?? new Date().toISOString()),
          createdByRole: String(item.createdByRole ?? 'System')
        }))
        .filter(item => !!item.attemptId && !!item.shipmentId && !!item.reason);
    } catch {
      return [];
    }
  }

  private persistAll(items: ShipmentDeliveryAttempt[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(this.storageKey(), JSON.stringify(items));
    } catch {
      // Ignore localStorage failures.
    }
  }

  private normalizeOutcome(value: unknown): DeliveryAttemptOutcome {
    const normalized = String(value ?? '').toLowerCase().trim();
    if (normalized === 'failed' || normalized === 'rescheduled' || normalized === 'no-response' || normalized === 'address-issue') {
      return normalized;
    }

    return 'other';
  }

  private createId(): string {
    const random = Math.random().toString(36).slice(2, 10);
    return `${Date.now()}-${random}`;
  }
}
