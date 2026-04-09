import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateOrderRequest, CancelOrderRequest, UpdateOrderStatusRequest,
  ReturnRequestDto, AdminDecisionRequest, OrderDto, OrderListItemDto,
  BulkUpdateOrderStatusRequest, BulkUpdateOrderStatusResultDto
} from '../models/order.models';
import { PagedResult } from '../models/shared.models';
import { OrderStatus } from '../models/enums';

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/orders/api/orders';

  createOrder(req: CreateOrderRequest): Observable<OrderDto> {
    return this.http.post<OrderDto>(this.base, req);
  }

  getMyOrders(page = 1, pageSize = 20, status?: OrderStatus): Observable<PagedResult<OrderListItemDto>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status !== undefined) params = params.set('status', status);
    return this.http.get<PagedResult<OrderListItemDto>>(`${this.base}/my`, { params });
  }

  getOrderById(id: string): Observable<OrderDto> {
    return this.http.get<OrderDto>(`${this.base}/${id}`);
  }

  updateStatus(id: string, req: UpdateOrderStatusRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${id}/status`, req);
  }

  cancelOrder(id: string, req: CancelOrderRequest): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/cancel`, req);
  }

  requestReturn(id: string, req: ReturnRequestDto): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/returns`, req);
  }
}

@Injectable({ providedIn: 'root' })
export class AdminOrderApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/orders/api/admin/orders';

  getAllOrders(page = 1, pageSize = 20, status?: OrderStatus): Observable<PagedResult<OrderListItemDto>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status !== undefined) params = params.set('status', status);
    return this.http.get<PagedResult<OrderListItemDto>>(this.base, { params });
  }

  approveHold(id: string): Observable<unknown> {
    return this.http.put(`${this.base}/${id}/approve-hold`, {});
  }

  rejectHold(id: string, req: AdminDecisionRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${id}/reject-hold`, req);
  }

  bulkUpdateStatus(req: BulkUpdateOrderStatusRequest): Observable<BulkUpdateOrderStatusResultDto> {
    return this.http.post<BulkUpdateOrderStatusResultDto>(`${this.base}/bulk-status`, req);
  }
}
