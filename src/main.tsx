import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { App } from './App'
import { bootstrap } from './db/bootstrap'

// Seed on first run, then render. Data is local, so this is near-instant.
bootstrap()
  .catch((e) => console.error('Trellis bootstrap failed', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
