import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
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
      <video
        #loginBgVideo
        class="login-page-video"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        (canplay)="ensureVideoPlaying()"
        aria-label="Warehouse logistics workflow video">
        <source src="/assets/login/supply-chain-real.mp4" type="video/mp4">
      </video>
      <div class="login-page-video-overlay"></div>

      <div class="login-left">
        <div class="login-brand">
          <div class="login-brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="24" height="24">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div>
            <div class="login-brand-name">SupplyChain</div>
            <div class="login-brand-sub">Platform</div>
          </div>
        </div>
        <div class="login-hero">
          <h1>Manage your supply chain with confidence</h1>
          <p>Real-time tracking, smart inventory, and seamless order management — all in one place.</p>

          <div class="login-features">
            <div class="login-feature stagger-1">
              <span class="feature-check">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              Role-based access control
            </div>
            <div class="login-feature stagger-2">
              <span class="feature-check">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              Real-time shipment tracking
            </div>
            <div class="login-feature stagger-3">
              <span class="feature-check">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              Automated invoice generation
            </div>
            <div class="login-feature stagger-4">
              <span class="feature-check">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              Credit limit management
            </div>
          </div>
        </div>
      </div>

      <div class="login-right">
        <div class="login-card">
          <div class="login-card-glow"></div>

          <div class="login-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
            <div class="form-group">
              <label for="email">Email address</label>
              <div class="input-icon-wrap">
                <span class="input-icon-el">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input id="email" type="email" class="form-control"
                       formControlName="email" placeholder="you&#64;company.com"
                       autocomplete="email">
              </div>
              @if (form.get('email')?.invalid && form.get('email')?.touched) {
                <span class="form-error">Please enter a valid email</span>
              }
            </div>

            <div class="form-group">
              <div class="label-row">
                <label for="password">Password</label>
                <a routerLink="/forgot-password" class="forgot-link">Forgot password?</a>
              </div>
              <div class="input-icon-wrap">
                <span class="input-icon-el">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input id="password" [type]="showPwd() ? 'text' : 'password'"
                       class="form-control" formControlName="password"
                       placeholder="••••••••" autocomplete="current-password">
                <button type="button" class="pwd-toggle" (click)="showPwd.update(v => !v)">
                  @if (showPwd()) {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  } @else {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              @if (form.get('password')?.invalid && form.get('password')?.touched) {
                <span class="form-error">Password is required</span>
              }
            </div>

            @if (errorMsg()) {
              <div class="alert alert-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                {{ errorMsg() }}
              </div>
            }

            <button type="submit" class="btn btn-primary btn-lg w-full submit-btn"
                    [disabled]="form.invalid || loading()">
              @if (loading()) {
                <span class="spinner"></span> Signing in...
              } @else {
                Sign in
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
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
      position: relative;
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(460px, 1.1fr) minmax(380px, .9fr);
      gap: 28px;
      padding: 28px;
      background: #0c1929;
    }

    .login-page-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
      filter: saturate(.85) contrast(.92) brightness(.85);
    }

    .login-page-video-overlay {
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      background:
        radial-gradient(ellipse at 20% 80%, rgba(43,77,115,.4) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(139,92,246,.15) 0%, transparent 50%),
        linear-gradient(165deg, rgba(8, 20, 38, .62) 0%, rgba(10, 25, 45, .52) 40%, rgba(8, 20, 38, .64) 100%);
    }

    /* Left panel */
    .login-left {
      padding: 44px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      z-index: 2;
    }

    .login-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .login-brand-icon {
      width: 46px; height: 46px;
      background: linear-gradient(135deg, var(--brand-600) 0%, var(--brand-400) 100%);
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(43,77,115,.45);
    }
    .login-brand-name {
      font-size: 1.2rem;
      font-weight: 700;
      line-height: 1.2;
      color: #f8fbff;
      font-family: var(--font-display);
      letter-spacing: -.02em;
      text-shadow: 0 2px 12px rgba(0,0,0,.3);
    }
    .login-brand-sub {
      font-size: .65rem;
      color: rgba(219,234,254,.8);
      text-transform: uppercase;
      letter-spacing: .12em;
      font-weight: 700;
    }

    .login-hero {
      position: relative;
      z-index: 2;

      h1 {
        font-size: clamp(1.9rem, 2.4vw, 2.5rem);
        font-weight: 700;
        color: #f8fbff;
        line-height: 1.12;
        letter-spacing: -.035em;
        margin-bottom: 16px;
        font-family: var(--font-display);
        text-wrap: balance;
        text-shadow: 0 4px 20px rgba(0,0,0,.4);
      }
      p {
        font-size: 1rem;
        color: rgba(226,235,248,.9);
        line-height: 1.6;
        margin-bottom: 32px;
        max-width: 440px;
        font-weight: 500;
        text-shadow: 0 2px 8px rgba(0,0,0,.3);
      }
    }

    .login-features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      max-width: 480px;
    }

    .login-feature {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: .84rem;
      font-weight: 600;
      color: rgba(231,240,251,.95);
      background: rgba(8, 28, 52, .5);
      border: 1px solid rgba(148, 180, 214, .25);
      border-radius: 12px;
      padding: 10px 12px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: all .25s var(--ease);

      &:hover {
        background: rgba(15, 40, 70, .6);
        border-color: rgba(148, 180, 214, .4);
        transform: translateY(-1px);
      }
    }

    .feature-check {
      width: 22px; height: 22px;
      background: linear-gradient(135deg, rgba(219,234,254,.9), rgba(147,197,253,.9));
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #1e3a8a;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(30,58,138,.2);
    }

    /* Right panel */
    .login-right {
      min-width: 380px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      position: relative;
      z-index: 2;
    }

    .login-card {
      width: 100%;
      max-width: 440px;
      background: rgba(255,255,255,.88);
      border: 1px solid rgba(203, 213, 225, .6);
      border-radius: 24px;
      box-shadow:
        0 24px 48px rgba(0, 0, 0, .2),
        0 0 0 1px rgba(255,255,255,.1),
        inset 0 1px 0 rgba(255,255,255,.6);
      padding: 36px;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(24px) saturate(1.4);
      -webkit-backdrop-filter: blur(24px) saturate(1.4);
      animation: cardReveal .6s var(--ease) both;

      > * { position: relative; z-index: 1; }
    }

    .login-card-glow {
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: conic-gradient(
        from 180deg,
        transparent 0deg,
        rgba(65,120,173,.08) 60deg,
        rgba(139,92,246,.06) 120deg,
        transparent 180deg,
        rgba(16,185,129,.05) 240deg,
        rgba(65,120,173,.08) 300deg,
        transparent 360deg
      );
      animation: glowSpin 12s linear infinite;
      pointer-events: none;
      z-index: 0;
    }

    .login-card-header {
      margin-bottom: 28px;
      text-align: center;

      h2 {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -.03em;
        font-family: var(--font-display);
        line-height: 1.15;
      }
      p {
        font-size: .9rem;
        color: var(--text-secondary);
        margin-top: 6px;
        font-weight: 500;
      }
    }

    .login-form { display: flex; flex-direction: column; }

    .login-form .form-group {
      margin-bottom: 18px;

      label {
        font-size: .8rem;
        font-weight: 600;
        color: var(--text-secondary);
        margin-bottom: 6px;
        display: block;
      }
    }

    .input-icon-wrap {
      position: relative;
    }
    .input-icon-el {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-tertiary);
      display: flex;
      pointer-events: none;
      transition: color .2s var(--ease);
      z-index: 2;
    }
    .input-icon-wrap .form-control {
      padding-left: 42px;
      padding-right: 14px;
      height: 46px;
      border-radius: 12px;
      background: rgba(248, 250, 252, .9);
      border: 1.5px solid var(--gray-300);
      font-size: .875rem;
      transition: all .2s var(--ease);
    }
    .input-icon-wrap .form-control:focus {
      background: #fff;
      border-color: var(--brand-400);
      box-shadow: 0 0 0 4px rgba(65,120,173,.12), 0 4px 12px rgba(0,0,0,.06);
    }
    .input-icon-wrap:focus-within .input-icon-el {
      color: var(--brand-600);
    }

    .label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      label { margin-bottom: 0; }
    }

    .forgot-link {
      font-size: .78rem;
      color: var(--brand-600);
      font-weight: 700;
      text-decoration: none;
      position: relative;
      transition: color .15s var(--ease);

      &::after {
        content: '';
        position: absolute;
        left: 0; right: 0; bottom: -2px;
        height: 1.5px;
        background: currentColor;
        transform: scaleX(0);
        transform-origin: left;
        transition: transform .2s var(--ease);
      }
      &:hover { color: var(--brand-700); }
      &:hover::after { transform: scaleX(1); }
    }

    .pwd-toggle {
      position: absolute;
      right: 12px; top: 50%;
      transform: translateY(-50%);
      background: none; border: none;
      cursor: pointer;
      color: var(--text-tertiary);
      padding: 4px;
      line-height: 1;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      transition: all .15s var(--ease);
      &:hover { color: var(--text-primary); background: var(--gray-100); }
    }

    .input-icon-wrap .pwd-toggle ~ .form-control,
    .input-icon-wrap:has(.pwd-toggle) .form-control {
      padding-right: 44px;
    }

    .submit-btn {
      margin-top: 8px;
      height: 48px;
      font-size: .9375rem;
      letter-spacing: .01em;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: linear-gradient(135deg, var(--brand-700) 0%, var(--brand-500) 100%);
      box-shadow: 0 4px 16px rgba(43,77,115,.35);
      transition: all .25s var(--ease);

      &:hover:not(:disabled) {
        box-shadow: 0 8px 24px rgba(43,77,115,.4);
        transform: translateY(-1px);
      }
      &:active:not(:disabled) {
        transform: scale(.98);
        box-shadow: 0 2px 8px rgba(43,77,115,.25);
      }
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: .84rem;
      font-weight: 600;
      margin-bottom: 8px;
      animation: slideUp .25s var(--ease);
    }
    .alert-error {
      background: var(--error-bg);
      color: var(--error-text);
      border: 1px solid #fecaca;
    }

    .login-footer {
      text-align: center;
      margin-top: 24px;
      font-size: .84rem;
      color: var(--text-secondary);
      font-weight: 500;
      a {
        color: var(--brand-600);
        font-weight: 700;
        text-decoration: none;
        transition: color .15s var(--ease);
        &:hover { color: var(--brand-700); }
      }
    }

    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .6s linear infinite;
      display: inline-block;
    }

    .form-error {
      font-size: .75rem;
      color: var(--error-text);
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font-weight: 500;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes cardReveal {
      from { opacity: 0; transform: translateY(16px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes glowSpin { to { transform: rotate(360deg); } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    .stagger-1 { animation: slideUp .4s var(--ease) .1s both; }
    .stagger-2 { animation: slideUp .4s var(--ease) .2s both; }
    .stagger-3 { animation: slideUp .4s var(--ease) .3s both; }
    .stagger-4 { animation: slideUp .4s var(--ease) .4s both; }

    @media (max-width: 1080px) {
      .login-page {
        grid-template-columns: 1fr;
        padding: 16px;
      }
      .login-left { display: none; }
      .login-right { width: 100%; min-width: 0; padding: 0; }
      .login-card { max-width: 480px; }
    }

    @media (max-width: 480px) {
      .login-card { padding: 24px; }
      .submit-btn { height: 44px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .login-card { animation: none !important; }
      .login-card-glow { animation: none !important; }
      .login-feature { animation: none !important; }
    }
  `]
})
export class LoginComponent implements AfterViewInit, OnDestroy {
  @ViewChild('loginBgVideo') private readonly loginBgVideo?: ElementRef<HTMLVideoElement>;

  private readonly fb       = inject(FormBuilder);
  private readonly authApi  = inject(AuthApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly authStore = inject(AuthStore);
  private readonly router   = inject(Router);

  private playRetryCount = 0;
  private readonly onVisibilityChange = () => {
    if (!document.hidden) {
      this.ensureVideoPlaying();
    }
  };

  readonly loading  = signal(false);
  readonly errorMsg = signal('');
  readonly showPwd  = signal(false);

  readonly form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  ngAfterViewInit(): void {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.ensureVideoPlaying();
    window.setTimeout(() => this.ensureVideoPlaying(), 180);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  ensureVideoPlaying(): void {
    const video = this.loginBgVideo?.nativeElement;
    if (!video) return;

    video.defaultMuted = true;
    video.muted = true;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    if (!video.paused && !video.ended) return;

    const playPromise = video.play();
    if (!playPromise) return;

    playPromise
      .then(() => {
        this.playRetryCount = 0;
      })
      .catch(() => {
        if (this.playRetryCount >= 4) return;
        this.playRetryCount += 1;
        window.setTimeout(() => this.ensureVideoPlaying(), 260);
      });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorMsg.set('');

    const { email, password } = this.form.value;
    this.authApi.login({ email: email!, password: password! }).subscribe({
      next: res => {
        if (res.mustChangePassword) {
          this.loading.set(false);
          this.router.navigate(['/forgot-password'], {
            queryParams: {
              email: res.email,
              enforced: '1'
            }
          });
          return;
        }

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
