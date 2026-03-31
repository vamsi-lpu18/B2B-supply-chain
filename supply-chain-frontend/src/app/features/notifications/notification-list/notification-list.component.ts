import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationApiService } from '../../../core/api/notification-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { NotificationDto, CreateManualNotificationRequest } from '../../../core/models/notification.models';
import { NotificationChannel, NotificationStatus, UserRole } from '../../../core/models/enums';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PageBannerComponent } from '../../../shared/components/page-banner/page-banner.component';

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PageBannerComponent],
  template: `
    <app-page-banner banner="notifications" alt="Notifications"></app-page-banner>
    
    <div class="page-content">
      <div class="page-header">
        <h1>Notifications</h1>
        @if (isAdmin()) {
          <button class="btn btn-primary" (click)="showCreateDialog.set(true)">+ Create Notification</button>
        }
      </div>

      <!-- Filters -->
      <div class="d-flex gap-3 mb-6 flex-wrap">
        <select class="form-control" style="width:180px" [(ngModel)]="channelFilter" (ngModelChange)="applyFilter()">
          <option [ngValue]="null">All Channels</option>
          <option [ngValue]="0">In-App</option>
          <option [ngValue]="1">Email</option>
          <option [ngValue]="2">SMS</option>
          <option [ngValue]="3">Push</option>
        </select>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:300px;border-radius:8px"></div>
      } @else if (filtered().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <div class="empty-title">No notifications</div>
        </div>
      } @else {
        <div class="notif-list">
          @for (n of filtered(); track n.notificationId) {
            <div class="notif-item card">
              <div class="notif-header">
                <span class="fw-600">{{ n.title }}</span>
                <div class="d-flex gap-2 align-center">
                  <span class="badge" [class]="statusBadge(n.status)">{{ statusLabel(n.status) }}</span>
                  <span class="text-xs text-secondary">{{ relativeTime(n.createdAtUtc) }}</span>
                </div>
              </div>
              <p class="text-sm text-secondary mt-2">{{ n.body }}</p>
              <div class="d-flex gap-2 mt-2">
                <span class="badge badge-neutral">{{ channelLabel(n.channel) }}</span>
                @if (n.sourceService !== 'Manual') {
                  <span class="badge badge-info text-xs">{{ n.sourceService }}</span>
                }
              </div>
              @if (isAdmin()) {
                <div class="d-flex gap-2 mt-3">
                  @if (n.status === 0) {
                    <button class="btn btn-secondary btn-sm" (click)="markSent(n.notificationId)">Mark Sent</button>
                    <button class="btn btn-danger btn-sm" (click)="markFailed(n.notificationId)">Mark Failed</button>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Create Notification Dialog -->
      @if (showCreateDialog()) {
        <div class="modal-backdrop" (click)="showCreateDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Create Notification</h2><button class="btn btn-ghost btn-icon" (click)="showCreateDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <form [formGroup]="createForm">
                <div class="form-group">
                  <label>Recipient User ID (optional)</label>
                  <input type="text" class="form-control" formControlName="recipientUserId" placeholder="UUID or leave blank for broadcast">
                </div>
                <div class="form-group">
                  <label>Title *</label>
                  <input type="text" class="form-control" formControlName="title" maxlength="200">
                </div>
                <div class="form-group">
                  <label>Body *</label>
                  <textarea class="form-control" formControlName="body" rows="3" maxlength="1000"></textarea>
                </div>
                <div class="form-group">
                  <label>Channel</label>
                  <select class="form-control" formControlName="channel">
                    <option [value]="0">In-App</option>
                    <option [value]="1">Email</option>
                    <option [value]="2">SMS</option>
                    <option [value]="3">Push</option>
                  </select>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showCreateDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="createNotification()" [disabled]="createForm.invalid || actionLoading()">Send</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .notif-list { display: flex; flex-direction: column; gap: 12px; }
    .notif-item { padding: 16px; }
    .notif-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  `]
})
export class NotificationListComponent implements OnInit, OnDestroy {
  private readonly notifApi  = inject(NotificationApiService);
  private readonly authStore = inject(AuthStore);
  private readonly toast     = inject(ToastService);
  private readonly fb        = inject(FormBuilder);

  readonly loading          = signal(true);
  readonly actionLoading    = signal(false);
  readonly all              = signal<NotificationDto[]>([]);
  readonly filtered         = signal<NotificationDto[]>([]);
  readonly showCreateDialog = signal(false);
  channelFilter: NotificationChannel | null = null;
  private refreshTimer?: ReturnType<typeof setInterval>;

  readonly isAdmin = () => this.authStore.hasRole(UserRole.Admin);

  readonly createForm = this.fb.group({
    recipientUserId: [''],
    title:   ['', [Validators.required, Validators.maxLength(200)]],
    body:    ['', [Validators.required, Validators.maxLength(1000)]],
    channel: [0]
  });

  statusLabel(s: NotificationStatus): string { return ['Pending', 'Sent', 'Failed'][s] ?? String(s); }
  statusBadge(s: NotificationStatus): string { return ['badge badge-warning', 'badge badge-success', 'badge badge-error'][s] ?? 'badge badge-neutral'; }
  channelLabel(c: NotificationChannel): string { return ['In-App', 'Email', 'SMS', 'Push'][c] ?? String(c); }

  relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  ngOnInit(): void {
    this.load();
    this.refreshTimer = setInterval(() => this.load(), 60000);
  }

  ngOnDestroy(): void { if (this.refreshTimer) clearInterval(this.refreshTimer); }

  load(): void {
    const obs = this.isAdmin() ? this.notifApi.getAllNotifications() : this.notifApi.getMyNotifications();
    obs.subscribe({
      next: r => {
        const sorted = [...r].sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
        this.all.set(sorted);
        this.applyFilter();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load notifications');
      }
    });
  }

  applyFilter(): void {
    if (this.channelFilter === null) this.filtered.set(this.all());
    else this.filtered.set(this.all().filter(n => n.channel === this.channelFilter));
  }

  markSent(id: string): void {
    this.notifApi.markSent(id).subscribe({
      next: () => {
        this.toast.success('Marked as sent');
        this.load();
      },
      error: () => this.toast.error('Failed to mark notification as sent')
    });
  }

  markFailed(id: string): void {
    this.notifApi.markFailed(id, { failureReason: 'Manually marked failed' }).subscribe({
      next: () => {
        this.toast.info('Marked as failed');
        this.load();
      },
      error: () => this.toast.error('Failed to mark notification as failed')
    });
  }

  createNotification(): void {
    if (this.createForm.invalid) return;
    this.actionLoading.set(true);
    const v = this.createForm.value;
    const req: CreateManualNotificationRequest = {
      title: v.title!, body: v.body!, channel: Number(v.channel) as NotificationChannel,
      recipientUserId: v.recipientUserId || undefined
    };
    this.notifApi.createManual(req).subscribe({
      next: () => { this.toast.success('Notification sent'); this.showCreateDialog.set(false); this.createForm.reset({ channel: 0 }); this.load(); this.actionLoading.set(false); },
      error: () => {
        this.actionLoading.set(false);
        this.toast.error('Failed to create notification');
      }
    });
  }
}
