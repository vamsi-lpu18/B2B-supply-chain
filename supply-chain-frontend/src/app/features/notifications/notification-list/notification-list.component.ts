import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationApiService } from '../../../core/api/notification-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { NotificationPreferences, NotificationPreferencesService } from '../../../core/services/notification-preferences.service';
import { NotificationDto, CreateManualNotificationRequest } from '../../../core/models/notification.models';
import { NotificationChannel, NotificationStatus, UserRole } from '../../../core/models/enums';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

type NotificationPriorityLevel = 'high' | 'normal' | 'low';

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>Notifications</h1>
        <div class="d-flex gap-2 align-center flex-wrap">
          <span class="badge badge-primary">{{ unreadCount() }} unread</span>
          <button class="btn btn-secondary btn-sm" (click)="markAllRead()" [disabled]="filtered().length === 0 || unreadCount() === 0">Mark All Read</button>
          <button class="btn btn-ghost btn-sm" (click)="openPreferences()">Preferences</button>
          @if (isAdmin()) {
            <button class="btn btn-primary" (click)="showCreateDialog.set(true)">+ Create Notification</button>
          }
        </div>
      </div>

      <div class="d-flex gap-2 mb-3 flex-wrap">
        <button class="btn btn-sm" [class]="eventTypeFilter === 'all' ? 'btn-primary' : 'btn-ghost'" (click)="setEventTypeFilter('all')">All Types</button>
        @for (eventType of availableEventTypes(); track eventType) {
          <button class="btn btn-sm" [class]="eventTypeFilter === eventType ? 'btn-primary' : 'btn-ghost'" (click)="setEventTypeFilter(eventType)">
            {{ eventTypeLabel(eventType) }}
          </button>
        }
      </div>

      <div class="d-flex gap-2 mb-4 flex-wrap">
        <button class="btn btn-sm" [class]="priorityFilter === 'all' ? 'btn-primary' : 'btn-ghost'" (click)="setPriorityFilter('all')">All Priority</button>
        <button class="btn btn-sm" [class]="priorityFilter === 'high' ? 'btn-danger' : 'btn-ghost'" (click)="setPriorityFilter('high')">High</button>
        <button class="btn btn-sm" [class]="priorityFilter === 'normal' ? 'btn-secondary' : 'btn-ghost'" (click)="setPriorityFilter('normal')">Normal</button>
        <button class="btn btn-sm" [class]="priorityFilter === 'low' ? 'btn-secondary' : 'btn-ghost'" (click)="setPriorityFilter('low')">Low</button>
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
        <select class="form-control" style="width:180px" [(ngModel)]="readFilter" (ngModelChange)="applyFilter()">
          <option value="all">All Read States</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
        <input type="search"
               class="form-control"
               style="min-width:220px"
               placeholder="Search title, body, source"
               [(ngModel)]="searchQuery"
               (ngModelChange)="onSearchChange()">
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
            <div class="notif-item card" [class.notif-item-unread]="!isRead(n.notificationId)">
              <div class="notif-header">
                <div class="notif-title-wrap">
                  @if (!isRead(n.notificationId)) {
                    <span class="notif-unread-dot" aria-hidden="true"></span>
                  }
                  <span class="fw-600">{{ n.title }}</span>
                </div>
                <div class="d-flex gap-2 align-center">
                  <span class="badge" [class]="statusBadge(n.status)">{{ statusLabel(n.status) }}</span>
                  <span class="text-xs text-secondary">{{ relativeTime(n.createdAtUtc) }}</span>
                </div>
              </div>
              <p class="text-sm text-secondary mt-2">{{ n.body }}</p>
              <div class="d-flex gap-2 mt-2">
                <span class="badge badge-neutral">{{ channelLabel(n.channel) }}</span>
                <span class="badge" [class]="priorityBadge(priorityLevel(n))">{{ priorityLevelLabel(priorityLevel(n)) }}</span>
                <span class="badge" [class]="isRead(n.notificationId) ? 'badge-success' : 'badge-warning'">{{ isRead(n.notificationId) ? 'Read' : 'Unread' }}</span>
                @if (n.sourceService !== 'Manual') {
                  <span class="badge badge-info text-xs">{{ n.sourceService }}</span>
                }
              </div>

              <div class="d-flex gap-2 mt-3 flex-wrap">
                <button class="btn btn-secondary btn-sm" (click)="toggleRead(n.notificationId, true)" [disabled]="isRead(n.notificationId)">Mark Read</button>
                <button class="btn btn-ghost btn-sm" (click)="toggleRead(n.notificationId, false)" [disabled]="!isRead(n.notificationId)">Mark Unread</button>
                @if (isAdmin()) {
                  @if (n.status === 0) {
                    <button class="btn btn-secondary btn-sm" (click)="markSent(n.notificationId)">Mark Sent</button>
                    <button class="btn btn-danger btn-sm" (click)="markFailed(n.notificationId)">Mark Failed</button>
                  }
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Preferences Dialog -->
      @if (showPreferencesDialog()) {
        <div class="modal-backdrop" (click)="showPreferencesDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Notification Preferences</h2><button class="btn btn-ghost btn-icon" (click)="showPreferencesDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Enabled Channels</label>
                <div class="d-flex gap-3 flex-wrap mt-2">
                  <label class="text-sm"><input type="checkbox" [checked]="isChannelEnabledInDraft(NotificationChannel.InApp)" (change)="toggleDraftChannel(NotificationChannel.InApp, $any($event.target).checked)"> In-App</label>
                  <label class="text-sm"><input type="checkbox" [checked]="isChannelEnabledInDraft(NotificationChannel.Email)" (change)="toggleDraftChannel(NotificationChannel.Email, $any($event.target).checked)"> Email</label>
                  <label class="text-sm"><input type="checkbox" [checked]="isChannelEnabledInDraft(NotificationChannel.Sms)" (change)="toggleDraftChannel(NotificationChannel.Sms, $any($event.target).checked)"> SMS</label>
                  <label class="text-sm"><input type="checkbox" [checked]="isChannelEnabledInDraft(NotificationChannel.Push)" (change)="toggleDraftChannel(NotificationChannel.Push, $any($event.target).checked)"> Push</label>
                </div>
              </div>

              <div class="form-group">
                <label>Muted Source Services</label>
                @if (availableSources().length === 0) {
                  <p class="text-sm text-secondary mt-2">No source services available.</p>
                } @else {
                  <div class="d-flex gap-3 flex-wrap mt-2">
                    @for (source of availableSources(); track source) {
                      <label class="text-sm">
                        <input type="checkbox"
                               [checked]="!isSourceMutedInDraft(source)"
                               (change)="toggleDraftSource(source, !$any($event.target).checked)">
                        {{ source }}
                      </label>
                    }
                  </div>
                }
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" (click)="resetPreferences()">Reset</button>
              <button class="btn btn-secondary" (click)="showPreferencesDialog.set(false)">Close</button>
              <button class="btn btn-primary" (click)="savePreferences()">Save Preferences</button>
            </div>
          </div>
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
    .notif-item-unread {
      border-color: #bfdbfe;
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.12);
    }
    .notif-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .notif-title-wrap { display: flex; align-items: center; gap: 8px; }
    .notif-unread-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
      flex-shrink: 0;
    }
  `]
})
export class NotificationListComponent implements OnInit, OnDestroy {
  private readonly notifApi  = inject(NotificationApiService);
  private readonly authStore = inject(AuthStore);
  private readonly toast     = inject(ToastService);
  private readonly preferencesService = inject(NotificationPreferencesService);
  private readonly fb        = inject(FormBuilder);

  readonly loading          = signal(true);
  readonly actionLoading    = signal(false);
  readonly all              = signal<NotificationDto[]>([]);
  readonly filtered         = signal<NotificationDto[]>([]);
  readonly showCreateDialog = signal(false);
  readonly showPreferencesDialog = signal(false);
  readonly readMap          = signal<Record<string, true>>({});
  readonly availableEventTypes = signal<string[]>([]);
  readonly availableSources = signal<string[]>([]);
  readonly preferences      = signal<NotificationPreferences>(this.preferencesService.createDefault());
  readonly preferenceDraft  = signal<NotificationPreferences>(this.preferencesService.createDefault());
  readonly unreadCount      = computed(() => this.all().reduce((count, item) => count + (this.isRead(item.notificationId) ? 0 : 1), 0));
  readonly NotificationChannel = NotificationChannel;
  channelFilter: NotificationChannel | null = null;
  readFilter: 'all' | 'unread' | 'read' = 'all';
  eventTypeFilter: 'all' | string = 'all';
  priorityFilter: 'all' | NotificationPriorityLevel = 'all';
  searchQuery = '';
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

  setEventTypeFilter(value: 'all' | string): void {
    this.eventTypeFilter = value;
    this.applyFilter();
  }

  setPriorityFilter(value: 'all' | NotificationPriorityLevel): void {
    this.priorityFilter = value;
    this.applyFilter();
  }

  eventTypeLabel(eventType: string): string {
    return eventType.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  }

  priorityLevel(notification: NotificationDto): NotificationPriorityLevel {
    const eventText = `${notification.eventType} ${notification.title}`.toLowerCase();

    if (
      notification.status === NotificationStatus.Failed ||
      /(fail|exception|escalat|reject|cancel|overdue|delay|breach)/.test(eventText)
    ) {
      return 'high';
    }

    if (/(summary|digest|info|broadcast)/.test(eventText) || notification.status === NotificationStatus.Sent) {
      return 'low';
    }

    return 'normal';
  }

  priorityLevelLabel(level: NotificationPriorityLevel): string {
    if (level === 'high') return 'High';
    if (level === 'low') return 'Low';
    return 'Normal';
  }

  priorityBadge(level: NotificationPriorityLevel): string {
    if (level === 'high') return 'badge badge-error';
    if (level === 'low') return 'badge badge-neutral';
    return 'badge badge-warning';
  }

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
    this.readMap.set({});
    this.preferences.set(this.preferencesService.loadForUser(this.currentUserId()));
    this.load();
    this.refreshTimer = setInterval(() => this.load(), 60000);
  }

  ngOnDestroy(): void { if (this.refreshTimer) clearInterval(this.refreshTimer); }

  load(): void {
    const obs = this.isAdmin() ? this.notifApi.getAllNotifications() : this.notifApi.getMyNotifications();
    obs.subscribe({
      next: r => {
        const sorted = [...r].sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
        this.readMap.set(this.buildReadMap(sorted));
        this.all.set(sorted);
        this.availableEventTypes.set(this.extractEventTypes(sorted));
        this.availableSources.set(this.extractSources(sorted));
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
    let view = [...this.all()];
    const prefs = this.preferences();

    if (this.channelFilter !== null) {
      view = view.filter(n => n.channel === this.channelFilter);
    }

    if (this.eventTypeFilter !== 'all') {
      view = view.filter(n => n.eventType === this.eventTypeFilter);
    }

    view = view.filter(n => !!prefs.channelEnabled[n.channel]);
    view = view.filter(n => !prefs.mutedSourceServices.includes(this.normalizeSource(n.sourceService)));

    if (this.readFilter === 'unread') {
      view = view.filter(n => !this.isRead(n.notificationId));
    } else if (this.readFilter === 'read') {
      view = view.filter(n => this.isRead(n.notificationId));
    }

    if (this.priorityFilter !== 'all') {
      view = view.filter(n => this.priorityLevel(n) === this.priorityFilter);
    }

    const query = this.searchQuery.trim().toLowerCase();
    if (query) {
      view = view.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.body.toLowerCase().includes(query) ||
        n.sourceService.toLowerCase().includes(query) ||
        n.eventType.toLowerCase().includes(query)
      );
    }

    this.filtered.set(view);
  }

  onSearchChange(): void {
    this.applyFilter();
  }

  isRead(notificationId: string): boolean {
    return !!this.readMap()[notificationId];
  }

  toggleRead(notificationId: string, markRead: boolean): void {
    this.actionLoading.set(true);
    const request = markRead ? this.notifApi.markRead(notificationId) : this.notifApi.markUnread(notificationId);

    request.subscribe({
      next: () => {
        this.readMap.update(current => {
          const next = { ...current };
          if (markRead) {
            next[notificationId] = true;
          } else {
            delete next[notificationId];
          }

          return next;
        });

        this.applyFilter();
        this.actionLoading.set(false);
      },
      error: () => {
        this.toast.error(markRead ? 'Failed to mark notification as read' : 'Failed to mark notification as unread');
        this.actionLoading.set(false);
      }
    });
  }

  markAllRead(): void {
    if (this.filtered().length === 0 || this.unreadCount() === 0) {
      return;
    }

    const ids = this.filtered()
      .filter(item => !this.isRead(item.notificationId))
      .map(item => item.notificationId);

    if (ids.length === 0) {
      return;
    }

    this.actionLoading.set(true);
    let remaining = ids.length;
    let hasError = false;

    for (const id of ids) {
      this.notifApi.markRead(id).subscribe({
        next: () => {
          this.readMap.update(current => ({ ...current, [id]: true }));
          remaining -= 1;
          if (remaining === 0)
          {
            if (hasError) {
              this.toast.warning('Some notifications could not be marked as read');
            }

            this.applyFilter();
            this.actionLoading.set(false);
          }
        },
        error: () => {
          hasError = true;
          remaining -= 1;
          if (remaining === 0)
          {
            this.toast.warning('Some notifications could not be marked as read');
            this.applyFilter();
            this.actionLoading.set(false);
          }
        }
      });
    }
  }

  openPreferences(): void {
    this.preferenceDraft.set(JSON.parse(JSON.stringify(this.preferences())) as NotificationPreferences);
    this.showPreferencesDialog.set(true);
  }

  isChannelEnabledInDraft(channel: NotificationChannel): boolean {
    return !!this.preferenceDraft().channelEnabled[channel];
  }

  toggleDraftChannel(channel: NotificationChannel, enabled: boolean): void {
    this.preferenceDraft.update(current => ({
      ...current,
      channelEnabled: {
        ...current.channelEnabled,
        [channel]: enabled
      }
    }));
  }

  isSourceMutedInDraft(source: string): boolean {
    return this.preferenceDraft().mutedSourceServices.includes(this.normalizeSource(source));
  }

  toggleDraftSource(source: string, mute: boolean): void {
    const key = this.normalizeSource(source);
    this.preferenceDraft.update(current => {
      const muted = current.mutedSourceServices.filter(item => item !== key);
      if (mute) {
        muted.push(key);
      }

      return {
        ...current,
        mutedSourceServices: muted
      };
    });
  }

  savePreferences(): void {
    const userId = this.currentUserId();
    const sanitized: NotificationPreferences = {
      channelEnabled: {
        [NotificationChannel.InApp]: !!this.preferenceDraft().channelEnabled[NotificationChannel.InApp],
        [NotificationChannel.Email]: !!this.preferenceDraft().channelEnabled[NotificationChannel.Email],
        [NotificationChannel.Sms]: !!this.preferenceDraft().channelEnabled[NotificationChannel.Sms],
        [NotificationChannel.Push]: !!this.preferenceDraft().channelEnabled[NotificationChannel.Push]
      },
      mutedSourceServices: Array.from(new Set(this.preferenceDraft().mutedSourceServices.map(source => this.normalizeSource(source))))
    };

    this.preferences.set(sanitized);
    this.preferencesService.saveForUser(userId, sanitized);
    this.showPreferencesDialog.set(false);
    this.applyFilter();
    this.toast.success('Notification preferences saved');
  }

  resetPreferences(): void {
    const defaults = this.preferencesService.createDefault();
    this.preferenceDraft.set(defaults);
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

  private currentUserId(): string {
    return this.authStore.user()?.userId ?? 'anonymous';
  }

  private extractSources(items: NotificationDto[]): string[] {
    return Array.from(new Set(items.map(item => item.sourceService).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  private extractEventTypes(items: NotificationDto[]): string[] {
    return Array.from(new Set(items.map(item => item.eventType).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  private normalizeSource(source: string): string {
    return source.trim().toLowerCase();
  }

  private buildReadMap(items: NotificationDto[]): Record<string, true> {
    const map: Record<string, true> = {};
    for (const item of items) {
      if (item.isRead) {
        map[item.notificationId] = true;
      }
    }

    return map;
  }
}
