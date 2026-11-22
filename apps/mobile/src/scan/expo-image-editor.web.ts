import type { ImageEditor } from './image-editor.ts';

export const expoImageEditor: ImageEditor = {
  async toJpeg(uri, resize, quality) {
    const image = new Image();
    image.src = uri;
    await image.decode();

    const canvas = document.createElement('canvas');
    const scale = resize === null ? 1 : 'width' in resize
      ? resize.width / image.naturalWidth
      : resize.height / image.naturalHeight;
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not prepare this photo.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const jpeg = canvas.toDataURL('image/jpeg', quality);
    const prefix = 'data:image/jpeg;base64,';
    if (!jpeg.startsWith(prefix)) throw new Error('The browser could not convert this photo to JPEG.');
    return { base64: jpeg.slice(prefix.length), width: canvas.width, height: canvas.height };
  },
};
