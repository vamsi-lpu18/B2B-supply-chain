import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateManualNotificationRequest, IngestIntegrationEventRequest,
  MarkNotificationFailedRequest, NotificationDto
} from '../models/notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/notifications/api/notifications';

  createManual(req: CreateManualNotificationRequest): Observable<NotificationDto> {
    return this.http.post<NotificationDto>(`${this.base}/manual`, req);
  }

  ingest(req: IngestIntegrationEventRequest): Observable<NotificationDto> {
    return this.http.post<NotificationDto>(`${this.base}/ingest`, req);
  }

  getMyNotifications(): Observable<NotificationDto[]> {
    return this.http.get<NotificationDto[]>(`${this.base}/my`);
  }

  getAllNotifications(): Observable<NotificationDto[]> {
    return this.http.get<NotificationDto[]>(this.base);
  }

  getById(id: string): Observable<NotificationDto> {
    return this.http.get<NotificationDto>(`${this.base}/${id}`);
  }

  markSent(id: string): Observable<unknown> {
    return this.http.put(`${this.base}/${id}/sent`, {});
  }

  markFailed(id: string, req: MarkNotificationFailedRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${id}/failed`, req);
  }
}
