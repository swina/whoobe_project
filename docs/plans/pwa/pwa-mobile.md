# PWA MOBILE

## Il Mobile Layout Mode

Aggiungi un toggle nell'editor visual builder chiamato "App Mode". 

Quando è attivo:
    - Il canvas si restringe ai breakpoint mobile standard (iOS/Android).
    - Il builder abilita componenti specifici per mobile (Bottom Navigation, Splash Screen settings, Push Notification triggers).
    - L'output JSON conterrà un flag isMobileApp: true e le configurazioni per il manifest.json della PWA (colori di sfondo, icone, orientamento).
    
## Lato SDK 

Un template PWA pre-configurato

- Crea un nuovo pacchetto nell'SDK, ad esempio @whoobe-cms/pwa-template (basato su Nuxt, Next.js, o semplicemente Vite + Vue/React purissimo per la massima leggerezza).
- Il template ha già Workbox configurato per gestire i Service Worker, la sincronizzazione offline dei Data Objects e il caching delle immagini del DAM.
- Utilizza una route dinamica /public/apps/:appId/* che legge l'albero JSON di Whoobe e lo renderizza come un'applicazione mobile fluida a 60fps.

