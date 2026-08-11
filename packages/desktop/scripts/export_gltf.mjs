import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildLilyGeometry } from '../dist/models/lily/model.js';

// Polyfill Node.js environment to behave like a browser for GLTFExporter
global.window = {};
global.document = {
  createElement: () => ({
    getContext: () => ({
      fillRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
    }),
  }),
};

// Polyfill Blob with size property
global.Blob = class Blob {
  constructor(parts) {
    this.parts = parts;
    this.size = parts.reduce((acc, p) => {
      if (typeof p === 'string') return acc + Buffer.byteLength(p);
      if (Buffer.isBuffer(p)) return acc + p.length;
      if (p instanceof ArrayBuffer) return acc + p.byteLength;
      if (p.buffer) return acc + p.buffer.byteLength;
      return acc;
    }, 0);
  }
  async arrayBuffer() {
    const buffers = this.parts.map(p => {
      if (typeof p === 'string') return Buffer.from(p);
      if (Buffer.isBuffer(p)) return p;
      if (p instanceof ArrayBuffer) return Buffer.from(p);
      if (p.buffer) return Buffer.from(p.buffer);
      return Buffer.alloc(0);
    });
    const merged = Buffer.concat(buffers);
    return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
  }
};

// Polyfill FileReader with onload and onloadend support
global.FileReader = class FileReader {
  constructor() {
    this.onload = null;
    this.onloadend = null;
    this.onerror = null;
    this.result = null;
  }
  readAsArrayBuffer(blob) {
    Promise.resolve().then(async () => {
      try {
        let arrayBuffer;
        if (blob.arrayBuffer) {
          arrayBuffer = await blob.arrayBuffer();
        } else if (blob instanceof ArrayBuffer) {
          arrayBuffer = blob;
        } else if (Buffer.isBuffer(blob)) {
          arrayBuffer = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
        } else {
          arrayBuffer = new ArrayBuffer(0);
        }
        this.result = arrayBuffer;
        if (this.onload) {
          this.onload({ target: this });
        }
        if (this.onloadend) {
          this.onloadend({ target: this });
        }
      } catch (e) {
        if (this.onerror) {
          this.onerror(e);
        }
      }
    });
  }
};

// Polyfill URL
global.URL = {
  createObjectURL: () => 'data:application/octet-stream;base64,',
  revokeObjectURL: () => {}
};

const lily = {
  object: new THREE.Group(),
  joints: {},
  restPos: {},
  animator: {
    texture: new THREE.Texture(),
  },
};

console.log("Building Lily's custom 3D model geometry...");
buildLilyGeometry(lily, '#ff8fb3');

// Traverse and strip any texture maps to prevent GLTFExporter from searching for image data
lily.object.traverse((child) => {
  if (child.isMesh && child.material) {
    if (child.material.map) {
      child.material.map = null;
      child.material.color = new THREE.Color('#0f172a');
    }
  }
});

console.log("Starting GLTFExporter...");
const exporter = new GLTFExporter();

const keepAlive = setTimeout(() => {
  console.error("Export timed out after 15 seconds.");
}, 15000);

exporter.parse(
  lily.object,
  (gltf) => {
    clearTimeout(keepAlive);
    const outputPath = path.resolve('models/lily/v1/lily_custom_rigged.glb');
    fs.writeFileSync(outputPath, Buffer.from(gltf));
    console.log(`=== Export Success! ===`);
    console.log(`Saved custom 3D model GLB file to:`);
    console.log(outputPath);
  },
  (err) => {
    clearTimeout(keepAlive);
    console.error("Export failed:", err);
  },
  { binary: true } // Export as binary GLB
);
