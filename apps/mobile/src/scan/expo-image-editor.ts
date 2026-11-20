import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImageEditor } from './image-editor.ts';

/** The ImageEditor on a phone, using expo-image-manipulator. */
export const expoImageEditor: ImageEditor = {
  async toJpeg(uri, resize, quality) {
    const context = ImageManipulator.manipulate(uri);
    try {
      if (resize !== null) context.resize(resize);
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
        if (saved.base64 === undefined) throw new Error('The image editor returned no image data.');
        // Some platforms wrap base64 in lines; the API accepts only unbroken base64.
        return { base64: saved.base64.replace(/\s/g, ''), width: saved.width, height: saved.height };
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  },
};
