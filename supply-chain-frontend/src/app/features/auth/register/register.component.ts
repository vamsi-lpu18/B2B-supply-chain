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
  template: `
    <div class="auth-page">
      <div class="auth-card card">
        <h1 class="auth-title">Create Dealer Account</h1>
        <p class="auth-subtitle">Register your business to start ordering</p>

        @if (success()) {
          <div class="alert alert-success">
            Registration submitted! Your account is pending approval. <a routerLink="/login">Sign in</a>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <div class="grid-2">
              <div class="form-group">
                <label>Full Name *</label>
                <input type="text" class="form-control" formControlName="fullName" placeholder="John Doe">
                @if (err('fullName')) { <span class="form-error">Full name is required</span> }
              </div>
              <div class="form-group">
                <label>Email *</label>
                <input type="email" class="form-control" formControlName="email" placeholder="you@example.com">
                @if (err('email')) { <span class="form-error">Valid email is required</span> }
              </div>
              <div class="form-group">
                <label>Password *</label>
                <input type="password" class="form-control" formControlName="password">
                @if (form.get('password')?.errors?.['weakPassword'] && form.get('password')?.touched) {
                  <span class="form-error">Min 8 chars, uppercase, lowercase, number, special char</span>
                }
              </div>
              <div class="form-group">
                <label>Phone Number *</label>
                <input type="tel" class="form-control" formControlName="phoneNumber" placeholder="10 digits">
                @if (err('phoneNumber')) { <span class="form-error">Valid 10-digit Indian mobile number required (starts with 6-9)</span> }
              </div>
              <div class="form-group">
                <label>Business Name *</label>
                <input type="text" class="form-control" formControlName="businessName">
                @if (err('businessName')) { <span class="form-error">Business name is required</span> }
              </div>
              <div class="form-group">
                <label>GST Number *</label>
                <input type="text" class="form-control" formControlName="gstNumber" placeholder="15 chars alphanumeric" maxlength="15">
                @if (err('gstNumber')) { <span class="form-error">Valid GST required (example: 29ABCDE1234F1Z5)</span> }
              </div>
              <div class="form-group">
                <label>Trade License No *</label>
                <input type="text" class="form-control" formControlName="tradeLicenseNo">
                @if (err('tradeLicenseNo')) { <span class="form-error">Required</span> }
              </div>
              <div class="form-group">
                <label>PIN Code *</label>
                <input type="text" class="form-control" formControlName="pinCode" placeholder="6 digits" maxlength="6">
                @if (err('pinCode')) { <span class="form-error">6-digit PIN code required</span> }
              </div>
            </div>

            <div class="form-group">
              <label>Address *</label>
              <input type="text" class="form-control" formControlName="address">
              @if (err('address')) { <span class="form-error">Address is required</span> }
            </div>

            <div class="grid-3">
              <div class="form-group">
                <label>City *</label>
                <input type="text" class="form-control" formControlName="city">
                @if (err('city')) { <span class="form-error">Required</span> }
              </div>
              <div class="form-group">
                <label>State *</label>
                <input type="text" class="form-control" formControlName="state">
                @if (err('state')) { <span class="form-error">Required</span> }
              </div>
              <div class="form-group">
                <label>Interstate?</label>
                <select class="form-control" formControlName="isInterstate">
                  <option [value]="false">No (Intrastate)</option>
                  <option [value]="true">Yes (Interstate)</option>
                </select>
              </div>
            </div>

            @if (errorMsg()) {
              <div class="alert alert-error">{{ errorMsg() }}</div>
            }

            <button type="submit" class="btn btn-primary w-full btn-lg" [disabled]="form.invalid || loading()">
              @if (loading()) { <span class="spinner"></span> } Register
            </button>
          </form>
        }

        <div class="auth-links">
          Already have an account? <a routerLink="/login">Sign in</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { align-items: flex-start; }
    .auth-card { max-width: 760px; margin-top: 14px; }
    .w-full { width: 100%; justify-content: center; }
    .alert { margin-bottom: 16px; }
    .alert a { color: inherit; font-weight: 700; text-decoration: underline; }
    .auth-links { margin-top: 20px; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
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
