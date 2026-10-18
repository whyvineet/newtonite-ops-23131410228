import { request } from './client'
import type { User } from '../types/api'

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}


export interface RegisterPayload {
  name: string
  email: string
  password: string
  team_name?: string
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/register', {
    method: 'POST',
    body: payload,
  })
}

export async function getMe(): Promise<User> {
  return request<User>('/auth/me', {
    method: 'GET',
  })
}
