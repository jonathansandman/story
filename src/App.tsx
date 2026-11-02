import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/overlays'
import { ComposerProvider } from '@/features/export/composer-context'
import { CharacterEditor } from '@/features/characters/CharacterEditor'
import { CharacterLibrary } from '@/features/characters/CharacterLibrary'
import { Settings } from '@/features/settings/Settings'
import { CastView } from '@/features/stories/CastView'
import { OutlineView } from '@/features/stories/OutlineView'
import { StoriesHome } from '@/features/stories/StoriesHome'
import { StoryBible } from '@/features/stories/StoryBible'
import { StoryLayout } from '@/features/stories/StoryLayout'

function Root() {
  return (
    <ToastProvider>
      <ComposerProvider>
        <AppShell />
      </ComposerProvider>
    </ToastProvider>
  )
}

const routes = [
  {
    element: <Root />,
    children: [
      { index: true, element: <StoriesHome /> },
      { path: 'characters', element: <CharacterLibrary /> },
      { path: 'characters/:characterId', element: <CharacterEditor /> },
      {
        path: 'stories/:storyId',
        element: <StoryLayout />,
        children: [
          { index: true, element: <OutlineView /> },
          { path: 'bible', element: <StoryBible /> },
          { path: 'cast', element: <CastView /> },
        ],
      },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <StoriesHome /> },
    ],
  },
]

// Match Vite's base so routes work when hosted under a sub-path (GitHub Pages).
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })

export function App() {
  return <RouterProvider router={router} />
}
