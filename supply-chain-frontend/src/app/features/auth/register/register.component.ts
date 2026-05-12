import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { ToastService } from '../../../core/services/toast.service';

function passwordStrength(ctrl: AbstractControl) {
  const v: string = ctrl.value ?? '';
  if (!v) return null;
  const ok = v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v);
  return ok ? null : { weakPassword: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private readonly fb      = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly toast   = inject(ToastService);
  private readonly router  = inject(Router);

  readonly loading  = signal(false);
  readonly errorMsg = signal('');
  readonly success  = signal(false);

  readonly form = this.fb.group({
    email:          ['', [Validators.required, Validators.email]],
    password:       ['', [Validators.required, passwordStrength]],
    fullName:       ['', Validators.required],
    phoneNumber:    ['', [Validators.required, Validators.pattern(/^[6-9][0-9]{9}$/)]],
    businessName:   ['', Validators.required],
    gstNumber:      ['', [Validators.required, Validators.pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i)]],
    tradeLicenseNo: ['', Validators.required],
    address:        ['', Validators.required],
    city:           ['', Validators.required],
    state:          ['', Validators.required],
    pinCode:        ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    isInterstate:   [false]
  });

  err(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c.touched);
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorMsg.set('');

    const v = this.form.value;
    this.authApi.register({
      email: v.email!, password: v.password!, fullName: v.fullName!,
      phoneNumber: v.phoneNumber!, businessName: v.businessName!,
      gstNumber: v.gstNumber!.toUpperCase(), tradeLicenseNo: v.tradeLicenseNo!,
      address: v.address!, city: v.city!, state: v.state!,
      pinCode: v.pinCode!, isInterstate: !!v.isInterstate
    }).subscribe({
      next: () => { this.loading.set(false); this.success.set(true); },
      error: err => {
        this.loading.set(false);
        const msg = err?.error?.message ?? '';
        const validationErrors = err?.error?.errors;
        const firstValidation = Array.isArray(validationErrors) && validationErrors.length > 0
          ? (validationErrors[0]?.errorMessage || validationErrors[0]?.ErrorMessage || '')
          : '';

        if (typeof msg === 'string' && msg.toLowerCase().includes('email')) {
          this.errorMsg.set('Email already registered.');
          return;
        }

        if (typeof msg === 'string' && msg.toLowerCase().includes('gst')) {
          this.errorMsg.set('GST number is already registered.');
          return;
        }

        this.errorMsg.set(firstValidation || msg || 'Registration failed.');
      }
    });
  }
}
