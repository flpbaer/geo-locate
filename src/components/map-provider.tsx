//Since the map will be laoded and displayed on client side
'use client';

import { Libraries, useJsApiLoader } from '@react-google-maps/api';
import { ReactNode } from 'react';

const libraries = ['places', 'drawing', 'geometry'];
export function MapProvider({ children }: { children: ReactNode }) {

  const { isLoaded: scriptLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyBz5YADNq8ZENoS3v8XVAnOvKvwbd4mHWE",
    libraries: libraries as Libraries,
  });

  if(loadError) return <p>Encountered error while loading google maps</p>
  if(!scriptLoaded) return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>

  return children;
}