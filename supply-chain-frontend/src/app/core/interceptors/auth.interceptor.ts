import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthStore } from '../stores/auth.store';

const PUBLIC_URLS = [
  '/identity/api/auth/login',
  '/identity/api/auth/register',
  '/identity/api/auth/refresh',
  '/identity/api/auth/forgot-password',
  '/identity/api/auth/reset-password',
  '/payments/api/payment/dealers/',  // credit-check is AllowAnonymous
  '/notifications/api/notifications/ingest'
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const token = authStore.accessToken();

  const isPublic = PUBLIC_URLS.some(u => req.url.includes(u));
  if (token && !isPublic) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
