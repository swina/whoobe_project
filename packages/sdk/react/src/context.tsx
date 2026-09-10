"use client"
// React context: WhoobeProvider + useWhoobe hook.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { WhoobeAdapterOptions, WhoobeApi, WhoobeContextValue, Registry } from './types.js'

const Ctx = createContext<WhoobeContextValue | null>(null)

export interface WhoobeProviderProps {
  registry?: Registry
  api: WhoobeApi
  assetBaseUrl?: string
  keyPrefix?: string
  resolveTargetPage?: WhoobeAdapterOptions['resolveTargetPage']
  children: ReactNode
}

export function WhoobeProvider({ registry = {}, api, assetBaseUrl, keyPrefix, resolveTargetPage, children }: WhoobeProviderProps) {
  const value = useMemo<WhoobeContextValue>(
    () => ({ registry, api, options: { assetBaseUrl, keyPrefix, resolveTargetPage } }),
    [registry, api, assetBaseUrl, keyPrefix, resolveTargetPage],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWhoobe(): WhoobeContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('[whoobe] useWhoobe() requires a <WhoobeProvider> ancestor')
  return ctx
}
