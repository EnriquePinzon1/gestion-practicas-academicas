import { Component, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';

import { supabase } from './core/supabase.client';
import { ApiService } from './core/services/api.service';

interface AuthProfile {
  authenticated: boolean;
  auth_user_id: string;
  id_usuario: number;
  nombres: string;
  apellidos: string;
  correo: string;
  estado: string;
  rol: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  isLoginPage = signal(false);

  userRole = signal<string | null>(null);
  userName = signal('');
  userInitial = signal('');

  private loadingProfile = false;

  constructor(
    private readonly router: Router,
    private readonly api: ApiService
  ) {
    this.updateLayout(this.router.url);

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd =>
            event instanceof NavigationEnd
        )
      )
      .subscribe((event) => {
        this.updateLayout(
          event.urlAfterRedirects
        );
      });
  }

  private updateLayout(url: string) {
    const loginPage =
  url.startsWith('/login') ||
  url.startsWith('/reset-password');

    this.isLoginPage.set(loginPage);

    if (
      !loginPage &&
      url !== '/' &&
      !this.userRole() &&
      !this.loadingProfile
    ) {
      void this.loadProfile();
    }
  }

  private async loadProfile() {
    this.loadingProfile = true;

    try {
      const profile =
        await this.api.get<AuthProfile>(
          '/auth/me'
        );

      this.userRole.set(profile.rol);

      this.userName.set(
        `${profile.nombres} ${profile.apellidos}`
      );

      this.userInitial.set(
        profile.nombres
          .charAt(0)
          .toUpperCase()
      );
    } catch (error) {
      console.error(
        'No fue posible cargar el perfil:',
        error
      );

      this.userRole.set(null);
      this.userName.set('');
      this.userInitial.set('');
    } finally {
      this.loadingProfile = false;
    }
  }

  async logout() {
    await supabase.auth.signOut();

    this.userRole.set(null);
    this.userName.set('');
    this.userInitial.set('');

    await this.router.navigate([
      '/login',
    ]);
  }
}
