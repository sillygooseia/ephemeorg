(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/@epheme/core/dist/browser/device.js
  var require_device = __commonJS({
    "node_modules/@epheme/core/dist/browser/device.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.EphemeDevice = void 0;
      var DEVICE_DB_NAME = "epheme_device";
      var DEVICE_STORE = "credentials";
      var DEVICE_KEY = "device";
      var HUB_JWT_LS_KEY = "epheme_hub_device_jwt";
      var EphemeDevice = class {
        _credential = null;
        get isRegistered() {
          const c = this._credential;
          return !!(c && c.status === "active" && c.jwt && c.jwtExpiresAt > Date.now() + 3e4);
        }
        get deviceId() {
          return this._credential?.deviceId ?? null;
        }
        get jwt() {
          const c = this._credential;
          if (!c?.jwt)
            return null;
          if (c.jwtExpiresAt <= Date.now() + 3e4)
            return null;
          return c.jwt;
        }
        get displayName() {
          return this._credential?.displayName ?? null;
        }
        /**
         * Load the credential from the Hub IndexedDB.
         * Call once during app init. Silently no-ops if Hub has never registered.
         */
        async load() {
          const cred = await this._readFromIdb();
          if (cred) {
            this._credential = cred;
            if (cred.jwt) {
              localStorage.setItem(HUB_JWT_LS_KEY, cred.jwt);
            }
          }
        }
        /**
         * Returns a stable device identifier regardless of Hub registration status.
         *
         * Priority:
         *   1. An existing value stored under `fallbackKey` in localStorage — preserves
         *      identity continuity if the device was previously anonymous. This prevents
         *      a device from appearing as a new identity after Hub registration.
         *   2. Hub-loaded deviceId (from load()) — used when no prior local identity exists
         *   3. A newly generated anonymous UUID written to localStorage under `fallbackKey`
         *
         * If the device carries an active Hub JWT, callers should use `jwt` directly
         * via `Authorization: Bearer` instead of calling this method.
         *
         * Call after load(). Tools should pass a namespaced key, e.g. `'mytool:device-id'`.
         */
        getStableId(fallbackKey) {
          const existing = localStorage.getItem(fallbackKey);
          if (existing)
            return existing;
          if (this._credential?.deviceId) {
            localStorage.setItem(fallbackKey, this._credential.deviceId);
            return this._credential.deviceId;
          }
          const id = globalThis.crypto?.randomUUID?.() ?? (() => {
            const b = new Uint8Array(16);
            (globalThis.crypto?.getRandomValues ?? ((arr) => arr.map(() => Math.floor(Math.random() * 256))))(b);
            b[6] = b[6] & 15 | 64;
            b[8] = b[8] & 63 | 128;
            const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
            return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
          })();
          localStorage.setItem(fallbackKey, id);
          return id;
        }
        // ─── Private ────────────────────────────────────────────────────────────────
        _readFromIdb() {
          return new Promise((resolve) => {
            const req = indexedDB.open(DEVICE_DB_NAME, 1);
            req.onerror = () => resolve(null);
            req.onupgradeneeded = (e) => {
              e.target.result.close();
              resolve(null);
            };
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains(DEVICE_STORE)) {
                db.close();
                resolve(null);
                return;
              }
              const tx = db.transaction(DEVICE_STORE, "readonly");
              const getReq = tx.objectStore(DEVICE_STORE).get(DEVICE_KEY);
              getReq.onsuccess = () => {
                db.close();
                resolve(getReq.result ?? null);
              };
              getReq.onerror = () => {
                db.close();
                resolve(null);
              };
            };
          });
        }
      };
      exports.EphemeDevice = EphemeDevice;
    }
  });

  // node_modules/@epheme/core/dist/browser/device-controller.js
  var require_device_controller = __commonJS({
    "node_modules/@epheme/core/dist/browser/device-controller.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.EphemeDeviceController = void 0;
      var device_1 = require_device();
      var EphemeDeviceController = class {
        _core = new device_1.EphemeDevice();
        _listeners = /* @__PURE__ */ new Set();
        _loaded = false;
        onChange(listener) {
          this._listeners.add(listener);
          return () => this._listeners.delete(listener);
        }
        get isLoaded() {
          return this._loaded;
        }
        get isRegistered() {
          return this._loaded && this._core.isRegistered;
        }
        get deviceId() {
          return this._core.deviceId;
        }
        get jwt() {
          return this._core.jwt;
        }
        get displayName() {
          return this._core.displayName;
        }
        /**
         * Returns a stable device identifier regardless of Hub registration status.
         * Delegates to EphemeDevice.getStableId(). Call after load().
         * Pass a namespaced localStorage key, e.g. `'mytool:device-id'`.
         */
        getStableId(fallbackKey) {
          return this._core.getStableId(fallbackKey);
        }
        async load() {
          await this._core.load();
          this._loaded = true;
          this._emit();
        }
        _emit() {
          for (const listener of this._listeners) {
            try {
              listener();
            } catch {
            }
          }
        }
      };
      exports.EphemeDeviceController = EphemeDeviceController;
    }
  });

  // node_modules/@epheme/core/dist/browser/hub-url.js
  var require_hub_url = __commonJS({
    "node_modules/@epheme/core/dist/browser/hub-url.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.resolveEphemeHubBaseUrl = resolveEphemeHubBaseUrl;
      exports.getCurrentEphemeReturnPath = getCurrentEphemeReturnPath;
      function resolveEphemeHubBaseUrl() {
        const stored = localStorage.getItem("epheme_hub_url")?.trim();
        if (stored)
          return stored.replace(/\/$/, "");
        const { protocol, hostname, port, origin } = window.location;
        const isLocalDev = hostname === "localhost" || hostname === "127.0.0.1";
        if (isLocalDev && port !== "8080") {
          return `${protocol}//${hostname}:8080/hub`;
        }
        return `${origin}/hub`;
      }
      function getCurrentEphemeReturnPath() {
        return `${window.location.pathname}${window.location.search}${window.location.hash}`;
      }
    }
  });

  // node_modules/@epheme/core/dist/browser/hub-sync.js
  var require_hub_sync = __commonJS({
    "node_modules/@epheme/core/dist/browser/hub-sync.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.EphemeHubSync = void 0;
      var hub_url_1 = require_hub_url();
      var HUB_URL_KEY = "epheme_hub_url";
      var HUB_DEVICE_JWT_KEY = "epheme_hub_device_jwt";
      var EphemeHubSync = class {
        /** Resolves the Hub base URL (no trailing slash). */
        getResolvedHubUrl() {
          return (0, hub_url_1.resolveEphemeHubBaseUrl)();
        }
        /** True when a valid device JWT is in localStorage. */
        isConfigured() {
          return this._isJwtUsable(localStorage.getItem(HUB_DEVICE_JWT_KEY));
        }
        /**
         * Re-checks whether a valid device JWT is in localStorage.
         * Returns true if sync is ready to use.
         * Useful to call after DeviceService.load() to pick up the mirrored JWT.
         */
        ensureAutoConfigured() {
          return this.isConfigured();
        }
        /** Explicitly configure Hub URL and device JWT (e.g. from a settings UI). */
        configure(hubUrl, deviceJwt) {
          localStorage.setItem(HUB_URL_KEY, hubUrl.replace(/\/$/, ""));
          localStorage.setItem(HUB_DEVICE_JWT_KEY, deviceJwt);
        }
        clear() {
          localStorage.removeItem(HUB_DEVICE_JWT_KEY);
        }
        async push(namespace, data) {
          const jwt = this._getJwt();
          if (!jwt)
            return { ok: true };
          try {
            const res = await fetch(`${this.getResolvedHubUrl()}/api/tools/${namespace}/data`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({ data })
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              return { ok: false, error: body.error || `HTTP ${res.status}` };
            }
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err?.message ?? "Network error" };
          }
        }
        async pull(namespace) {
          const jwt = this._getJwt();
          if (!jwt)
            return null;
          try {
            const res = await fetch(`${this.getResolvedHubUrl()}/api/tools/${namespace}/data`, {
              method: "GET",
              headers: { Authorization: `Bearer ${jwt}` }
            });
            if (!res.ok)
              return null;
            const body = await res.json();
            return body.data ?? null;
          } catch {
            return null;
          }
        }
        async delete(namespace) {
          const jwt = this._getJwt();
          if (!jwt)
            return { ok: true };
          try {
            const res = await fetch(`${this.getResolvedHubUrl()}/api/tools/${namespace}/data`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${jwt}` }
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              return { ok: false, error: body.error || `HTTP ${res.status}` };
            }
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err?.message ?? "Network error" };
          }
        }
        // ─── Private ────────────────────────────────────────────────────────────────
        _getJwt() {
          const jwt = localStorage.getItem(HUB_DEVICE_JWT_KEY);
          return this._isJwtUsable(jwt) ? jwt : null;
        }
        _isJwtUsable(jwt) {
          if (!jwt)
            return false;
          try {
            const [, payload] = jwt.split(".");
            const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
            return typeof exp === "number" && exp > Math.floor(Date.now() / 1e3) + 30;
          } catch {
            return true;
          }
        }
      };
      exports.EphemeHubSync = EphemeHubSync;
    }
  });

  // node_modules/@epheme/core/dist/browser/license.js
  var require_license = __commonJS({
    "node_modules/@epheme/core/dist/browser/license.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.EphemeLicense = void 0;
      var EphemeLicense = class {
        cfg;
        _state = null;
        _publicKey = null;
        _publicKeyLoading = null;
        constructor(cfg) {
          this.cfg = cfg;
        }
        get isPremium() {
          if (!this._state)
            return false;
          return this._state.claims.exp > Math.floor(Date.now() / 1e3);
        }
        get licenseExpiry() {
          return this._state?.claims.exp ?? null;
        }
        get licenseJti() {
          return this._state?.claims.jti ?? null;
        }
        get token() {
          return this._state?.token ?? null;
        }
        /**
         * Synchronous fast-load from localStorage.
         * Call once on construction/init — does NOT do crypto verification.
         * A background verify is kicked off automatically via verifyStoredToken().
         */
        loadFromStorage() {
          const raw = localStorage.getItem(this.cfg.storageKey);
          if (!raw)
            return;
          try {
            const claims = this._decodePayload(raw);
            if (claims.exp <= Math.floor(Date.now() / 1e3)) {
              console.warn("[license] Stored license expired \u2014 clearing");
              localStorage.removeItem(this.cfg.storageKey);
              return;
            }
            this._state = { token: raw, claims };
            console.log("[license] Loaded from storage, jti:", claims.jti);
          } catch {
            console.warn("[license] Failed to parse stored license \u2014 clearing");
            localStorage.removeItem(this.cfg.storageKey);
          }
        }
        /**
         * Background crypto verification — call after loadFromStorage().
         * Deactivates if the stored token fails RS256 signature check.
         */
        async verifyStoredToken() {
          const raw = this._state?.token;
          if (!raw)
            return;
          try {
            const key = await this._getPublicKey();
            await this._verifySignature(raw, key);
          } catch (err) {
            console.warn("[license] Background verification failed \u2014 deactivating:", err);
            this.deactivate();
          }
        }
        /** Verify and activate a raw JWT string. Returns true on success. */
        async activate(rawToken) {
          try {
            let key;
            let claims;
            try {
              key = await this._getPublicKey();
              await this._verifySignature(rawToken, key);
              claims = this._decodePayload(rawToken);
            } catch {
              this._clearCachedPublicKey();
              key = await this._getPublicKey();
              await this._verifySignature(rawToken, key);
              claims = this._decodePayload(rawToken);
            }
            if (claims.lic !== "premium") {
              console.warn('[license] Token lic field is not "premium"');
              return false;
            }
            localStorage.setItem(this.cfg.storageKey, rawToken);
            this._state = { token: rawToken, claims };
            console.log("[license] Activated, jti:", claims.jti);
            return true;
          } catch (err) {
            console.warn("[license] Activation failed:", err);
            return false;
          }
        }
        deactivate() {
          localStorage.removeItem(this.cfg.storageKey);
          this._state = null;
          console.log("[license] Deactivated");
        }
        getLicense() {
          return this._state?.claims ?? null;
        }
        isExpired() {
          if (!this._state)
            return false;
          return this._state.claims.exp <= Math.floor(Date.now() / 1e3);
        }
        hasFeature(feature) {
          if (!this.isPremium)
            return false;
          return this._state?.claims.features?.includes(feature) ?? false;
        }
        // ─── Private ────────────────────────────────────────────────────────────────
        _decodePayload(raw) {
          const parts = raw.split(".");
          if (parts.length !== 3)
            throw new Error("Invalid JWT format");
          return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        }
        async _verifySignature(raw, key) {
          const parts = raw.split(".");
          if (parts.length !== 3)
            throw new Error("Invalid JWT format");
          const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
          const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
          const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sig, data);
          if (!valid)
            throw new Error("JWT signature invalid");
        }
        _clearCachedPublicKey() {
          this._publicKey = null;
          this._publicKeyLoading = null;
          localStorage.removeItem(this.cfg.publicKeyCacheKey);
        }
        _getPublicKey() {
          if (this._publicKey)
            return Promise.resolve(this._publicKey);
          if (!this._publicKeyLoading) {
            this._publicKeyLoading = this._fetchPublicKey().finally(() => {
              this._publicKeyLoading = null;
            });
          }
          return this._publicKeyLoading;
        }
        async _fetchPublicKey() {
          const cached = localStorage.getItem(this.cfg.publicKeyCacheKey);
          if (cached) {
            try {
              const key2 = await this._importSpki(cached);
              this._publicKey = key2;
              return key2;
            } catch {
              localStorage.removeItem(this.cfg.publicKeyCacheKey);
            }
          }
          const res = await fetch(this.cfg.publicKeyUrl);
          if (!res.ok)
            throw new Error(`Failed to fetch public key: HTTP ${res.status}`);
          const raw = (await res.text()).trim();
          const pem = raw.startsWith("{") ? JSON.parse(raw).publicKey : raw;
          localStorage.setItem(this.cfg.publicKeyCacheKey, pem);
          const key = await this._importSpki(pem);
          this._publicKey = key;
          return key;
        }
        _importSpki(pem) {
          const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
          const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
          return crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
        }
      };
      exports.EphemeLicense = EphemeLicense;
    }
  });

  // node_modules/@epheme/core/dist/browser/idb.js
  var require_idb = __commonJS({
    "node_modules/@epheme/core/dist/browser/idb.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.IdbDatabase = exports.TypedStore = void 0;
      var TypedStore = class {
        _db;
        _storeName;
        constructor(_db, _storeName) {
          this._db = _db;
          this._storeName = _storeName;
        }
        _tx(mode) {
          return this._db.transaction(this._storeName, mode).objectStore(this._storeName);
        }
        get(id) {
          return new Promise((resolve, reject) => {
            const req = this._tx("readonly").get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        }
        getAll() {
          return new Promise((resolve, reject) => {
            const req = this._tx("readonly").getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        }
        getByIndex(index, value) {
          return new Promise((resolve, reject) => {
            const req = this._tx("readonly").index(index).getAll(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        }
        put(item) {
          return new Promise((resolve, reject) => {
            const req = this._tx("readwrite").put(item);
            req.onsuccess = () => resolve(item);
            req.onerror = () => reject(req.error);
          });
        }
        delete(id) {
          return new Promise((resolve, reject) => {
            const req = this._tx("readwrite").delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        }
        clear() {
          return new Promise((resolve, reject) => {
            const req = this._tx("readwrite").clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        }
      };
      exports.TypedStore = TypedStore;
      var IdbDatabase = class {
        _name;
        _version;
        _schemas;
        _db = null;
        constructor(_name, _version, _schemas) {
          this._name = _name;
          this._version = _version;
          this._schemas = _schemas;
        }
        open() {
          if (this._db)
            return Promise.resolve();
          return new Promise((resolve, reject) => {
            const req = indexedDB.open(this._name, this._version);
            req.onupgradeneeded = (event) => {
              const db = event.target.result;
              for (const schema of this._schemas) {
                if (!db.objectStoreNames.contains(schema.name)) {
                  const store = db.createObjectStore(schema.name, { keyPath: schema.keyPath });
                  for (const idx of schema.indexes ?? []) {
                    store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false });
                  }
                }
              }
            };
            req.onsuccess = () => {
              this._db = req.result;
              resolve();
            };
            req.onerror = () => reject(req.error);
          });
        }
        store(name) {
          if (!this._db)
            throw new Error(`IdbDatabase "${this._name}" not open - call open() first`);
          return new TypedStore(this._db, name);
        }
        close() {
          this._db?.close();
          this._db = null;
        }
      };
      exports.IdbDatabase = IdbDatabase;
    }
  });

  // node_modules/@epheme/core/dist/browser/hub-device-connect.js
  var require_hub_device_connect = __commonJS({
    "node_modules/@epheme/core/dist/browser/hub-device-connect.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.buildEphemeHubDeviceRegistrationUrl = buildEphemeHubDeviceRegistrationUrl;
      exports.redirectToEphemeHubDeviceRegistration = redirectToEphemeHubDeviceRegistration;
      var hub_url_1 = require_hub_url();
      function buildEphemeHubDeviceRegistrationUrl(returnTo) {
        const hubBase = (0, hub_url_1.resolveEphemeHubBaseUrl)();
        const target = returnTo ?? (0, hub_url_1.getCurrentEphemeReturnPath)();
        const url = new URL(`${hubBase}/device/register`, window.location.origin);
        url.searchParams.set("return", target);
        return url.toString();
      }
      function redirectToEphemeHubDeviceRegistration(returnTo) {
        window.location.assign(buildEphemeHubDeviceRegistrationUrl(returnTo));
      }
    }
  });

  // node_modules/@epheme/core/dist/browser/client.js
  var require_client = __commonJS({
    "node_modules/@epheme/core/dist/browser/client.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.createEphemeClient = createEphemeClient;
      var device_controller_1 = require_device_controller();
      var hub_sync_1 = require_hub_sync();
      var license_1 = require_license();
      var idb_1 = require_idb();
      var hub_device_connect_1 = require_hub_device_connect();
      function createEphemeClient(opts) {
        if (opts?.hubUrl) {
          localStorage.setItem("epheme_hub_url", opts.hubUrl.replace(/\/$/, ""));
        }
        const device = new device_controller_1.EphemeDeviceController();
        const sync = new hub_sync_1.EphemeHubSync();
        return {
          device,
          sync,
          async init() {
            await device.load();
            sync.ensureAutoConfigured();
          },
          redirectToHub(returnTo) {
            (0, hub_device_connect_1.redirectToEphemeHubDeviceRegistration)(returnTo);
          },
          buildHubUrl(returnTo) {
            return (0, hub_device_connect_1.buildEphemeHubDeviceRegistrationUrl)(returnTo);
          },
          license(config) {
            return new license_1.EphemeLicense(config);
          },
          db(name, version, migrations) {
            return new idb_1.IdbDatabase(name, version, migrations);
          }
        };
      }
    }
  });

  // node_modules/@epheme/core/dist/browser/idb-kv.js
  var require_idb_kv = __commonJS({
    "node_modules/@epheme/core/dist/browser/idb-kv.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.IdbKeyValueStore = void 0;
      var IdbKeyValueStore = class {
        _dbName;
        _version;
        _storeName;
        _db = null;
        _opening = null;
        constructor(_dbName, _version, _storeName) {
          this._dbName = _dbName;
          this._version = _version;
          this._storeName = _storeName;
        }
        _resetDb() {
          this._db?.close();
          this._db = null;
          this._opening = null;
          return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(this._dbName);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error(`IndexedDB delete blocked for ${this._dbName}`));
          });
        }
        _isMissingStoreError(error) {
          return error instanceof DOMException && error.name === "NotFoundError";
        }
        _openDb() {
          if (this._db)
            return Promise.resolve(this._db);
          if (this._opening)
            return this._opening;
          this._opening = new Promise((resolve, reject) => {
            const req = indexedDB.open(this._dbName, this._version);
            req.onupgradeneeded = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains(this._storeName)) {
                db.createObjectStore(this._storeName);
              }
            };
            req.onsuccess = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains(this._storeName)) {
                this._db = db;
                this._resetDb().then(() => this._openDb().then(resolve, reject), reject);
                return;
              }
              db.onversionchange = () => {
                if (this._db === db) {
                  this._db.close();
                  this._db = null;
                } else {
                  db.close();
                }
              };
              this._db = db;
              this._opening = null;
              resolve(this._db);
            };
            req.onerror = () => {
              this._opening = null;
              reject(req.error);
            };
          });
          return this._opening;
        }
        async get(key) {
          return this._runTransaction("readonly", (store, resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
          });
        }
        async put(key, value) {
          await this._runTransaction("readwrite", (store, resolve, reject) => {
            const req = store.put(value, key);
            req.onsuccess = () => resolve(void 0);
            req.onerror = () => reject(req.error);
          });
        }
        async delete(key) {
          await this._runTransaction("readwrite", (store, resolve, reject) => {
            const req = store.delete(key);
            req.onsuccess = () => resolve(void 0);
            req.onerror = () => reject(req.error);
          });
        }
        async _runTransaction(mode, execute, retried = false) {
          const db = await this._openDb();
          try {
            return await new Promise((resolve, reject) => {
              const store = db.transaction(this._storeName, mode).objectStore(this._storeName);
              execute(store, resolve, reject);
            });
          } catch (error) {
            if (!retried && this._isMissingStoreError(error)) {
              await this._resetDb();
              return this._runTransaction(mode, execute, true);
            }
            throw error;
          }
        }
        close() {
          this._db?.close();
          this._db = null;
        }
      };
      exports.IdbKeyValueStore = IdbKeyValueStore;
    }
  });

  // node_modules/@epheme/core/dist/browser/license-controller.js
  var require_license_controller = __commonJS({
    "node_modules/@epheme/core/dist/browser/license-controller.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.EphemeLicenseController = void 0;
      var license_1 = require_license();
      var EphemeLicenseController = class {
        _core;
        _listeners = /* @__PURE__ */ new Set();
        constructor(cfg) {
          this._core = new license_1.EphemeLicense(cfg);
          this._core.loadFromStorage();
          void this._core.verifyStoredToken().then(() => this._emit());
        }
        onChange(listener) {
          this._listeners.add(listener);
          return () => this._listeners.delete(listener);
        }
        get isPremium() {
          return this._core.isPremium;
        }
        get licenseExpiry() {
          return this._core.licenseExpiry;
        }
        get licenseJti() {
          return this._core.licenseJti;
        }
        get token() {
          return this._core.token;
        }
        async activate(rawToken) {
          const ok = await this._core.activate(rawToken);
          this._emit();
          return ok;
        }
        deactivate() {
          this._core.deactivate();
          this._emit();
        }
        getLicense() {
          return this._core.getLicense();
        }
        isExpired() {
          return this._core.isExpired();
        }
        hasFeature(feature) {
          return this._core.hasFeature(feature);
        }
        _emit() {
          for (const listener of this._listeners) {
            try {
              listener();
            } catch {
            }
          }
        }
      };
      exports.EphemeLicenseController = EphemeLicenseController;
    }
  });

  // node_modules/@epheme/core/dist/browser/app-bootstrap.js
  var require_app_bootstrap = __commonJS({
    "node_modules/@epheme/core/dist/browser/app-bootstrap.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.createEphemeDeviceDbBootstrap = createEphemeDeviceDbBootstrap;
      function createEphemeDeviceDbBootstrap(device, db) {
        return async () => {
          await device.load();
          await db.open();
        };
      }
    }
  });

  // node_modules/@epheme/core/dist/browser/plugin-registry.js
  var require_plugin_registry = __commonJS({
    "node_modules/@epheme/core/dist/browser/plugin-registry.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.EphemePluginRegistry = void 0;
      var EphemePluginRegistry = class {
        _plugins = /* @__PURE__ */ new Map();
        /**
         * Register a browser plugin. Safe to call multiple times with the same id
         * (re-registration is a no-op and logs a warning).
         */
        register(plugin) {
          if (this._plugins.has(plugin.id)) {
            console.warn(`[EphemePluginRegistry] plugin "${plugin.id}" already registered \u2014 skipping.`);
            return;
          }
          this._plugins.set(plugin.id, plugin);
        }
        /**
         * Returns components registered for a given slot, filtered by the provided
         * active license features. Components with no requiredFeature are always included.
         * Results are sorted by panel.order (ascending, default 0).
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getSlotComponents(slot, activeFeatures = []) {
          const results = [];
          for (const plugin of this._plugins.values()) {
            for (const panel of plugin.panels ?? []) {
              if (panel.slot !== slot)
                continue;
              if (panel.requiredFeature && !activeFeatures.includes(panel.requiredFeature))
                continue;
              results.push({ component: panel.component, order: panel.order ?? 0 });
            }
          }
          results.sort((a, b) => a.order - b.order);
          return results.map((r) => r.component);
        }
        /**
         * Returns the merged lazy route config from all registered plugins.
         * Suitable for spreading into the host's provideRouter([...coreRoutes, ...pluginRoutes]).
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getRoutes() {
          const routes = [];
          for (const plugin of this._plugins.values()) {
            routes.push(...plugin.routes ?? []);
          }
          return routes;
        }
        /**
         * Returns all environment providers contributed by registered plugins.
         * Pass to the host's bootstrapApplication providers array.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getProviders() {
          const providers = [];
          for (const plugin of this._plugins.values()) {
            providers.push(...plugin.providers ?? []);
          }
          return providers;
        }
      };
      exports.EphemePluginRegistry = EphemePluginRegistry;
    }
  });

  // node_modules/@epheme/core/dist/browser/index.js
  var require_browser = __commonJS({
    "node_modules/@epheme/core/dist/browser/index.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.EphemePluginRegistry = exports.createEphemeDeviceDbBootstrap = exports.EphemeLicenseController = exports.EphemeLicense = exports.redirectToEphemeHubDeviceRegistration = exports.buildEphemeHubDeviceRegistrationUrl = exports.getCurrentEphemeReturnPath = exports.resolveEphemeHubBaseUrl = exports.EphemeHubSync = exports.EphemeDeviceController = exports.EphemeDevice = exports.IdbKeyValueStore = exports.TypedStore = exports.IdbDatabase = exports.createEphemeClient = void 0;
      var client_1 = require_client();
      Object.defineProperty(exports, "createEphemeClient", { enumerable: true, get: function() {
        return client_1.createEphemeClient;
      } });
      var idb_1 = require_idb();
      Object.defineProperty(exports, "IdbDatabase", { enumerable: true, get: function() {
        return idb_1.IdbDatabase;
      } });
      Object.defineProperty(exports, "TypedStore", { enumerable: true, get: function() {
        return idb_1.TypedStore;
      } });
      var idb_kv_1 = require_idb_kv();
      Object.defineProperty(exports, "IdbKeyValueStore", { enumerable: true, get: function() {
        return idb_kv_1.IdbKeyValueStore;
      } });
      var device_1 = require_device();
      Object.defineProperty(exports, "EphemeDevice", { enumerable: true, get: function() {
        return device_1.EphemeDevice;
      } });
      var device_controller_1 = require_device_controller();
      Object.defineProperty(exports, "EphemeDeviceController", { enumerable: true, get: function() {
        return device_controller_1.EphemeDeviceController;
      } });
      var hub_sync_1 = require_hub_sync();
      Object.defineProperty(exports, "EphemeHubSync", { enumerable: true, get: function() {
        return hub_sync_1.EphemeHubSync;
      } });
      var hub_url_1 = require_hub_url();
      Object.defineProperty(exports, "resolveEphemeHubBaseUrl", { enumerable: true, get: function() {
        return hub_url_1.resolveEphemeHubBaseUrl;
      } });
      Object.defineProperty(exports, "getCurrentEphemeReturnPath", { enumerable: true, get: function() {
        return hub_url_1.getCurrentEphemeReturnPath;
      } });
      var hub_device_connect_1 = require_hub_device_connect();
      Object.defineProperty(exports, "buildEphemeHubDeviceRegistrationUrl", { enumerable: true, get: function() {
        return hub_device_connect_1.buildEphemeHubDeviceRegistrationUrl;
      } });
      Object.defineProperty(exports, "redirectToEphemeHubDeviceRegistration", { enumerable: true, get: function() {
        return hub_device_connect_1.redirectToEphemeHubDeviceRegistration;
      } });
      var license_1 = require_license();
      Object.defineProperty(exports, "EphemeLicense", { enumerable: true, get: function() {
        return license_1.EphemeLicense;
      } });
      var license_controller_1 = require_license_controller();
      Object.defineProperty(exports, "EphemeLicenseController", { enumerable: true, get: function() {
        return license_controller_1.EphemeLicenseController;
      } });
      var app_bootstrap_1 = require_app_bootstrap();
      Object.defineProperty(exports, "createEphemeDeviceDbBootstrap", { enumerable: true, get: function() {
        return app_bootstrap_1.createEphemeDeviceDbBootstrap;
      } });
      var plugin_registry_1 = require_plugin_registry();
      Object.defineProperty(exports, "EphemePluginRegistry", { enumerable: true, get: function() {
        return plugin_registry_1.EphemePluginRegistry;
      } });
    }
  });

  // src/vote.js
  var require_vote = __commonJS({
    "src/vote.js"() {
      var import_browser = __toESM(require_browser());
      var POLL_DEVICE_KEY = "ephemeorg:vote-device-id";
      var POLL_ENDPOINT = "/api/votes";
      var _device = new import_browser.EphemeDevice();
      var _deviceLoaded = false;
      async function ensureDevice() {
        if (!_deviceLoaded) {
          await _device.load();
          _deviceLoaded = true;
        }
      }
      async function getRequestHeaders() {
        await ensureDevice();
        const headers = { "Content-Type": "application/json" };
        if (_device.isRegistered && _device.jwt) {
          headers["Authorization"] = `Bearer ${_device.jwt}`;
        } else {
          headers["X-Device-Id"] = _device.getStableId(POLL_DEVICE_KEY);
        }
        return headers;
      }
      function formatResetTime(timestamp) {
        if (!timestamp) return "\u2014";
        return new Date(Number(timestamp)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      function setStatus(message) {
        const el = document.getElementById("poll-status");
        if (el) el.textContent = message;
      }
      function setCounts({ up = 0, down = 0, resetAt = null, deviceVote = null }) {
        const upEl = document.getElementById("poll-count-up");
        const downEl = document.getElementById("poll-count-down");
        const resetEl = document.getElementById("poll-reset");
        if (upEl) upEl.textContent = String(up);
        if (downEl) downEl.textContent = String(down);
        if (resetEl) resetEl.textContent = formatResetTime(resetAt);
        document.querySelectorAll(".poll-button[data-vote]").forEach((btn) => {
          btn.classList.toggle("selected", btn.getAttribute("data-vote") === deviceVote);
        });
      }
      function setButtonsDisabled(value) {
        document.querySelectorAll(".poll-button[data-vote]").forEach((btn) => {
          btn.disabled = value;
        });
      }
      async function loadVotes() {
        try {
          setButtonsDisabled(true);
          setStatus("Refreshing poll\u2026");
          const response = await fetch(POLL_ENDPOINT, { headers: await getRequestHeaders() });
          const data = await response.json();
          if (!response.ok) {
            setStatus(data.error || "Unable to load poll results.");
            return;
          }
          setCounts(data);
          if (data.unavailable) {
            setStatus("Poll storage not available right now.");
            setButtonsDisabled(true);
            return;
          }
          setStatus(data.deviceVote ? "Your vote is recorded." : "Your vote helps shape the direction.");
        } catch {
          setStatus("Unable to contact poll service.");
        } finally {
          setButtonsDisabled(false);
        }
      }
      async function submitVote(vote) {
        try {
          setButtonsDisabled(true);
          setStatus("Sending your vote\u2026");
          const response = await fetch(POLL_ENDPOINT, {
            method: "POST",
            headers: await getRequestHeaders(),
            body: JSON.stringify({ vote })
          });
          const data = await response.json();
          if (!response.ok) {
            setStatus(data.error || "Unable to submit vote.");
            return;
          }
          setCounts(data);
          setStatus("Vote recorded. Thank you.");
        } catch {
          setStatus("Unable to submit vote.");
        } finally {
          setButtonsDisabled(false);
        }
      }
      window.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".poll-button[data-vote]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const vote = btn.getAttribute("data-vote");
            if (vote) await submitVote(vote);
          });
        });
        loadVotes();
      });
    }
  });
  require_vote();
})();
