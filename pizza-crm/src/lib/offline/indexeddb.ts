import { openDB } from "idb";

const DB_NAME = "pizza-crm-offline";
const DB_VERSION = 2;

export const getOfflineDb = async () =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pending_orders")) {
        db.createObjectStore("pending_orders", { keyPath: "local_id" });
      }
      // New required store name: menu_cache
      if (!db.objectStoreNames.contains("menu_cache")) {
        db.createObjectStore("menu_cache", { keyPath: "id" });
      }
      // Backward compatibility store name (previous version).
      if (!db.objectStoreNames.contains("cached_menu")) {
        db.createObjectStore("cached_menu", { keyPath: "id" });
      }
    },
  });
