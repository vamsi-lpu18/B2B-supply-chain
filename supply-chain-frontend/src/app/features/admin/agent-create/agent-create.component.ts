import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/api/admin-api.service';

@Component({
  selector: 'app-agent-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-content">
      <div class="page-header">
        <div class="page-title">
          <h1>Create Agent</h1>
          <p>Create an Agent user with a temporary password and mandatory first-login reset.</p>
        </div>
        <div class="page-actions">
          <a routerLink="/admin/dealers" class="btn btn-ghost">Back to Dealers</a>
        </div>
      </div>

      <div class="card" style="max-width:760px;padding:20px;">
        <div class="d-flex gap-3" style="flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <label class="text-sm" style="display:block;margin-bottom:6px;">Full name</label>
            <input class="form-control" placeholder="Full name" [(ngModel)]="fullName">
          </div>

          <div style="flex:1;min-width:240px;">
            <label class="text-sm" style="display:block;margin-bottom:6px;">Email</label>
            <input class="form-control" placeholder="Email" [(ngModel)]="email">
          </div>
        </div>

        <div class="d-flex gap-3 mt-4" style="flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <label class="text-sm" style="display:block;margin-bottom:6px;">Phone</label>
            <input class="form-control" placeholder="10-digit phone" [(ngModel)]="phoneNumber">
          </div>

          <div style="flex:1;min-width:240px;">
            <label class="text-sm" style="display:block;margin-bottom:6px;">Temporary password</label>
            <input class="form-control" placeholder="Temporary password" [(ngModel)]="temporaryPassword" type="password">
          </div>
        </div>

        <p class="text-sm text-secondary mt-4" style="margin-bottom:0;">
          The new Agent can log in with this password once and will be forced to reset it.
        </p>

        <div class="d-flex gap-3 mt-5" style="align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary" (click)="createAgent()" [disabled]="creating()">
            @if (creating()) { Creating... } @else { Create Agent }
          </button>
          <a routerLink="/admin/dealers" class="btn btn-ghost">Cancel</a>
        </div>

        @if (createSuccess()) {
          <div class="alert alert-success mt-4">{{ createSuccess() }}</div>
        }

        @if (createError()) {
          <div class="alert alert-error mt-4">{{ createError() }}</div>
        }
      </div>
    </div>
  `
})
export class AgentCreateComponent {
  private readonly adminApi = inject(AdminApiService);

  readonly creating = signal(false);
  readonly createError = signal('');
  readonly createSuccess = signal('');

  fullName = '';
  email = '';
  phoneNumber = '';
  temporaryPassword = '';

  createAgent(): void {
    this.createError.set('');
    this.createSuccess.set('');

    const fullName = this.fullName.trim();
    const email = this.email.trim();
    const normalizedPhoneNumber = this.normalizeIndianMobile(this.phoneNumber);
    const temporaryPassword = this.temporaryPassword;

    if (!fullName || !email || !this.phoneNumber.trim() || !temporaryPassword) {
      this.createError.set('All fields are required.');
      return;
    }

    if (!normalizedPhoneNumber) {
      this.createError.set('Phone number must be a valid Indian mobile number (example: 9182683257).');
      return;
    }

    this.creating.set(true);
    this.adminApi.createAgent({
      fullName,
      email,
      phoneNumber: normalizedPhoneNumber,
      temporaryPassword
    }).subscribe({
      next: result => {
        this.creating.set(false);
        this.createSuccess.set(`Agent created: ${result.email}`);
        this.fullName = '';
        this.email = '';
        this.phoneNumber = '';
        this.temporaryPassword = '';
      },
      error: err => {
        this.creating.set(false);
        this.createError.set(this.getApiErrorMessage(err, 'Failed to create agent.'));
      }
    });
  }

  private normalizeIndianMobile(value: string): string | null {
    const digits = value.replace(/\D/g, '');

    if (/^[6-9]\d{9}$/.test(digits)) {
      return digits;
    }

    if (digits.length === 11 && digits.startsWith('0') && /^[6-9]\d{9}$/.test(digits.slice(1))) {
      return digits.slice(1);
    }

    if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
      return digits.slice(2);
    }

    return null;
  }

  private getApiErrorMessage(error: any, fallback: string): string {
    const validationErrors = error?.error?.errors;
    if (Array.isArray(validationErrors) && validationErrors.length > 0) {
      const first = validationErrors.find(e => typeof e?.errorMessage === 'string' && e.errorMessage.length > 0);
      if (first?.errorMessage) {
        return first.errorMessage;
      }
    }

    return error?.error?.message || fallback;
  }
}
