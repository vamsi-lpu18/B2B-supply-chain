export const enterpriseProductFallbackImageUrl = buildProductPlaceholderDataUrl(
  'Supply Chain Product',
  'SCP',
  1024,
  768
);

const skuToLocalAiAssetMap: Record<string, string> = {
  'CBL-001': '/assets/product-images/cbl-001-ai.jpg',
  'MTR-002': '/assets/product-images/mtr-002-ai.jpg',
  'GLV-003': '/assets/product-images/glv-003-ai.jpg'
};

export function resolveEnterpriseProductImageUrl(
  productName: string,
  sku?: string,
  width = 1024,
  height = 768
): string {
  const normalizedSku = normalizePrompt(sku || '').toUpperCase();
  if (normalizedSku && skuToLocalAiAssetMap[normalizedSku]) {
    return skuToLocalAiAssetMap[normalizedSku];
  }

  return buildEnterpriseProductImageUrl(productName, sku, width, height);
}

function normalizePrompt(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function buildEnterpriseProductImageUrl(
  productName: string,
  sku?: string,
  width = 1024,
  height = 768
): string {
  const safeName = normalizePrompt(productName || 'Industrial product');
  const safeSku = normalizePrompt(sku || '');

  const prompt = [
    safeName,
    safeSku ? `SKU ${safeSku}` : '',
    'enterprise product catalog image',
    'studio lighting',
    'high detail',
    'photorealistic'
  ]
    .filter(Boolean)
    .join(' ');

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`;
}

export function buildProductPlaceholderDataUrl(
  productName: string,
  sku?: string,
  width = 1024,
  height = 768
): string {
  const safeName = normalizePrompt(productName || 'Product');
  const safeSku = normalizePrompt(sku || '');
  const initials = safeName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'PR';

  const displaySku = safeSku || 'ENTERPRISE CATALOG';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.88)}" height="${Math.round(height * 0.84)}" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)"/>
  <text x="50%" y="43%" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.12)}" font-weight="700">${initials}</text>
  <text x="50%" y="60%" text-anchor="middle" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.035)}" font-weight="600">${escapeXml(safeName)}</text>
  <text x="50%" y="69%" text-anchor="middle" fill="#bfdbfe" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.025)}" letter-spacing="1">${escapeXml(displaySku)}</text>
  <text x="50%" y="82%" text-anchor="middle" fill="#93c5fd" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.022)}">Preview image unavailable</text>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
