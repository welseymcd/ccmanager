import { createFileRoute } from '@tanstack/react-router'
import ProjectPage from '../../components/ProjectPage'

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  component: ProjectPage,
})