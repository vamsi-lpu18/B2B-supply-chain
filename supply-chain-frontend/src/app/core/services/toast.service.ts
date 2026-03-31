import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _id = 0;
  readonly toasts = signal<Toast[]>([]);

  success(message: string, duration = 3000): void { this._add('success', message, duration); }
  error(message: string, duration = 5000): void   { this._add('error',   message, duration); }
  warning(message: string, duration = 4000): void { this._add('warning', message, duration); }
  info(message: string, duration = 3000): void    { this._add('info',    message, duration); }

  dismiss(id: number): void {
    this.toasts.update(ts => ts.filter(t => t.id !== id));
  }

  private _add(type: ToastType, message: string, duration: number): void {
    const id = ++this._id;
    this.toasts.update(ts => [...ts, { id, type, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}
