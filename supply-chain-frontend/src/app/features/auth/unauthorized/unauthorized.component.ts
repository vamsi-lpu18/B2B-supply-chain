import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="auth-page page-content">
      <div class="auth-shell">
        <div class="page-header auth-header">
          <div class="page-title">
            <h1>Access Denied</h1>
            <p>You don't have permission to view this page.</p>
          </div>
          <a routerLink="/dashboard" class="btn btn-primary btn-sm">Go to Dashboard</a>
        </div>

        <div class="unauth-card card empty-state">
          <div class="empty-icon">🔒</div>
          <div class="empty-title">Access Denied</div>
          <div class="empty-desc">Your role does not grant access to this route.</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .unauth-card {
      width: 100%;
      padding: 44px 28px;
      border-radius: 18px;
      border: 1px solid #d7e3ef;
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.1);
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
