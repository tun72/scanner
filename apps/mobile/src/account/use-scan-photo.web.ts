import { useEffect, useState } from 'react';
import { accountRequest, activeSession } from './session.ts';

export function useScanPhoto(id: string | undefined) {
  const session = activeSession();
  const [photo, setPhoto] = useState<{ id: string; token: string; uri: string }>();

  useEffect(() => {
    if (id === undefined || !session) return;
    let live = true;
    let uri: string | undefined;
    void accountRequest(`/v1/history/${encodeURIComponent(id)}/photo`, {}, session)
      .then(response => response.blob())
      .then(blob => {
        if (!live || !blob.type.startsWith('image/')) return;
        uri = URL.createObjectURL(blob);
        setPhoto({ id, token: session.token, uri });
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (uri) URL.revokeObjectURL(uri);
    };
  }, [id, session]);

  return photo && photo.id === id && photo.token === session?.token ? { uri: photo.uri } : undefined;
}
