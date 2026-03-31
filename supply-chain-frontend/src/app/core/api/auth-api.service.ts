import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  LoginRequest, AuthResponse, RegisterDealerRequest, RegisterDealerResponse,
  ForgotPasswordRequest, ResetPasswordRequest, LogoutRequest, UserProfileDto
} from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/identity/api/auth';

  login(req: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/login`, req, { withCredentials: true });
  }

  register(req: RegisterDealerRequest): Observable<RegisterDealerResponse> {
    return this.http.post<RegisterDealerResponse>(`${this.base}/register`, req);
  }

  refresh(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/refresh`, {}, { withCredentials: true });
  }

  forgotPassword(req: ForgotPasswordRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/forgot-password`, req);
  }

  resetPassword(req: ResetPasswordRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/reset-password`, req);
  }

  logout(req?: LogoutRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/logout`, req ?? {}, { withCredentials: true });
  }
}

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  getProfile(): Observable<UserProfileDto> {
    return this.http.get<UserProfileDto>('/identity/api/users/profile');
  }
}
