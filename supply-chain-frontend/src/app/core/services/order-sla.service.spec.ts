import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../models/enums';
import { OrderListItemDto } from '../models/order.models';
import { OrderSlaService } from './order-sla.service';

describe('OrderSlaService', () => {
  const service = new OrderSlaService();

  function makeOrder(status: OrderStatus, placedAtUtc: string): OrderListItemDto {
    return {
      orderId: 'o-1',
      orderNumber: 'ORD-1',
      dealerId: 'd-1',
      status,
      totalAmount: 1000,
      placedAtUtc
    };
  }

  it('returns closed state for delivered orders', () => {
    const order = makeOrder(OrderStatus.Delivered, '2026-04-01T10:00:00.000Z');

    const result = service.getSlaInfo(order, new Date('2026-04-02T10:00:00.000Z'));

    expect(result.state).toBe('closed');
    expect(result.label).toBe('Closed');
    expect(result.remainingLabel).toBe('Completed');
  });

  it('returns delayed state when SLA is exceeded', () => {
    const order = makeOrder(OrderStatus.Placed, '2026-04-01T10:00:00.000Z');

    const result = service.getSlaInfo(order, new Date('2026-04-02T12:00:00.000Z'));

    expect(result.state).toBe('delayed');
    expect(result.remainingLabel).toContain('overdue');
  });

  it('returns at-risk state near SLA boundary', () => {
    const order = makeOrder(OrderStatus.Processing, '2026-04-01T10:00:00.000Z');

    const result = service.getSlaInfo(order, new Date('2026-04-02T04:30:00.000Z'));

    expect(result.state).toBe('at-risk');
    expect(result.remainingLabel).toContain('left');
  });
});
