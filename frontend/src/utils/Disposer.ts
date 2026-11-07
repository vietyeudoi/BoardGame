/**
 * Disposer.ts — Three.js Resource Cleanup Utility
 * Properly disposes geometries, materials, and textures.
 */
import * as THREE from 'three';
import { Logger } from './Logger';

const logger = Logger.create('Disposer');

export const Disposer = {
  disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    Disposer.disposeMaterial(mesh.material);
    logger.debug('Mesh disposed', { name: mesh.name });
  },

  disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    const materials = Array.isArray(material) ? material : [material];
    for (const mat of materials) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.map?.dispose();
        mat.normalMap?.dispose();
        mat.roughnessMap?.dispose();
        mat.metalnessMap?.dispose();
      }
      mat.dispose();
    }
  },

  disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        Disposer.disposeMesh(child);
      }
    });
    logger.debug('Object3D disposed recursively', { name: obj.name });
  },
};

