import { createFileRoute } from '@tanstack/react-router'
import FileExplorer from '../../components/FileExplorer'

export const Route = createFileRoute('/_authenticated/explorer')({
  component: () => {
    const { projectId } = Route.useSearch<{ projectId?: string }>()
    return <FileExplorer projectId={projectId} />
  },
})