import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card card">
        <h1 class="auth-title">Reset Password</h1>

        @if (step() === 'email') {
          <p class="auth-subtitle">Enter your email to receive an OTP</p>
          <form [formGroup]="emailForm" (ngSubmit)="sendOtp()">
            <div class="form-group">
              <label>Email</label>
              <input type="email" class="form-control" formControlName="email" placeholder="you@example.com">
              @if (emailForm.get('email')?.invalid && emailForm.get('email')?.touched) {
                <span class="form-error">Valid email is required</span>
              }
            </div>
            <button type="submit" class="btn btn-primary w-full" [disabled]="emailForm.invalid || loading()">
              @if (loading()) { <span class="spinner"></span> } Send OTP
            </button>
          </form>
        }

        @if (step() === 'reset') {
          <p class="auth-subtitle">Enter the OTP sent to your email</p>
          <form [formGroup]="resetForm" (ngSubmit)="resetPassword()">
            <div class="form-group">
              <label>OTP Code</label>
              <input type="text" class="form-control" formControlName="otpCode"
                     placeholder="6-digit code" maxlength="6">
              @if (resetForm.get('otpCode')?.invalid && resetForm.get('otpCode')?.touched) {
                <span class="form-error">6-digit OTP is required</span>
              }
            </div>
            <div class="form-group">
              <label>New Password</label>
              <input type="password" class="form-control" formControlName="newPassword">
              @if (resetForm.get('newPassword')?.invalid && resetForm.get('newPassword')?.touched) {
                <span class="form-error">Min 8 chars with uppercase, lowercase, number, special char</span>
              }
            </div>
            @if (errorMsg()) { <div class="alert alert-error">{{ errorMsg() }}</div> }
            <button type="submit" class="btn btn-primary w-full" [disabled]="resetForm.invalid || loading()">
              @if (loading()) { <span class="spinner"></span> } Reset Password
            </button>
          </form>
        }

        <div class="auth-links"><a routerLink="/login">Back to Sign In</a></div>
      </div>
    </div>
  `,
  styles: [`
    .auth-card { max-width: 430px; }
    .w-full { width: 100%; justify-content: center; }
    .alert { margin-bottom: 16px; }
    .auth-links { margin-top: 20px; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ForgotPasswordComponent {
  private readonly fb      = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly toast   = inject(ToastService);
  private readonly router  = inject(Router);

  readonly step     = signal<'email' | 'reset'>('email');
  readonly loading  = signal(false);
  readonly errorMsg = signal('');

  readonly emailForm = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  readonly resetForm = this.fb.group({
    otpCode:     ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  sendOtp(): void {
    if (this.emailForm.invalid) return;
    this.loading.set(true);
    this.authApi.forgotPassword({ email: this.emailForm.value.email! }).subscribe({
      next: () => { this.loading.set(false); this.step.set('reset'); },
      error: () => { this.loading.set(false); this.step.set('reset'); } // Always show OTP step
    });
  }

  resetPassword(): void {
    if (this.resetForm.invalid) { this.resetForm.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorMsg.set('');
    const v = this.resetForm.value;
    this.authApi.resetPassword({
      email: this.emailForm.value.email!,
      otpCode: v.otpCode!,
      newPassword: v.newPassword!
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.toast.success('Password reset successful. Please sign in.');
        this.router.navigate(['/login']);
      },
      error: err => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message || 'Invalid OTP. Please try again.');
        this.resetForm.get('otpCode')?.reset();
      }
    });
  }
}
