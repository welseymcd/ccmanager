import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Login } from '../components/Login'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  
  const handleLoginSuccess = () => {
    navigate({ to: '/' })
  }

  return <Login onSuccess={handleLoginSuccess} />
}