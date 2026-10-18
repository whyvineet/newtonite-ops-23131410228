import { request } from './client'
import type { User } from '../types/api'

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface DemoAccount {
  name: string
  email: string
  roleDescription: string
}

export const DEMO_PASSWORD = 'demo-password-123'

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    name: 'Alice Lead',
    email: 'alice.lead@demo.test',
    roleDescription: 'Platform Ops (Lead)',
  },
  {
    name: 'Bob Member',
    email: 'bob.member@demo.test',
    roleDescription: 'Platform Ops (Member)',
  },
  {
    name: 'Carol Admin',
    email: 'carol.admin@demo.test',
    roleDescription: 'Platform Ops (Admin)',
  },
  {
    name: 'Dave Viewer',
    email: 'dave.viewer@demo.test',
    roleDescription: 'Platform Ops (Viewer)',
  },
  {
    name: 'Erin Lead',
    email: 'erin.lead@demo.test',
    roleDescription: 'Customer Support (Lead), Platform Ops (Member)',
  },
  {
    name: 'Frank Member',
    email: 'frank.member@demo.test',
    roleDescription: 'Customer Support (Member)',
  },
  {
    name: 'Grace Admin',
    email: 'grace.admin@demo.test',
    roleDescription: 'Customer Support (Admin)',
  },
]

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export async function getMe(): Promise<User> {
  return request<User>('/auth/me', {
    method: 'GET',
  })
}
