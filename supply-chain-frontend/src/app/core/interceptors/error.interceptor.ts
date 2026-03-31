import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { Router } from '@angular/router';
import { AuthStore } from '../stores/auth.store';
import { ToastService } from '../services/toast.service';
import { HttpClient } from '@angular/common/http';
import { AuthResponse } from '../models/auth.models';

let isRefreshing = false;
const refreshSubject = new BehaviorSubject<string | null>(null);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const toast     = inject(ToastService);
  const router    = inject(Router);
  const http      = inject(HttpClient);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/api/auth/')) {
        return handle401(req, next, http, authStore, router, toast);
      }
      handleError(err, toast, router);
      return throwError(() => err);
    })
  );
};

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  http: HttpClient,
  authStore: AuthStore,
  router: Router,
  toast: ToastService
) {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshSubject.next(null);

    return http.post<AuthResponse>('/identity/api/auth/refresh', {}, { withCredentials: true }).pipe(
      switchMap(res => {
        isRefreshing = false;
        authStore.updateToken(res.accessToken);
        refreshSubject.next(res.accessToken);
        const retried = req.clone({ setHeaders: { Authorization: `Bearer ${res.accessToken}` } });
        return next(retried);
      }),
      catchError(refreshErr => {
        isRefreshing = false;
        authStore.clear();
        router.navigate(['/login']);
        return throwError(() => refreshErr);
      })
    );
  }

  // Queue other requests until refresh completes
  return refreshSubject.pipe(
    filter(t => t !== null),
    take(1),
    switchMap(token => {
      const retried = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
      return next(retried);
    })
  );
}

function handleError(err: HttpErrorResponse, toast: ToastService, router: Router): void {
  switch (err.status) {
    case 403:
      toast.error('Access denied. You don\'t have permission.');
      break;
    case 404:
      // Let components handle 404 individually
      break;
    case 429:
      toast.warning('Too many requests. Please wait and try again.');
      break;
    case 502:
    case 503:
      toast.error('Service unavailable. Please try again later.');
      break;
    case 500:
      toast.error('Server error. Please try again later.');
      break;
    case 0:
      toast.error('Service is still starting up. Please wait a moment and try again.');
      break;
    default:
      if (err.status >= 400 && err.status < 500) {
        const msg = err.error?.message || err.error?.title || 'Request failed.';
        toast.error(msg);
      }
  }
}
