// Service worker da página-ponte (endereço antigo). Substitui o do app antigo assim que o celular o abre:
// apaga os arquivos antigos guardados (os LIVROS ficam no IndexedDB, que não é apagado) e recarrega as
// janelas abertas, para a ponte assumir e levar os dados ao endereço novo.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k)
      await self.clients.claim()
      const wins = await self.clients.matchAll({ type: 'window' })
      for (const w of wins) w.navigate(w.url).catch(() => {})
    })(),
  )
})
// sem cache: tudo vem da rede
self.addEventListener('fetch', () => {})
