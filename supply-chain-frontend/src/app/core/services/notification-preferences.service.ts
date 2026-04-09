import { Injectable } from '@angular/core';
import { NotificationChannel } from '../models/enums';

export interface NotificationPreferences {
  channelEnabled: Record<number, boolean>;
  mutedSourceServices: string[];
}

const STORAGE_KEY_PREFIX = 'scp.notification-preferences.v1';

@Injectable({ providedIn: 'root' })
export class NotificationPreferencesService {
  createDefault(): NotificationPreferences {
    return {
      channelEnabled: {
        [NotificationChannel.InApp]: true,
        [NotificationChannel.Email]: true,
        [NotificationChannel.Sms]: true,
        [NotificationChannel.Push]: true
      },
      mutedSourceServices: []
    };
  }

  loadForUser(userId: string): NotificationPreferences {
    if (typeof window === 'undefined') {
      return this.createDefault();
    }

    try {
      const raw = window.localStorage.getItem(this.keyFor(userId));
      if (!raw) {
        return this.createDefault();
      }

      const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
      const defaults = this.createDefault();

      return {
        channelEnabled: {
          ...defaults.channelEnabled,
          ...(parsed.channelEnabled ?? {})
        },
        mutedSourceServices: Array.isArray(parsed.mutedSourceServices)
          ? parsed.mutedSourceServices.filter(source => typeof source === 'string').map(source => source.trim().toLowerCase()).filter(Boolean)
          : []
      };
    } catch {
      return this.createDefault();
    }
  }

  saveForUser(userId: string, preferences: NotificationPreferences): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(this.keyFor(userId), JSON.stringify(preferences));
    } catch {
      // Ignore localStorage failures.
    }
  }

  private keyFor(userId: string): string {
    return `${STORAGE_KEY_PREFIX}.${userId || 'anonymous'}`;
  }
}
