import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UsersApiService } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/stores/auth.store';
import { UserProfileDto } from '../../core/models/auth.models';
import { UserRole } from '../../core/models/enums';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>My Profile</h1>
        <a routerLink="/dashboard" class="btn btn-secondary">← Dashboard</a>
      </div>

      @if (loading()) {
        <div class="card skeleton" style="height:200px"></div>
      } @else if (profile()) {
        <div class="card" style="max-width:600px">
          <div class="profile-header">
            <div class="profile-avatar">{{ initial() }}</div>
            <div>
              <h2>{{ profile()!.fullName }}</h2>
              <span class="badge" [class]="statusBadge()">{{ profile()!.status }}</span>
            </div>
          </div>

          <div class="profile-grid">
            <div class="profile-field">
              <span class="field-label">Email</span>
              <span>{{ profile()!.email }}</span>
            </div>
            <div class="profile-field">
              <span class="field-label">Role</span>
              <span>{{ profile()!.role }}</span>
            </div>
            <div class="profile-field">
              <span class="field-label">User ID</span>
              <span class="text-xs text-secondary">{{ profile()!.userId }}</span>
            </div>
            @if (isDealer()) {
              <div class="profile-field">
                <span class="field-label">Credit Limit</span>
                <span class="fw-600 text-primary">{{ profile()!.creditLimit | currency:'INR':'symbol':'1.2-2' }}</span>
              </div>
              <div class="profile-field">
                <span class="field-label">Business Name</span>
                <span>{{ profile()!.dealerBusinessName }}</span>
              </div>
              <div class="profile-field">
                <span class="field-label">GST Number</span>
                <span>{{ profile()!.dealerGstNumber }}</span>
              </div>
              <div class="profile-field">
                <span class="field-label">Interstate</span>
                <span>{{ profile()!.isInterstate ? 'Yes' : 'No' }}</span>
              </div>
            }
          </div>
        </div>
      } @else if (error()) {
        <div class="alert-error">{{ error() }}</div>
      }
    </div>
  `,
  styles: [`
    .profile-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .profile-avatar { width: 64px; height: 64px; background: #1976d2; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; flex-shrink: 0; }
    .profile-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .profile-field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { font-size: 12px; color: #616161; font-weight: 500; text-transform: uppercase; letter-spacing: .5px; }
    .alert-error { background: #ffebee; color: #c62828; border-radius: 4px; padding: 12px; }
    @media (max-width: 600px) { .profile-grid { grid-template-columns: 1fr; } }
  `]
})
export class ProfileComponent implements OnInit {
  private readonly usersApi  = inject(UsersApiService);
  private readonly authStore = inject(AuthStore);

  readonly loading = signal(true);
  readonly profile = signal<UserProfileDto | null>(null);
  readonly error   = signal('');

  readonly isDealer = () => this.authStore.role() === UserRole.Dealer;

  initial(): string {
    return (this.profile()?.fullName ?? '?').charAt(0).toUpperCase();
  }

  statusBadge(): string {
    const s = this.profile()?.status ?? '';
    if (s === 'Active') return 'badge badge-success';
    if (s === 'Pending') return 'badge badge-warning';
    if (s === 'Rejected') return 'badge badge-error';
    return 'badge badge-neutral';
  }

  ngOnInit(): void {
    this.usersApi.getProfile().subscribe({
      next: p => { this.profile.set(p); this.authStore.updateUser(p); this.loading.set(false); },
      error: () => { this.error.set('Failed to load profile.'); this.loading.set(false); }
    });
  }
}
