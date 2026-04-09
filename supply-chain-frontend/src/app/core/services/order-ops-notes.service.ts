import { Injectable } from '@angular/core';

export interface OrderOpsNote {
  noteId: string;
  orderId: string;
  text: string;
  tags: string[];
  createdAtUtc: string;
  createdByRole: string;
}

const STORAGE_KEY_PREFIX = 'scp.order-ops-notes.v1';

@Injectable({ providedIn: 'root' })
export class OrderOpsNotesService {
  list(orderId: string): OrderOpsNote[] {
    const items = this.loadAll().filter(item => item.orderId === orderId);
    return items.sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
  }

  add(orderId: string, text: string, tags: string[], createdByRole: string): OrderOpsNote {
    const note: OrderOpsNote = {
      noteId: this.createId(),
      orderId,
      text: text.trim(),
      tags: this.sanitizeTags(tags),
      createdAtUtc: new Date().toISOString(),
      createdByRole: createdByRole.trim() || 'System'
    };

    const next = [...this.loadAll(), note];
    this.persistAll(next);
    return note;
  }

  remove(orderId: string, noteId: string): void {
    const next = this.loadAll().filter(item => !(item.orderId === orderId && item.noteId === noteId));
    this.persistAll(next);
  }

  private storageKey(): string {
    return STORAGE_KEY_PREFIX;
  }

  private loadAll(): OrderOpsNote[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey());
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as OrderOpsNote[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(item => !!item && typeof item === 'object')
        .map(item => ({
          noteId: String(item.noteId ?? ''),
          orderId: String(item.orderId ?? ''),
          text: String(item.text ?? '').trim(),
          tags: this.sanitizeTags(Array.isArray(item.tags) ? item.tags : []),
          createdAtUtc: String(item.createdAtUtc ?? new Date().toISOString()),
          createdByRole: String(item.createdByRole ?? 'System')
        }))
        .filter(item => !!item.noteId && !!item.orderId && !!item.text);
    } catch {
      return [];
    }
  }

  private persistAll(items: OrderOpsNote[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(this.storageKey(), JSON.stringify(items));
    } catch {
      // Ignore localStorage failures.
    }
  }

  private sanitizeTags(tags: string[]): string[] {
    return Array.from(
      new Set(
        tags
          .map(tag => tag.trim())
          .filter(Boolean)
          .map(tag => tag.slice(0, 24))
      )
    ).slice(0, 8);
  }

  private createId(): string {
    const random = Math.random().toString(36).slice(2, 10);
    return `${Date.now()}-${random}`;
  }
}
