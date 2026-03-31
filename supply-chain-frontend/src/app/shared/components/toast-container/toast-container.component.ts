import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastType } from '../../../core/services/toast.service';

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ'
};

const TITLES: Record<ToastType, string> = {
  success: 'Success',
  error:   'Error',
  warning: 'Warning',
  info:    'Info'
};

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast toast-{{ toast.type }}">
          <div class="toast-icon-wrap toast-icon-{{ toast.type }}">{{ icon(toast.type) }}</div>
          <div class="toast-body">
            <div class="toast-title">{{ title(toast.type) }}</div>
            <div class="toast-msg">{{ toast.message }}</div>
          </div>
          <button class="toast-close" (click)="toastService.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-icon-wrap {
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .toast-icon-success { background: var(--success-light); color: var(--success); }
    .toast-icon-error   { background: var(--error-light);   color: var(--error); }
    .toast-icon-warning { background: var(--warning-light); color: var(--warning); }
    .toast-icon-info    { background: var(--info-light);    color: var(--info); }
  `]
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);
  icon(t: ToastType): string  { return ICONS[t]; }
  title(t: ToastType): string { return TITLES[t]; }
}
