import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { savedProfile } from '../helpers.ts';
import { camera } from './fake-camera.tsx';
import { resetFake, sent } from './fake-services.ts';
import { routes } from './routes.ts';

jest.mock('../../src/services.ts', () => jest.requireActual<typeof import('./fake-services.ts')>('./fake-services.ts').services);
jest.mock('expo-camera', () => jest.requireActual('./fake-camera.tsx'));

describe('starting a scan', () => {
  beforeEach(() => {
    camera.props = null;
  });

  it('TC4 scanning with a saved profile opens the camera', async () => {
    resetFake(savedProfile());
    const router = await renderRouter(routes, { initialUrl: '/' });

    await fireEvent.press(await screen.findByText('Scan a food'));

    await screen.findByTestId('camera');
    expect(router.getPathname()).toBe('/scan');
    expect(camera.props?.barcodeScannerSettings?.barcodeTypes).toEqual(['ean13', 'ean8', 'upc_a', 'upc_e']);
    expect(screen.getByText('Take photo')).toBeTruthy();
  });

  it('TC5 scanning without a profile goes to setup and sends nothing', async () => {
    resetFake(null);
    const router = await renderRouter(routes, { initialUrl: '/scan' });

    await screen.findByText('I understand');
    expect(router.getPathname()).toBe('/notice');
    expect(screen.queryByTestId('camera')).toBeNull();
    expect(sent()).toEqual([]);
  });
});
