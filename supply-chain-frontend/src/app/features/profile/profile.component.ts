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
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
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
