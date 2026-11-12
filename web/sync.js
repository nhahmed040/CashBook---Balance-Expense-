/* Online backup and shared books (Firebase Realtime Database + Firebase Auth, REST only).
   Part 1 is pure merge logic (unit-tested in Node). Part 2 talks to the network through an
   injected fetch, so it can be tested against a mock server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBSync = factory();
})(this, function () {
  'use strict';

  var FIELDS = ['type', 'amount', 'date', 'category', 'note', 'code', 'party', 'mode', 'by'];

  /* ---------- part 1: merge ---------- */
  function hash(text) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < text.length; i++) {
      ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function sig(e) { return hash(FIELDS.map(function (f) { return String(e[f]); }).join('\u0001')); }

  function pack(e, u) {
    var o = { u: u };
    FIELDS.forEach(function (f) { o[f] = e[f]; });
    return o;
  }

  /* args: { local:[entries], S:{id:sig}, U:{id:u}, remote:{id:obj}|null, role:'owner'|'edit'|'view', now, sanitize(raw)->entry|null }
     returns { entries, S, U, push:{id:obj}, changed } */
  function merge(a) {
    var R = a.remote || {}, S = {}, U = {}, push = {}, changed = false;
    Object.keys(a.S || {}).forEach(function (k) { S[k] = a.S[k]; });
    Object.keys(a.U || {}).forEach(function (k) { U[k] = a.U[k]; });
    var byId = {}, order = [];
    a.local.forEach(function (e) { byId[e.id] = e; order.push(e.id); });
    var canWrite = a.role !== 'view';

    function upsert(key, r) {
      var id = Number(key), old = byId[id];
      var raw = { id: id };
      FIELDS.forEach(function (f) { raw[f] = r[f]; });
      if (old) { raw.photos = old.photos; raw.billId = old.billId; raw.certId = old.certId; raw.contactId = old.contactId; }
      var e = a.sanitize(raw);
      if (!e) return null;
      e.id = id;
      if (!old) order.push(id);
      byId[id] = e;
      return e;
    }
    function drop(key) {
      var id = Number(key);
      if (byId[id]) { delete byId[id]; order = order.filter(function (x) { return x !== id; }); }
    }

    if (!canWrite) {
      // view-only: the online copy is the truth
      var keep = {};
      Object.keys(R).forEach(function (key) {
        var r = R[key];
        if (!r || r.del) return;
        keep[key] = true;
        var old = byId[Number(key)];
        if (!old || sig(old) !== sig(Object.assign({}, old, r)) || U[key] !== r.u) {
          var e = upsert(key, r);
          if (e) { changed = true; S[key] = sig(e); U[key] = r.u; }
        }
      });
      Object.keys(byId).forEach(function (id) {
        if (!keep[id]) { drop(id); delete S[id]; delete U[id]; changed = true; }
      });
      return finish();
    }

    Object.keys(R).forEach(function (key) {
      var r = R[key];
      if (!r || typeof r.u !== 'number') return;
      var le = byId[Number(key)];
      var remoteNew = U[key] === undefined || r.u > U[key];
      var localChanged = le ? (S[key] === undefined || sig(le) !== S[key]) : (S[key] !== undefined && !r.del);
      if (remoteNew && !localChanged) {
        if (r.del) { if (le) { drop(key); changed = true; } delete S[key]; }
        else {
          var e = upsert(key, r);
          if (e) { S[key] = sig(e); if (!le || sig(le) !== S[key]) changed = true; }
        }
        U[key] = r.u;
      } else if (localChanged) {
        var u = Math.max(a.now, r.u + 1);
        if (le) { push[key] = pack(le, u); S[key] = sig(le); }
        else { push[key] = { del: true, u: u }; delete S[key]; }
        U[key] = u;
      }
    });
    Object.keys(byId).forEach(function (id) {
      if (R[id]) return;
      var le = byId[id];
      push[id] = pack(le, a.now);
      S[id] = sig(le); U[id] = a.now;
    });
    return finish();

    function finish() {
      return { entries: order.map(function (id) { return byId[id]; }), S: S, U: U, push: push, changed: changed };
    }
  }

  /* ---------- part 2: network ---------- */
  var DB_RE = /^https:\/\/[a-z0-9-]+(?:-default-rtdb)?(?:\.[a-z0-9-]+)*\.(?:firebaseio\.com|firebasedatabase\.app)$/i;
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function cleanDbUrl(u) {
    u = String(u || '').trim().replace(/^["'<\s]+|["'>\s]+$/g, '');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    u = u.replace(/^http:\/\//i, 'https://');
    var m = /^(https:\/\/[^\/?#\s]+)/i.exec(u);       // keep only the host: drop any path, .json or query
    u = m ? m[1].toLowerCase() : '';
    return DB_RE.test(u) ? u : '';
  }
  function randomString(n, alphabet) {
    var out = '', buf = new Uint8Array(n), i;
    var c = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : null;
    if (c) c.getRandomValues(buf); else for (i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < n; i++) out += alphabet.charAt(buf[i] % alphabet.length);
    return out;
  }
  function newBookId() { return 'sb' + randomString(12, 'abcdefghjkmnpqrstuvwxyz23456789'); }
  function newInviteCode(role) { return (role === 'edit' ? 'E' : 'V') + randomString(7, CODE_ALPHABET.replace(/[EV]/g, '')); }
  function parseShare(text) {
    var m = /^\s*([a-z0-9]{6,20})[.\-\s]+([A-Za-z0-9]{6,12})\s*$/.exec(String(text || ''));
    var code = m ? m[2].toUpperCase() : '';
    return m && (code.charAt(0) === 'E' || code.charAt(0) === 'V') ? { bookId: m[1], code: code, role: code.charAt(0) === 'E' ? 'edit' : 'view' } : null;
  }

  function CloudError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  /* env: { fetch, store:{get(),set(obj)}, now() }  - store keeps {dbUrl, apiKey, email, uid, idToken, refresh, exp} */
  function createCloud(env) {
    var now = env.now || function () { return Date.now(); };
    function cfg() {
      var c = env.store.get() || {}, d = env.defaults || {};
      if (!c.dbUrl && d.dbUrl) c.dbUrl = d.dbUrl;
      if (!c.apiKey && d.apiKey) c.apiKey = d.apiKey;
      return c;
    }
    function patchCfg(p) { var c = cfg(); Object.keys(p).forEach(function (k) { c[k] = p[k]; }); env.store.set(c); return c; }

    function json(res) {
      return res.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
        return { status: res.status, ok: res.ok, body: body };
      });
    }
    function netFail() { return CloudError('network', 'network'); }

    function authCall(endpoint, payload) {
      var c = cfg();
      if (!c.apiKey) return Promise.reject(CloudError('not-configured'));
      return env.fetch('https://identitytoolkit.googleapis.com/v1/accounts:' + endpoint + '?key=' + encodeURIComponent(c.apiKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).then(json, function () { throw netFail(); }).then(function (r) {
        if (!r.ok) {
          var msg = r.body && r.body.error && r.body.error.message ? String(r.body.error.message) : 'auth-failed';
          throw CloudError(/api key not valid|API_KEY_INVALID/i.test(msg) ? 'API_KEY_INVALID' : msg.split(/[\s:]/)[0]);
        }
        return r.body;
      });
    }
    function saveSession(b, email) {
      patchCfg({ email: email || b.email || cfg().email, uid: b.localId, idToken: b.idToken, refresh: b.refreshToken,
                 exp: now() + (Number(b.expiresIn) || 3600) * 1000 - 60000 });
      return cfg();
    }
    function signUp(email, password) {
      return authCall('signUp', { email: email, password: password, returnSecureToken: true }).then(function (b) { return saveSession(b, email); });
    }
    /* Google: the Android app obtains a Google ID token, Firebase turns it into our own session */
    function signInGoogle(idToken) {
      return authCall('signInWithIdp', { postBody: 'id_token=' + encodeURIComponent(idToken) + '&providerId=google.com', requestUri: 'http://localhost',
        returnIdpCredential: true, returnSecureToken: true }).then(function (b) { saveSession(b, b.email); return b; });
    }
    function signIn(email, password) {
      return authCall('signInWithPassword', { email: email, password: password, returnSecureToken: true }).then(function (b) { return saveSession(b, email); });
    }
    function signOut() { patchCfg({ email: '', uid: '', idToken: '', refresh: '', exp: 0 }); }
    function signedIn() { var c = cfg(); return !!(c.uid && c.refresh); }

    function token() {
      var c = cfg();
      if (!c.uid || !c.refresh) return Promise.reject(CloudError('not-signed-in'));
      if (c.idToken && c.exp > now()) return Promise.resolve(c.idToken);
      return env.fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(c.apiKey), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(c.refresh)
      }).then(json, function () { throw netFail(); }).then(function (r) {
        if (!r.ok) { signOut(); throw CloudError('not-signed-in'); }
        patchCfg({ idToken: r.body.id_token, refresh: r.body.refresh_token || c.refresh, exp: now() + (Number(r.body.expires_in) || 3600) * 1000 - 60000 });
        return cfg().idToken;
      });
    }

    function db(method, path, body) {
      var base = cleanDbUrl(cfg().dbUrl);
      if (!base) return Promise.reject(CloudError('not-configured'));
      return token().then(function (tk) {
        var opts = { method: method, headers: {} };
        if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
        return env.fetch(base + '/' + path + '.json?auth=' + encodeURIComponent(tk), opts);
      }).then(json, function (e) { throw e && e.code ? e : netFail(); }).then(function (r) {
        if (r.status === 401 || r.status === 403) throw CloudError('permission');
        if (!r.ok) throw CloudError('server-' + r.status);
        return r.body;
      });
    }

    /* online backup of one user's whole state */
    function backupPut(text) {
      return db('PUT', 'backups/' + cfg().uid, { u: now(), data: text });
    }
    function backupGet() { return db('GET', 'backups/' + cfg().uid); }

    /* shared books */
    function createBook(id, name) {
      var me = cfg(), pr = me.profile || {};
      return db('PUT', 'books/' + id + '/meta', { owner: me.uid, ownerEmail: me.email || '', ownerName: pr.name || '', name: name, created: now() });
    }
    function setBookName(id, name) { return db('PUT', 'books/' + id + '/meta/name', name); }

    /* my profile and my list of books (so a new phone finds them) */
    function profilePut(p) {
      var clean = { name: String(p.name || '').slice(0, 60), phone: String(p.phone || '').slice(0, 30), company: String(p.company || '').slice(0, 60), role: String(p.role || '').slice(0, 40) };
      return db('PUT', 'users/' + cfg().uid + '/profile', clean).then(function () { patchCfg({ profile: clean }); return clean; });
    }
    function profileGet() {
      return db('GET', 'users/' + cfg().uid + '/profile').then(function (p) { if (p) patchCfg({ profile: p }); return p; });
    }
    function indexPut(id, name, role) { return db('PUT', 'users/' + cfg().uid + '/books/' + id, { name: String(name).slice(0, 40), role: role }); }
    function indexGet() { return db('GET', 'users/' + cfg().uid + '/books'); }
    function indexDelete(id) { return db('DELETE', 'users/' + cfg().uid + '/books/' + id); }
    function getBook(id) { return db('GET', 'books/' + id); }
    function pushEntries(id, map) {
      var upd = {};
      Object.keys(map).forEach(function (k) { upd['entries/' + k] = map[k]; });
      if (!Object.keys(upd).length) return Promise.resolve(null);
      return db('PATCH', 'books/' + id, upd);
    }
    function createInvite(id, role) {
      var code = newInviteCode(role);
      return db('PUT', 'invites/' + id + '/' + code, role === 'edit' ? 'edit' : 'view').then(function () { return code; });
    }
    function revokeInvites(id) { return db('DELETE', 'invites/' + id); }
    function join(id, code, role) {
      var me = cfg();
      // the invite is validated by the database rules
      return db('PUT', 'books/' + id + '/members/' + me.uid, { role: role, code: code, email: me.email || '', name: (me.profile && me.profile.name) || '' });
    }
    function setRole(id, uid, role) { return db('PUT', 'books/' + id + '/members/' + uid + '/role', role === 'edit' ? 'edit' : 'view'); }
    function removeMember(id, uid) { return db('DELETE', 'books/' + id + '/members/' + uid); }
    function deleteBook(id) { return db('DELETE', 'invites/' + id).then(function () { return db('DELETE', 'books/' + id); }); }   // invites first: their rule needs the book's owner

    return {
      cfg: cfg, patchCfg: patchCfg, signUp: signUp, signIn: signIn, signInGoogle: signInGoogle, signOut: signOut, signedIn: signedIn,
      backupPut: backupPut, backupGet: backupGet,
      createBook: createBook, setBookName: setBookName, profilePut: profilePut, profileGet: profileGet,
      indexPut: indexPut, indexGet: indexGet, indexDelete: indexDelete, getBook: getBook, pushEntries: pushEntries,
      createInvite: createInvite, revokeInvites: revokeInvites, join: join,
      setRole: setRole, removeMember: removeMember, deleteBook: deleteBook
    };
  }

  /* The database rules to paste into the Firebase console (also in README). */
  var RULES = {
    rules: {
      users: { '$uid': { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid' } },
      backups: { '$uid': { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid' } },
      invites: { '$b': {
        '.read': "auth != null && root.child('books/'+$b+'/meta/owner').val() === auth.uid",
        '.write': "auth != null && root.child('books/'+$b+'/meta/owner').val() === auth.uid"
      } },
      books: { '$b': {
        '.read': "auth != null && (data.child('meta/owner').val() === auth.uid || data.child('members/'+auth.uid+'/role').exists())",
        '.write': "auth != null && data.child('meta/owner').val() === auth.uid",
        meta: {
          '.write': "auth != null && ((!data.exists() && newData.child('owner').val() === auth.uid) || data.child('owner').val() === auth.uid)",
          '.validate': "!data.exists() || newData.child('owner').val() === data.child('owner').val()"
        },
        members: { '$u': {
          '.write': "auth != null && (root.child('books/'+$b+'/meta/owner').val() === auth.uid || ($u === auth.uid && !newData.exists()) || ($u === auth.uid && !data.exists() && root.child('invites/'+$b+'/'+newData.child('code').val()).val() === newData.child('role').val()))",
          '.validate': "newData.hasChildren(['role']) && (newData.child('role').val() === 'edit' || newData.child('role').val() === 'view')"
        } },
        entries: { '$e': {
          '.write': "auth != null && (root.child('books/'+$b+'/meta/owner').val() === auth.uid || root.child('books/'+$b+'/members/'+auth.uid+'/role').val() === 'edit')"
        } }
      } }
    }
  };

  return {
    sig: sig, pack: pack, merge: merge, FIELDS: FIELDS, RULES: RULES,
    createCloud: createCloud, cleanDbUrl: cleanDbUrl, newBookId: newBookId, newInviteCode: newInviteCode, parseShare: parseShare
  };
});
