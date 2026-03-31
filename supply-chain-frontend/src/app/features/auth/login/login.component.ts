import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthApiService, UsersApiService } from '../../../core/api/auth-api.service';
import { AuthStore } from '../../../core/stores/auth.store';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  template: `
    <div class="login-page">
      <div class="login-left">
        <div class="login-brand">
          <div class="login-brand-icon">⛓</div>
          <div>
            <div class="login-brand-name">SupplyChain</div>
            <div class="login-brand-sub">Platform</div>
          </div>
        </div>
        <div class="login-hero">
          <h1>Manage your supply chain with confidence</h1>
          <p>Real-time tracking, smart inventory, and seamless order management — all in one place.</p>
          <div class="login-features">
            <div class="login-feature"><span>✓</span> Role-based access control</div>
            <div class="login-feature"><span>✓</span> Real-time shipment tracking</div>
            <div class="login-feature"><span>✓</span> Automated invoice generation</div>
            <div class="login-feature"><span>✓</span> Credit limit management</div>
          </div>
        </div>
      </div>

      <div class="login-right">
        <div class="login-card">
          <div class="login-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
            <div class="form-group">
              <label for="email">Email address</label>
              <input id="email" type="email" class="form-control"
                     formControlName="email" placeholder="you@company.com"
                     autocomplete="email">
              @if (form.get('email')?.invalid && form.get('email')?.touched) {
                <span class="form-error">Please enter a valid email</span>
              }
            </div>

            <div class="form-group">
              <div class="label-row">
                <label for="password">Password</label>
                <a routerLink="/forgot-password" class="forgot-link">Forgot password?</a>
              </div>
              <div class="input-wrap">
                <input id="password" [type]="showPwd() ? 'text' : 'password'"
                       class="form-control" formControlName="password"
                       placeholder="••••••••" autocomplete="current-password">
                <button type="button" class="pwd-toggle" (click)="showPwd.update(v => !v)">
                  {{ showPwd() ? '🙈' : '👁' }}
                </button>
              </div>
              @if (form.get('password')?.invalid && form.get('password')?.touched) {
                <span class="form-error">Password is required</span>
              }
            </div>

            @if (errorMsg()) {
              <div class="alert alert-error">
                <span>⚠</span> {{ errorMsg() }}
              </div>
            }

            <button type="submit" class="btn btn-primary btn-lg w-full submit-btn"
                    [disabled]="form.invalid || loading()">
              @if (loading()) {
                <span class="spinner"></span> Signing in...
              } @else {
                Sign in →
              }
            </button>
          </form>

          <div class="login-footer">
            New dealer? <a routerLink="/register">Create an account</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(460px, 1.05fr) minmax(380px, .95fr);
      gap: 28px;
      padding: 28px;
      background:
        radial-gradient(880px 540px at 98% -8%, rgba(37, 99, 235, 0.15), transparent 62%),
        radial-gradient(760px 480px at -10% 102%, rgba(14, 165, 233, 0.12), transparent 58%),
        linear-gradient(180deg, #f8fbff 0%, #f2f7fd 56%, #edf4fb 100%);
    }

    /* Left panel */
    .login-left {
      background: linear-gradient(160deg, rgba(255,255,255,.98) 0%, rgba(242,248,255,.94) 100%);
      border: 1px solid #d6e2ef;
      border-radius: 24px;
      box-shadow: 0 20px 42px rgba(15, 23, 42, 0.11);
      padding: 44px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(8px);

      &::before {
        content: '';
        position: absolute;
        top: -130px; right: -130px;
        width: 420px; height: 420px;
        background: radial-gradient(circle, rgba(37,99,235,.20) 0%, transparent 70%);
        pointer-events: none;
      }
      &::after {
        content: '';
        position: absolute;
        bottom: -100px; left: -120px;
        width: 340px; height: 340px;
        background: radial-gradient(circle, rgba(14,165,233,.18) 0%, transparent 72%);
        pointer-events: none;
      }
    }

    .login-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
      z-index: 1;
    }
    .login-brand-icon {
      width: 46px; height: 46px;
      background: linear-gradient(135deg, #1d4ed8, #0ea5e9);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
      color: #fff;
      box-shadow: 0 10px 24px rgba(37,99,235,.30);
    }
    .login-brand-name {
      font-size: 1.2rem;
      font-weight: 800;
      line-height: 1.2;
      color: #0f172a;
      font-family: var(--font-display);
      letter-spacing: -.018em;
    }
    .login-brand-sub  { font-size: .69rem; color: #475569; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; }

    .login-hero {
      position: relative;
      z-index: 1;
      h1 {
        font-size: clamp(1.9rem, 2.2vw, 2.4rem);
        font-weight: 700;
        color: #0f172a;
        line-height: 1.14;
        letter-spacing: -.03em;
        margin-bottom: 16px;
        font-family: var(--font-display);
        text-wrap: balance;
      }
      p {
        font-size: 1rem;
        color: #475569;
        line-height: 1.6;
        margin-bottom: 28px;
        max-width: 430px;
        font-weight: 600;
      }
    }

    .login-features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      max-width: 460px;
    }
    .login-feature {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: .84rem;
      color: #334155;
      background: rgba(255,255,255,.7);
      border: 1px solid #d9e5f2;
      border-radius: 10px;
      padding: 9px 10px;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
      span {
        width: 20px; height: 20px;
        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: .75rem;
        color: #1d4ed8;
        flex-shrink: 0;
      }
    }

    /* Right panel */
    .login-right {
      min-width: 380px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
    }

    .login-card {
      width: 100%;
      max-width: 430px;
      background: linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(247,251,255,.95) 100%);
      border: 1px solid #d6e3f0;
      border-radius: 22px;
      box-shadow: 0 22px 44px rgba(15, 23, 42, 0.12);
      padding: 34px;
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(115deg, transparent 32%, rgba(37, 99, 235, .10) 50%, transparent 68%);
        transform: translateX(-120%);
        animation: cardSweep 10s linear infinite;
        pointer-events: none;
      }

      > * {
        position: relative;
        z-index: 1;
      }
    }

    .login-card-header {
      margin-bottom: 28px;
      h2 {
        font-size: 1.85rem;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -.03em;
        font-family: var(--font-display);
      }
      p  { font-size: .95rem; color: #475569; margin-top: 8px; font-weight: 600; }
    }

    .login-form { display: flex; flex-direction: column; }

    .label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 5px;
      label { margin-bottom: 0; }
    }
    .forgot-link {
      font-size: .8125rem;
      color: #2563eb;
      font-weight: 700;
      text-decoration: none;
      position: relative;

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -2px;
        height: 1px;
        background: currentColor;
        transform: scaleX(0);
        transform-origin: left;
        transition: transform 120ms ease;
      }

      &:hover { color: #1e40af; }
      &:hover::after { transform: scaleX(1); }
    }

    .input-wrap { position: relative; }
    .input-wrap .form-control { padding-right: 44px; }
    .pwd-toggle {
      position: absolute;
      right: 12px; top: 50%;
      transform: translateY(-50%);
      background: none; border: none;
      cursor: pointer; font-size: 16px;
      color: #94a3b8; padding: 0;
      line-height: 1;
      transition: color 120ms ease;
      &:hover { color: #334155; }
    }

    .submit-btn {
      margin-top: 8px;
      height: 48px;
      font-size: .9375rem;
      letter-spacing: .01em;
    }

    .login-footer {
      text-align: center;
      margin-top: 24px;
      font-size: .86rem;
      color: #475569;
      a { color: #1d4ed8; font-weight: 700; }
    }

    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .6s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @keyframes cardSweep {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(120%); }
    }

    @media (max-width: 1080px) {
      .login-page {
        grid-template-columns: 1fr;
        padding: 16px;
      }
      .login-left { display: none; }
      .login-right { width: 100%; min-width: 0; padding: 8px 0; }
      .login-card { max-width: 520px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .login-card::before { animation: none !important; }
    }
  `]
})
export class LoginComponent {
  private readonly fb       = inject(FormBuilder);
  private readonly authApi  = inject(AuthApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly authStore = inject(AuthStore);
  private readonly router   = inject(Router);

  readonly loading  = signal(false);
  readonly errorMsg = signal('');
  readonly showPwd  = signal(false);

  readonly form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorMsg.set('');

    const { email, password } = this.form.value;
    this.authApi.login({ email: email!, password: password! }).subscribe({
      next: res => {
        this.usersApi.getProfile().subscribe({
          next: profile => {
            this.authStore.setAuth(profile, res.accessToken);
            this.loading.set(false);
            this.router.navigate(['/dashboard']);
          },
          error: () => {
            this.authStore.setAuth({
              userId: res.userId, email: res.email, role: res.role,
              status: 'Active', creditLimit: 0, fullName: res.email
            }, res.accessToken);
            this.loading.set(false);
            this.router.navigate(['/dashboard']);
          }
        });
      },
      error: err => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message || 'Invalid email or password.');
      }
    });
  }
}
