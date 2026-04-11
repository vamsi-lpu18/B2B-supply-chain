import { NotificationChannel, NotificationStatus } from './enums';

export interface CreateManualNotificationRequest {
  recipientUserId?: string;
  title: string;
  body: string;
  channel: NotificationChannel;
}

export interface IngestIntegrationEventRequest {
  sourceService: string;
  eventType: string;
  payload: string;
  recipientUserId?: string;
}

export interface MarkNotificationFailedRequest {
  failureReason: string;
}

export interface NotificationDto {
  notificationId: string;
  recipientUserId?: string;
  title: string;
  body: string;
  sourceService: string;
  eventType: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  createdAtUtc: string;
  sentAtUtc?: string;
  failureReason?: string;
  isRead: boolean;
  readAtUtc?: string;
}
