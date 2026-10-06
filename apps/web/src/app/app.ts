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

  constructor(private readonly router: Router) {
    this.updateLayout(this.router.url);

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd =>
            event instanceof NavigationEnd
        )
      )
      .subscribe((event) => {
        this.updateLayout(event.urlAfterRedirects);
      });
  }

  private updateLayout(url: string) {
    this.isLoginPage.set(
      url.startsWith('/login')
    );
  }

  async logout() {
    await supabase.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
