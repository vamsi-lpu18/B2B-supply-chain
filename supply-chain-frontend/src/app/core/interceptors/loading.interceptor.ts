import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingStore } from '../stores/loading.store';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingStore);
  loading.increment();
  return next(req).pipe(finalize(() => loading.decrement()));
};
