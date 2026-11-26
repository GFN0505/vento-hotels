import { describe, expect, it } from 'vitest'
import { ratesStep } from './rates-step'

const row = (propertyId: string, rooms: number, ratesSet: boolean) => ({
  propertyId,
  rooms,
  ratesSet,
})

describe('the "Set rates" step', () => {
  it('is done once every hotel with rooms has its rates set', () => {
    expect(ratesStep([row('vi', 120, true), row('abj', 0, false)], 'vi').done).toBe(true)
    expect(ratesStep([row('vi', 120, true), row('ikj', 80, false)], 'vi').done).toBe(false)
    expect(ratesStep([row('vi', 0, false)], 'vi').done).toBe(false)
  })

  it('opens the hotel in view when it needs rates, else the first that does', () => {
    const hotels = [row('vi', 120, false), row('ikj', 80, false)]
    expect(ratesStep(hotels, 'ikj').hotel).toBe('ikj')
    expect(ratesStep([row('vi', 120, true), row('ikj', 80, false)], 'vi').hotel).toBe('ikj')
  })
})
