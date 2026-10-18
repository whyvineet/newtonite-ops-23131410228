import { request } from './client'
import type { User } from '../types/api'

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}


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
