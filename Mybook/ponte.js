// Página-ponte: lê os dados que o app antigo guardou NESTE aparelho, cifra aqui mesmo (AES-GCM, chave
// aleatória que vai só no link), envia o pacote cifrado ao endereço novo e redireciona para lá.
// O app novo baixa, decifra e importa. Ninguém precisa fazer backup.
;(function () {
  'use strict'
  const NOVO = window.PINKINK_NOVO_ENDERECO
  const DB_NAME = 'pink-ink-society'
  const DONE_KEY = 'pis.ponte'
  const $ = (id) => document.getElementById(id)
  const show = (id) => {
    for (const s of document.querySelectorAll('[data-step]')) s.hidden = s.dataset.step !== id
  }

  function readAll() {
    return new Promise((resolve) => {
      let created = false
      const req = indexedDB.open(DB_NAME)
      req.onupgradeneeded = () => {
        // o banco não existia: nada para levar (e não deixamos um banco vazio para trás)
        created = true
        req.transaction.abort()
      }
      req.onerror = () => {
        if (created) indexedDB.deleteDatabase(DB_NAME)
        resolve({})
      }
      req.onsuccess = () => {
        const db = req.result
        const names = Array.from(db.objectStoreNames)
        if (!names.length) return db.close(), resolve({})
        const tx = db.transaction(names, 'readonly')
        const out = {}
        for (const n of names) tx.objectStore(n).getAll().onsuccess = (e) => (out[n] = e.target.result)
        tx.oncomplete = () => (db.close(), resolve(out))
        tx.onerror = () => (db.close(), resolve(out))
      }
    })
  }

  const toB64 = (bytes) => {
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }
  const toB64url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  async function pack(tables) {
    let settings = null
    try {
      settings = localStorage.getItem('pis.settings')
    } catch (e) {}
    const json = JSON.stringify({ app: 'pink-ink-society', v: 1, from: location.origin + location.pathname, at: new Date().toISOString(), settings, tables })
    let bytes = new TextEncoder().encode(json)
    let gz = false
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
      bytes = new Uint8Array(await new Response(stream).arrayBuffer())
      gz = true
    }
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes))
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    return { body: JSON.stringify({ ct: toB64(ct), iv: toB64(iv), gz }), key: toB64url(raw), json }
  }

  let lastJson = null
  async function run() {
    show('levando')
    const tables = await readAll()
    const count = (tables.books || []).length
    const hasData = Object.values(tables).some((rows) => Array.isArray(rows) && rows.length)
    if (!hasData) return location.replace(NOVO)
    $('qtd').textContent = count === 1 ? '1 livro' : count + ' livros'
    const p = await pack(tables)
    lastJson = p.json
    const res = await fetch(NOVO + 'api/migracao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: p.body })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const { id } = await res.json()
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify({ id, at: Date.now() }))
    } catch (e) {}
    location.replace(NOVO + '#/migrar/' + id + '.' + p.key)
  }

  function fail(err) {
    console.error(err)
    show('erro')
  }

  $('tentar').onclick = () => run().catch(fail)
  $('baixar').onclick = async () => {
    // plano B: o mesmo formato do "Fazer backup" do app (Ajustes → Restaurar backup no endereço novo)
    const tables = await readAll()
    const data = Object.assign({ app: 'pink-ink-society', version: 2, exportedAt: new Date().toISOString() }, tables)
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'pink-ink-backup.json'
    a.click()
  }
  $('ir').href = NOVO

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {})
  run().catch(fail)
})()
