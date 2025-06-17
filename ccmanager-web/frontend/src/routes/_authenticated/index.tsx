import { createFileRoute } from '@tanstack/react-router'
import ProjectDashboard from '../../components/ProjectDashboard'

export const Route = createFileRoute('/_authenticated/')({
  component: ProjectDashboard,
})