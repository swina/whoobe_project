import { describe, it, expect } from 'vitest'
import { normalizeKind, resolveTag } from './kind.js'
import type { WhoobeElementNode } from '@whoobe-cms/schema'

function node(partial: Partial<WhoobeElementNode>): WhoobeElementNode {
  return { id: 'x', type: 'element', tag: 'element', ...partial }
}

describe('normalizeKind', () => {
  it('headings from element h + level', () => {
    expect(normalizeKind(node({ element: 'h', level: 2 }))).toBe('heading')
  })
  it('paragraphs, images, text', () => {
    expect(normalizeKind(node({ element: 'p' }))).toBe('paragraph')
    expect(normalizeKind(node({ element: 'img' }))).toBe('image')
    expect(normalizeKind(node({ element: 'span' }))).toBe('span')
  })
  it('form fields and controls', () => {
    expect(normalizeKind(node({ element: 'input', tag: 'input' }))).toBe('input')
    expect(normalizeKind(node({ element: 'textarea' }))).toBe('textarea')
    expect(normalizeKind(node({ element: 'select', tag: 'select' }))).toBe('select')
    expect(normalizeKind(node({ element: 'button', tag: 'submit' }))).toBe('submit')
    expect(normalizeKind(node({ element: 'button', tag: 'reset' }))).toBe('reset')
    expect(normalizeKind(node({ element: 'div', tag: 'radiogroup' }))).toBe('radiogroup')
    expect(normalizeKind(node({ element: 'form', tag: 'form' }))).toBe('form')
  })
  it('specials via tag', () => {
    expect(normalizeKind(node({ element: 'div', tag: 'slider' }))).toBe('slider')
    expect(normalizeKind(node({ element: 'iframe', tag: 'youtube' }))).toBe('youtube')
    expect(normalizeKind(node({ element: 'iframe', tag: 'vimeo' }))).toBe('vimeo')
    expect(normalizeKind(node({ element: 'span', tag: 'lucideicon' }))).toBe('icon')
    expect(normalizeKind(node({ element: 'search', tag: 'search' }))).toBe('search')
  })
  it('containers fall back to container', () => {
    expect(normalizeKind(node({ type: 'container', element: 'div', tag: 'grid' }))).toBe('container')
    expect(normalizeKind(node({ type: 'container', element: 'div', tag: 'flex' }))).toBe('container')
  })
})

describe('resolveTag', () => {
  it('resolves heading levels', () => {
    expect(resolveTag(node({ element: 'h', level: 3 }))).toBe('h3')
    expect(resolveTag(node({ element: 'h', level: 99 }))).toBe('h1')
  })
  it('honors semantic tags on containers', () => {
    expect(resolveTag(node({ type: 'container', element: 'div', semantic: 'section' }))).toBe('section')
    expect(resolveTag(node({ type: 'container', element: 'div', semantic: 'nav' }))).toBe('nav')
    expect(resolveTag(node({ type: 'container', element: 'div' }))).toBe('div')
  })
  it('falls back to element then tag', () => {
    expect(resolveTag(node({ element: 'p' }))).toBe('p')
    expect(resolveTag(node({ tag: 'slider', element: 'div' }))).toBe('div')
    // A node with neither element nor a meaningful tag keeps its default tag.
    expect(resolveTag(node({}))).toBe('element')
  })
})
