import { Injectable } from '@angular/core';
import { ShipmentStatus } from '../models/enums';
import { ShipmentDto } from '../models/logistics.models';

export type ShipmentSlaState = 'on-track' | 'at-risk' | 'delayed' | 'delivered' | 'exception';

export interface ShipmentEtaInfo {
  expectedDeliveryAtUtc: string;
  slaState: ShipmentSlaState;
  slaLabel: string;
  remainingLabel: string;
}

@Injectable({ providedIn: 'root' })
export class ShipmentEtaService {
  private readonly defaultEtaHours = 72;
  private readonly riskWindowHours = 12;

  getEtaInfo(shipment: ShipmentDto, now = new Date()): ShipmentEtaInfo {
    const createdAt = new Date(shipment.createdAtUtc);
    const expected = new Date(createdAt.getTime() + this.defaultEtaHours * 60 * 60 * 1000);

    if (shipment.status === ShipmentStatus.Delivered) {
      return {
        expectedDeliveryAtUtc: expected.toISOString(),
        slaState: 'delivered',
        slaLabel: 'Delivered',
        remainingLabel: 'Completed'
      };
    }

    if (shipment.status === ShipmentStatus.DeliveryFailed || shipment.status === ShipmentStatus.Returned) {
      return {
        expectedDeliveryAtUtc: expected.toISOString(),
        slaState: 'exception',
        slaLabel: 'Exception',
        remainingLabel: 'Needs attention'
      };
    }

    const remainingMs = expected.getTime() - now.getTime();

    if (remainingMs < 0) {
      return {
        expectedDeliveryAtUtc: expected.toISOString(),
        slaState: 'delayed',
        slaLabel: 'Delayed',
        remainingLabel: `${this.formatDuration(Math.abs(remainingMs))} overdue`
      };
    }

    const riskWindowMs = this.riskWindowHours * 60 * 60 * 1000;
    if (remainingMs <= riskWindowMs) {
      return {
        expectedDeliveryAtUtc: expected.toISOString(),
        slaState: 'at-risk',
        slaLabel: 'At Risk',
        remainingLabel: `${this.formatDuration(remainingMs)} left`
      };
    }

    return {
      expectedDeliveryAtUtc: expected.toISOString(),
      slaState: 'on-track',
      slaLabel: 'On Track',
      remainingLabel: `${this.formatDuration(remainingMs)} left`
    };
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
