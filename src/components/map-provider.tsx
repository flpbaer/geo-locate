//Since the map will be laoded and displayed on client side
'use client';

import { Libraries, useJsApiLoader } from '@react-google-maps/api';
import { ReactNode } from 'react';

// 'geocoding' é necessária para a geocodificação reversa usada no painel de insights.
// 'drawing' foi removida da Maps JavaScript API na v3.65 — o desenho de áreas é feito
// por conta própria em area-drawing.tsx.
const libraries = ['places', 'geometry', 'geocoding'];
export function MapProvider({ children }: { children: ReactNode }) {

  const { isLoaded: scriptLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyBz5YADNq8ZENoS3v8XVAnOvKvwbd4mHWE",
    libraries: libraries as Libraries,
  });

  if (loadError)
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center">
        <p className="max-w-xs text-sm text-muted-foreground">
          Não foi possível carregar o mapa do Google. Os painéis seguem funcionando.
        </p>
      </div>
    )

  if (!scriptLoaded)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    )

  return children;
}