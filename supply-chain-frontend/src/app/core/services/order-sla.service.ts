import { Injectable } from '@angular/core';
import { OrderStatus } from '../models/enums';
import { OrderListItemDto } from '../models/order.models';

export type OrderSlaState = 'on-track' | 'at-risk' | 'delayed' | 'closed';

export interface OrderSlaInfo {
  expectedAtUtc: string;
  state: OrderSlaState;
  label: string;
  remainingLabel: string;
}

@Injectable({ providedIn: 'root' })
export class OrderSlaService {
  private readonly earlyStageHours = 24;
  private readonly transitStageHours = 72;
  private readonly returnStageHours = 120;
  private readonly riskWindowHours = 8;

  getSlaInfo(order: OrderListItemDto, now = new Date()): OrderSlaInfo {
    if (this.isClosedState(order.status)) {
      const expected = new Date(order.placedAtUtc);
      return {
        expectedAtUtc: expected.toISOString(),
        state: 'closed',
        label: 'Closed',
        remainingLabel: 'Completed'
      };
    }

    const placedAt = new Date(order.placedAtUtc);
    const expected = new Date(placedAt.getTime() + this.windowHours(order.status) * 60 * 60 * 1000);
    const remainingMs = expected.getTime() - now.getTime();

    if (remainingMs < 0) {
      return {
        expectedAtUtc: expected.toISOString(),
        state: 'delayed',
        label: 'Delayed',
        remainingLabel: `${this.formatDuration(Math.abs(remainingMs))} overdue`
      };
    }

    const riskWindowMs = this.riskWindowHours * 60 * 60 * 1000;
    if (remainingMs <= riskWindowMs) {
      return {
        expectedAtUtc: expected.toISOString(),
        state: 'at-risk',
        label: 'At Risk',
        remainingLabel: `${this.formatDuration(remainingMs)} left`
      };
    }

    return {
      expectedAtUtc: expected.toISOString(),
      state: 'on-track',
      label: 'On Track',
      remainingLabel: `${this.formatDuration(remainingMs)} left`
    };
  }

  private windowHours(status: OrderStatus): number {
    if (status === OrderStatus.ReturnRequested || status === OrderStatus.ReturnApproved || status === OrderStatus.ReturnRejected) {
      return this.returnStageHours;
    }

    if (status === OrderStatus.ReadyForDispatch || status === OrderStatus.InTransit || status === OrderStatus.Exception) {
      return this.transitStageHours;
    }

    return this.earlyStageHours;
  }

  private isClosedState(status: OrderStatus): boolean {
    return (
      status === OrderStatus.Delivered ||
      status === OrderStatus.Closed ||
      status === OrderStatus.Cancelled
    );
  }

  private formatDuration(durationMs: number): string {
    const totalHours = Math.floor(durationMs / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days > 0) {
      return `${days}d ${hours}h`;
    }

    const mins = Math.max(0, Math.floor((durationMs % (60 * 60 * 1000)) / (60 * 1000)));
    if (totalHours > 0) {
      return `${totalHours}h ${mins}m`;
    }

    return `${mins}m`;
  }
}
