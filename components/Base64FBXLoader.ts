import * as THREE from 'three';
import { FBXLoader } from 'three-stdlib';

export class Base64FBXLoader extends THREE.Loader {
  constructor(manager?: THREE.LoadingManager) {
    super(manager);
  }

  load(url: string, onLoad: (data: THREE.Group) => void, onProgress?: (event: ProgressEvent) => void, onError?: (err: unknown) => void) {
    const loader = new THREE.FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType('text');
    loader.load(url, async (text) => {
      try {
        const rawText = text as string;
        // Strip out newlines just to be completely safe regarding standard DataURIs
        const cleanB64 = rawText.replace(/\s/g, ''); 
        // Use native fetch to convert the huge Base64 string directly in compiled C++ land asynchronously, freeing the main thread
        const dataUri = 'data:application/octet-stream;base64,' + cleanB64;
        const response = await fetch(dataUri);
        const arrayBuffer = await response.arrayBuffer();
        
        const fbxLoader = new FBXLoader(this.manager);
        // @ts-ignore
        const fbx = fbxLoader.parse(arrayBuffer, this.path || '') as THREE.Group;
        
        // Ensure robust memory release for huge strings
        onLoad(fbx);
      } catch (e) {
        if (onError) onError(e);
        else console.error(e);
      }
    }, onProgress, onError);
  }
}
