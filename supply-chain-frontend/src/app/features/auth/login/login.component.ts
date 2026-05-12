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
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
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
