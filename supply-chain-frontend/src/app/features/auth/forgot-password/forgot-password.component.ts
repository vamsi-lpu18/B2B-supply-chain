import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  private readonly fb      = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly toast   = inject(ToastService);
  private readonly route   = inject(ActivatedRoute);
  private readonly router  = inject(Router);

  readonly step     = signal<'email' | 'reset'>('email');
  readonly loading  = signal(false);
  readonly errorMsg = signal('');
  readonly forcedFlow = signal(false);

  readonly emailForm = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  readonly resetForm = this.fb.group({
    otpCode:     ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  constructor() {
    const email = this.route.snapshot.queryParamMap.get('email');
    const enforced = this.route.snapshot.queryParamMap.get('enforced') === '1';

    if (email) {
      this.emailForm.patchValue({ email });
    }

    if (enforced) {
      this.forcedFlow.set(true);
      if (email) {
        queueMicrotask(() => this.sendOtp());
      }
    }
  }

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
