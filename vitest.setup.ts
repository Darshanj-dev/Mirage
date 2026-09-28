// Fresh browser storage and IndexedDB for every test.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { resetKeyCacheForTests } from './lib/vault';

beforeEach(() => {
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
  resetKeyCacheForTests();
});
