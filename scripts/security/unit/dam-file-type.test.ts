import { describe, expect, it } from 'vitest'
import { getFileTypeFromFilename } from '../../../packages/core/src/dam/file-type'

describe('DAM file types', () => {
  it('knows the audio files the upload check accepts', () => {
    expect(getFileTypeFromFilename('Song.MP3')).toEqual({ fileType: 'MP3', mimeType: 'audio/mpeg' })
    expect(getFileTypeFromFilename('a.wav')).toEqual({ fileType: 'WAV', mimeType: 'audio/wav' })
    expect(getFileTypeFromFilename('a.m4a')).toEqual({ fileType: 'M4A', mimeType: 'audio/mp4' })
  })
  it('keeps the others', () => {
    expect(getFileTypeFromFilename('x.pdf').mimeType).toBe('application/pdf')
    expect(getFileTypeFromFilename('x.unknown').mimeType).toBe('application/octet-stream')
  })
})
