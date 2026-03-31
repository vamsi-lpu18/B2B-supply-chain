import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of, switchMap, map, catchError } from 'rxjs';
import { AuthApiService, UsersApiService } from '../api/auth-api.service';
import { AuthStore } from '../stores/auth.store';

export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);
  const authApi   = inject(AuthApiService);
  const usersApi  = inject(UsersApiService);

  if (authStore.isAuthenticated()) {
    return true;
  }

  return authApi.refresh().pipe(
    switchMap(res =>
      usersApi.getProfile().pipe(
        map(profile => {
          authStore.setAuth(profile, res.accessToken);
          return true;
        }),
        catchError(() => {
          authStore.setAuth(
            {
              userId: res.userId,
              email: res.email,
              role: res.role,
              status: 'Active',
              creditLimit: 0,
              fullName: res.email
            },
            res.accessToken
          );
          return of(true);
        })
      )
    ),
    catchError(() => {
      authStore.clear();
      return of(router.createUrlTree(['/login']));
    })
  );
};
