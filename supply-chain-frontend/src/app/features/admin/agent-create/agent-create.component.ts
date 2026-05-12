import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/api/admin-api.service';

@Component({
  selector: 'app-agent-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './agent-create.component.html'
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
