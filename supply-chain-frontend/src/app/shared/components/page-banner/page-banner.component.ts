import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-banner',
  standalone: true,
  template: `
    <section class="page-banner" [attr.data-banner]="banner()" role="img" [attr.aria-label]="alt()">
      <div class="page-banner-overlay"></div>
      <div class="page-banner-content">
        <p class="page-banner-kicker">Supply Chain Platform</p>
        <h2 class="page-banner-title">{{ formatBannerTitle() }}</h2>
      </div>
    </section>
  `,
  styles: [`
    .page-banner {
      position: relative;
      min-height: 152px;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 16px;
      background:
        radial-gradient(120% 120% at 100% 0%, rgba(14, 165, 233, 0.28) 0%, rgba(14, 165, 233, 0) 55%),
        radial-gradient(90% 120% at 0% 100%, rgba(37, 99, 235, 0.28) 0%, rgba(37, 99, 235, 0) 55%),
        linear-gradient(130deg, #0f172a 0%, #1d4ed8 55%, #0ea5e9 100%);
      border: 1px solid rgba(148, 163, 184, 0.35);
      box-shadow: 0 18px 32px rgba(15, 23, 42, 0.22);
    }

    .page-banner-overlay {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        -45deg,
        rgba(255, 255, 255, 0.08) 0,
        rgba(255, 255, 255, 0.08) 8px,
        rgba(255, 255, 255, 0.02) 8px,
        rgba(255, 255, 255, 0.02) 16px
      );
      pointer-events: none;
    }

    .page-banner-content {
      position: relative;
      z-index: 1;
      padding: 24px;
      color: #f8fafc;
    }

    .page-banner-kicker {
      margin: 0;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.9;
    }

    .page-banner-title {
      margin: 8px 0 0;
      font-size: clamp(1.35rem, 1.2rem + 0.8vw, 1.9rem);
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    @media (max-width: 640px) {
      .page-banner {
        min-height: 126px;
        border-radius: 12px;
      }

      .page-banner-content {
        padding: 18px;
      }
    }
  `]
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
