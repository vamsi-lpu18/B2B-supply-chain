import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-banner',
  standalone: true,
  templateUrl: './page-banner.component.html',
  styleUrl: './page-banner.component.scss'
})
export class PageBannerComponent {
  readonly banner = input('overview');
  readonly alt = input('Page banner');

  formatBannerTitle(): string {
    const raw = (this.banner() || '').replace(/[-_]/g, ' ').trim();
    if (!raw) {
      return 'Overview';
    }

    return raw
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
