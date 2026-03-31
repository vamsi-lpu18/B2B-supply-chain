import { Injectable, signal, computed } from '@angular/core';
import { UserRole } from '../models/enums';
import { AuthState, UserProfileDto } from '../models/auth.models';

interface PersistedAuthState {
  user: UserProfileDto;
  accessToken: string;
  role: UserRole;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private static readonly storageKey = 'scp.auth.v1';

  private readonly _state = signal<AuthState>({
    user: null,
    accessToken: null,
    role: null,
    isAuthenticated: false
  });

  constructor() {
    this.hydrateFromStorage();
  }

  // Public readonly signals
  readonly user = computed(() => this._state().user);
  readonly accessToken = computed(() => this._state().accessToken);
  readonly role = computed(() => this._state().role);
  readonly isAuthenticated = computed(() => this._state().isAuthenticated);

  setAuth(user: UserProfileDto, token: string): void {
    const role = this.resolveRole(user.role);
    if (!role) {
      this.clear();
      return;
    }

    this._state.set({
      user: { ...user, role },
      accessToken: token,
      role,
      isAuthenticated: true
    });

    this.persistToStorage();
  }

  updateToken(token: string): void {
    this._state.update(s => ({ ...s, accessToken: token }));
    this.persistToStorage();
  }

  updateUser(user: UserProfileDto): void {
    const role = this.resolveRole(user.role);
    this._state.update(s => ({
      ...s,
      user,
      role: role ?? s.role
    }));
    this.persistToStorage();
  }

  clear(): void {
    this._state.set({ user: null, accessToken: null, role: null, isAuthenticated: false });
    this.clearStorage();
  }

  hasRole(...roles: UserRole[]): boolean {
    const r = this._state().role;
    return r !== null && roles.includes(r);
  }

  private hydrateFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(AuthStore.storageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<PersistedAuthState>;
      if (!parsed.user || !parsed.accessToken) {
        this.clearStorage();
        return;
      }

      const role = this.resolveRole(parsed.role ?? parsed.user.role);
      if (!role) {
        this.clearStorage();
        return;
      }

      this._state.set({
        user: { ...parsed.user, role },
        accessToken: parsed.accessToken,
        role,
        isAuthenticated: true
      });
    } catch {
      this.clearStorage();
    }
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const current = this._state();
    if (!current.isAuthenticated || !current.user || !current.accessToken || !current.role) {
      this.clearStorage();
      return;
    }

    const data: PersistedAuthState = {
      user: current.user,
      accessToken: current.accessToken,
      role: current.role
    };

    window.localStorage.setItem(AuthStore.storageKey, JSON.stringify(data));
  }

  private clearStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(AuthStore.storageKey);
  }

  private resolveRole(role: string | null | undefined): UserRole | null {
    if (!role) {
      return null;
    }

    return Object.values(UserRole).includes(role as UserRole)
      ? (role as UserRole)
      : null;
  }
}
