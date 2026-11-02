import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/overlays'
import { ComposerProvider } from '@/features/export/composer-context'
import { AiProvider } from '@/features/ai/ai-context'
import { CharacterEditor } from '@/features/characters/CharacterEditor'
import { CharacterLibrary } from '@/features/characters/CharacterLibrary'
import { Settings } from '@/features/settings/Settings'
import { StoriesHome } from '@/features/stories/StoriesHome'
import { StoryShell } from '@/features/story/StoryShell'
import { OutlineTab } from '@/features/story/OutlineTab'
import { WriteTab } from '@/features/story/WriteTab'
import { ReadTab } from '@/features/story/ReadTab'
import { IdeasTab } from '@/features/story/IdeasTab'
import { StoryTab } from '@/features/story/StoryTab'
import { Navigate } from 'react-router'
import { StoryBuilder } from '@/features/builder/StoryBuilder'

function Root() {
  return (
    <ToastProvider>
      <ComposerProvider>
        <AiProvider>
          <AppShell />
        </AiProvider>
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
        element: <StoryShell />,
        children: [
          { index: true, element: <OutlineTab /> },
          { path: 'write', element: <WriteTab /> },
          { path: 'read', element: <ReadTab /> },
          { path: 'ideas', element: <IdeasTab /> },
          { path: 'story', element: <StoryTab /> },
          // Old links.
          { path: 'bible', element: <Navigate to="../story" replace /> },
          { path: 'cast', element: <Navigate to="../story" replace /> },
        ],
      },
      { path: 'new', element: <StoryBuilder /> },
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
