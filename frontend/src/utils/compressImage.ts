const TARGET_BYTES = 50 * 1024;

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the compressed image.'));
    reader.readAsDataURL(blob);
  });
}

async function encodeWebp(source: ImageBitmap, width: number, height: number, quality: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image compression is not available in this browser.');
  }
  context.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('This browser could not encode a WebP image.');
  }
  return blob;
}

/** Compress a product photo to WebP at about 50KB before it is uploaded. */
export async function compressImageToWebp(file: File) {
  const source = await createImageBitmap(file);
  try {
    let width = source.width;
    let height = source.height;
    const longest = Math.max(width, height);
    if (longest > 960) {
      const scale = 960 / longest;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    let quality = 0.82;
    let blob = await encodeWebp(source, width, height, quality);
    while (blob.size > TARGET_BYTES && (quality > 0.42 || width > 280)) {
      if (quality > 0.42) {
        quality = Math.round((quality - 0.08) * 100) / 100;
      } else {
        width = Math.max(280, Math.round(width * 0.82));
        height = Math.max(280, Math.round(height * 0.82));
      }
      blob = await encodeWebp(source, width, height, quality);
    }

    if (blob.size > TARGET_BYTES + 8 * 1024) {
      throw new Error('Could not compress the image to about 50KB. Try a simpler photo.');
    }

    return {
      dataUrl: await blobToDataUrl(blob),
      bytes: blob.size,
    };
  } finally {
    source.close();
  }
}
