import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'assets', 'product-images');

const products = [
  {
    sku: 'CBL-001',
    fileName: 'cbl-001-ai.jpg',
    prompts: [
      'High-capacity copper power cable, industrial product photography, clean white background, studio lighting, photorealistic',
      'Industrial copper power cable coil, commercial catalog photo, premium studio light, realistic detail'
    ]
  },
  {
    sku: 'MTR-002',
    fileName: 'mtr-002-ai.jpg',
    prompts: [
      'Smart three-phase energy meter, industrial hardware product shot, studio lighting, photorealistic',
      'Enterprise electric smart meter device, catalog photography, white background, crisp details'
    ]
  },
  {
    sku: 'GLV-003',
    fileName: 'glv-003-ai.jpg',
    prompts: [
      'Arc-flash insulated safety gloves, industrial PPE product photo, studio lighting, photorealistic',
      'Electrical safety gloves pair, enterprise product catalog image, clean background, realistic texture'
    ]
  }
];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function buildUrls(prompt, skuSeed) {
  const encoded = encodeURIComponent(prompt);
  const base = 'https://image.pollinations.ai/prompt';

  return [
    `${base}/${encoded}?width=1024&height=768&seed=${skuSeed}&nologo=true`,
    `${base}/${encoded}?width=1024&height=768&seed=${skuSeed}&model=flux&nologo=true`,
    `${base}/${encoded}?width=1024&height=768&seed=${skuSeed}&model=turbo&nologo=true`
  ];
}

function skuSeedFromText(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash) + 1000;
}

async function downloadToFile(url, outputFilePath) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'image/*,*/*;q=0.8',
      'User-Agent': 'SupplyChainFrontendImageSeeder/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('image')) {
    throw new Error(`Unexpected content-type: ${contentType || 'unknown'}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 5_000) {
    throw new Error(`Image too small (${buffer.length} bytes)`);
  }

  await writeFile(outputFilePath, buffer);
  return buffer.length;
}

async function run() {
  await mkdir(outputDir, { recursive: true });

  let successCount = 0;

  for (const product of products) {
    const outputFilePath = path.join(outputDir, product.fileName);
    const seed = skuSeedFromText(product.sku);

    let productSaved = false;

    for (const prompt of product.prompts) {
      const urls = buildUrls(prompt, seed);

      for (let idx = 0; idx < urls.length; idx += 1) {
        const url = urls[idx];

        try {
          console.log(`Trying ${product.sku} variant ${idx + 1}: ${url}`);
          const bytes = await downloadToFile(url, outputFilePath);
          console.log(`Saved ${product.fileName} (${bytes} bytes)`);
          successCount += 1;
          productSaved = true;
          break;
        } catch (error) {
          console.log(`Failed ${product.sku} variant ${idx + 1}: ${error.message}`);
          await wait(12000);
        }
      }

      if (productSaved) {
        break;
      }
    }

    if (!productSaved) {
      console.log(`Could not download AI image for ${product.sku} right now (rate limit/provider issue).`);
    }

    await wait(9000);
  }

  console.log(`Completed. ${successCount}/${products.length} product images downloaded.`);

  if (successCount === 0) {
    process.exitCode = 2;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
