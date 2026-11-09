/* Photo storage. Photos are kept outside localStorage (too small for images):
   - in the Android app: as private files, through window.AndroidBridge
   - in a browser: in IndexedDB (falls back to memory if that is unavailable)
   Every photo is a JPEG data URL, scaled down to keep backups and storage small. */
window.CBPhotos = (function () {
  'use strict';

  var MAX_SIDE = 1280, QUALITY = 0.7;
  var mem = {};
  var dbPromise = null;

  function bridge() {
    var b = window.AndroidBridge;
    return b && typeof b.photoPut === 'function' ? b : null;
  }

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      try {
        var r = indexedDB.open('cashbook-photos', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('p'); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      } catch (e) { reject(e); }
    });
    return dbPromise;
  }

  /* Runs fn(store) in a transaction and resolves with the request's result. */
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction('p', mode);
        var req = fn(t.objectStore('p'));
        t.oncomplete = function () { resolve(req && req.result !== undefined ? req.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('aborted')); };
      });
    });
  }

  function put(id, dataUrl) {
    id = String(id);
    var b = bridge();
    if (b) {
      return new Promise(function (resolve, reject) {
        if (b.photoPut(id, dataUrl)) resolve(); else reject(new Error('save failed'));
      });
    }
    return tx('readwrite', function (s) { return s.put(dataUrl, id); }).catch(function () { mem[id] = dataUrl; });
  }

  function get(id) {
    id = String(id);
    var b = bridge();
    if (b) return Promise.resolve(b.photoGet(id) || '');
    if (mem[id]) return Promise.resolve(mem[id]);
    return tx('readonly', function (s) { return s.get(id); }).then(function (v) { return v || ''; }).catch(function () { return ''; });
  }

  function del(id) {
    id = String(id);
    var b = bridge();
    delete mem[id];
    if (b) { try { b.photoDelete(id); } catch (e) { /* ignore */ } return Promise.resolve(); }
    return tx('readwrite', function (s) { return s['delete'](id); }).catch(function () { /* ignore */ });
  }

  /* Reads an image file and returns a scaled JPEG data URL. */
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read failed')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('not an image')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { reject(new Error('empty image')); return; }
          var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; // JPEG has no transparency
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', QUALITY));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  return { put: put, get: get, del: del, fileToDataUrl: fileToDataUrl };
})();
