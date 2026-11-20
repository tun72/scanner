import type { CameraCapturedPicture, CameraViewProps, PermissionResponse } from 'expo-camera';
import { PermissionStatus } from 'expo';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { View } from 'react-native';

/** Stands in for expo-camera: records the camera's settings and lets a test read a barcode or take a photo. */
export const camera = {
  props: null as CameraViewProps | null,
  photo: { uri: 'file:///meal.jpg', width: 4000, height: 3000, format: 'jpg' } as CameraCapturedPicture,
  permission: { granted: true, canAskAgain: true, status: PermissionStatus.GRANTED, expires: 'never' } as PermissionResponse,
};

/** Hands the screen a barcode, as the camera does when it reads one. */
export function readBarcode(data: string): void {
  camera.props?.onBarcodeScanned?.({ type: 'ean13', data, cornerPoints: [], bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } } });
}

export const CameraView = forwardRef(function CameraView(props: CameraViewProps, ref) {
  camera.props = props;
  useImperativeHandle(ref, () => ({ takePictureAsync: async () => camera.photo }));
  useEffect(() => {
    props.onCameraReady?.();
  }, []);
  return <View testID="camera" />;
});

export const useCameraPermissions = () => [camera.permission, async () => camera.permission] as const;
