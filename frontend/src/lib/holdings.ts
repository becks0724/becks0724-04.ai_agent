// portfolio_holdings 테이블 타입 + RLS 보호된 CRUD 헬퍼.
import { supabase } from './supabase'

export type Holding = {
  id: string
  user_id: string
  symbol: string
  quantity: number
  avg_buy_price: number
  created_at: string
  updated_at: string
}

export type NewHolding = {
  symbol: string
  quantity: number
  avg_buy_price: number
}

export type HoldingUpdate = {
  quantity: number
  avg_buy_price: number
}

const TABLE = 'portfolio_holdings'

export async function listHoldings(): Promise<Holding[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Holding[]
}

export async function createHolding(input: NewHolding, userId: string): Promise<Holding> {
  // user_id는 RLS와 별개로 명시 주입 — auth.uid()와 일치하지 않으면 정책이 차단한다.
  const payload = {
    user_id: userId,
    symbol: input.symbol,
    quantity: input.quantity,
    avg_buy_price: input.avg_buy_price,
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as Holding
}

export async function updateHolding(id: string, patch: HoldingUpdate): Promise<Holding> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Holding
}

export async function deleteHolding(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
