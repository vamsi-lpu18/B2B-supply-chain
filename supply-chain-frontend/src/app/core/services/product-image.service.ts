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
  height = 768,
  category?: string
): string {
  const safeName = normalizePrompt(productName || 'Product');
  const safeSku = normalizePrompt(sku || '');
  const resolvedCategory = normalizePrompt(category || inferCategoryFromContext(safeName, safeSku) || 'Industrial Catalog');
  const visual = resolveCategoryVisual(resolvedCategory);
  const displaySku = safeSku || 'ENTERPRISE CATALOG';
  const shortName = safeName.length > 44 ? `${safeName.slice(0, 41)}...` : safeName;
  const shortCategory = resolvedCategory.length > 30 ? `${resolvedCategory.slice(0, 27)}...` : resolvedCategory;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${visual.bgStart}"/>
      <stop offset="100%" stop-color="${visual.bgEnd}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.16)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.08)"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.88)}" height="${Math.round(height * 0.84)}" rx="24" fill="url(#panel)" stroke="rgba(255,255,255,0.28)"/>
  <rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.02)}" height="${Math.round(height * 0.84)}" rx="16" fill="${visual.accent}" opacity="0.85"/>
  <text x="50%" y="36%" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.12)}" font-weight="800">${visual.code}</text>
  <text x="50%" y="48%" text-anchor="middle" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.025)}" font-weight="700" letter-spacing="1">${escapeXml(shortCategory.toUpperCase())}</text>
  <text x="50%" y="62%" text-anchor="middle" fill="#eef6ff" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.034)}" font-weight="700">${escapeXml(shortName)}</text>
  <text x="50%" y="72%" text-anchor="middle" fill="#cfe2ff" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.024)}" letter-spacing="1">${escapeXml(displaySku)}</text>
  <text x="50%" y="82%" text-anchor="middle" fill="#bfdbfe" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.02)}">Enterprise catalog visual</text>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

interface CategoryVisual {
  bgStart: string;
  bgEnd: string;
  accent: string;
  code: string;
}

function resolveCategoryVisual(category: string): CategoryVisual {
  const normalized = category.toLowerCase();

  if (normalized.includes('electrical')) return { bgStart: '#0f2f6f', bgEnd: '#1d4ed8', accent: '#60a5fa', code: 'EL' };
  if (normalized.includes('safety')) return { bgStart: '#7c2d12', bgEnd: '#dc2626', accent: '#fca5a5', code: 'SF' };
  if (normalized.includes('network')) return { bgStart: '#0f766e', bgEnd: '#0ea5a5', accent: '#5eead4', code: 'NW' };
  if (normalized.includes('automation')) return { bgStart: '#4c1d95', bgEnd: '#7c3aed', accent: '#c4b5fd', code: 'AU' };
  if (normalized.includes('sensor')) return { bgStart: '#155e75', bgEnd: '#0891b2', accent: '#67e8f9', code: 'SN' };
  if (normalized.includes('display')) return { bgStart: '#1e3a8a', bgEnd: '#2563eb', accent: '#93c5fd', code: 'DP' };
  if (normalized.includes('mobile')) return { bgStart: '#115e59', bgEnd: '#0d9488', accent: '#99f6e4', code: 'MB' };
  if (normalized.includes('computer') || normalized.includes('processor') || normalized.includes('memory') || normalized.includes('storage') || normalized.includes('motherboard') || normalized.includes('graphics') || normalized.includes('peripheral')) {
    return { bgStart: '#0f172a', bgEnd: '#334155', accent: '#94a3b8', code: 'CP' };
  }
  if (normalized.includes('spare') || normalized.includes('maintenance')) return { bgStart: '#78350f', bgEnd: '#b45309', accent: '#fcd34d', code: 'SP' };
  if (normalized.includes('packaging')) return { bgStart: '#7c2d12', bgEnd: '#c2410c', accent: '#fdba74', code: 'PK' };
  if (normalized.includes('office')) return { bgStart: '#334155', bgEnd: '#475569', accent: '#cbd5e1', code: 'OF' };
  if (normalized.includes('logistics')) return { bgStart: '#14532d', bgEnd: '#15803d', accent: '#86efac', code: 'LG' };
  if (normalized.includes('tool')) return { bgStart: '#1f2937', bgEnd: '#374151', accent: '#d1d5db', code: 'TL' };

  return { bgStart: '#1e3a8a', bgEnd: '#1d4ed8', accent: '#93c5fd', code: 'PR' };
}

function inferCategoryFromContext(productName: string, sku: string): string {
  const context = `${productName} ${sku}`.toLowerCase();
  if (context.includes('cable') || context.includes('meter') || context.includes('electrical') || context.includes('fuse')) return 'Electrical';
  if (context.includes('glove') || context.includes('safety')) return 'Safety';
  if (context.includes('scanner') || context.includes('shipment') || context.includes('logistics')) return 'Logistics Equipment';
  if (context.includes('display') || context.includes('hmi') || context.includes('console')) return 'Displays';
  if (context.includes('processor') || context.includes('cpu') || context.includes('gpu') || context.includes('memory') || context.includes('ssd') || context.includes('motherboard') || context.includes('keyboard')) return 'Computer Parts';
  if (context.includes('plc') || context.includes('automation') || context.includes('robot')) return 'Automation';
  if (context.includes('sensor')) return 'Sensors';
  if (context.includes('pack')) return 'Packaging';
  return 'Industrial Catalog';
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
