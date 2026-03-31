import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="auth-page">
      <div class="unauth-card card empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">Access Denied</div>
        <div class="empty-desc">You don't have permission to view this page.</div>
        <a routerLink="/dashboard" class="btn btn-primary mt-4">Go to Dashboard</a>
      </div>
    </div>
  `,
  styles: [`
    .unauth-card {
      width: min(520px, 100%);
      padding: 48px 28px;
      border-radius: 22px;
      border: 1px solid #d7e3ef;
      box-shadow: 0 20px 42px rgba(15, 23, 42, 0.12);
    }

    .empty-title {
      font-family: var(--font-display);
      font-size: 1.55rem;
      letter-spacing: -.02em;
    }

    .empty-desc {
      color: #475569;
      font-weight: 600;
    }
  `]
})
export class UnauthorizedComponent {}
