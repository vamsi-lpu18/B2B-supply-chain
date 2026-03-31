import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthStore } from '../stores/auth.store';
import { UserRole } from '../models/enums';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);

  if (!authStore.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const allowedRoles: UserRole[] = route.data['roles'] ?? [];
  if (authStore.hasRole(...allowedRoles)) return true;
  return router.createUrlTree(['/unauthorized']);
};
