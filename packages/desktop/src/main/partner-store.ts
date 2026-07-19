import * as coreStore from '@superagent/core';
import path from 'path';

export {
  installPartnerFolder,
  importPartnerJson,
  removePartner,
  setActivePartner,
  getActivePartner,
  partnerFolderPath
} from '@superagent/core';

// Override listPartners and getPartner to customize Lily's local asset directory in the Electron build
export function listPartners(userData: string): Record<string, unknown>[] {
  const list = coreStore.listPartners(userData);
  const lily = list.find(p => p.id === 'lily');
  if (lily) {
    lily.folder = path.join(__dirname, '..');
  }
  return list;
}

export function getPartner(userData: string, id: string): Record<string, unknown> | null {
  const p = coreStore.getPartner(userData, id);
  if (p && id === 'lily') {
    p.folder = path.join(__dirname, '..');
  }
  return p;
}
