import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from '../supabase.client';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return router.createUrlTree(['/login']);
  }

  return true;
};
