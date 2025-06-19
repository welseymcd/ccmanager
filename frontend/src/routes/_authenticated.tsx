import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getWebSocketClient } from '../services/websocket'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const token = localStorage.getItem('auth_token')
    
    if (!token) {
      throw redirect({
        to: '/login',
      })
    }

    try {
      const response = await fetch('/api/auth/validate', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        localStorage.removeItem('auth_token')
        throw redirect({
          to: '/login',
        })
      }
    } catch (error) {
      localStorage.removeItem('auth_token')
      throw redirect({
        to: '/login',
      })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      const wsClient = getWebSocketClient()
      wsClient.connect(token)
    }
  }, [])

  return <Outlet />
}