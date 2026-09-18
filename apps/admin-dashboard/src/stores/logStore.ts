import { ref } from 'vue'
import { defineStore } from 'pinia'
import { listLogFiles, downloadLogFile } from '@whoobe-cms/logger/dam-client'

export interface LogFileEntry {
  filename: string
  path: string
  size: number
  uploadedAt?: string
}

export interface LogEntry {
  level: string
  time: string
  msg: string
  module?: string
  err?: { type?: string; message?: string; stack?: string }
  [key: string]: unknown
}

const APPS = ['core-api', 'asset-processor', 'gateway', 'whoobe-editor', 'admin-dashboard'] as const

export const useLogStore = defineStore('logs', () => {
  const logFiles = ref<LogFileEntry[]>([])
  const selectedApp = ref<string>('core-api')
  const selectedDate = ref<string>('')
  const logContent = ref<LogEntry[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLogFiles(appName: string) {
    isLoading.value = true
    error.value = null
    try {
      logFiles.value = await listLogFiles(appName)
    } catch (e) {
      error.value = 'Failed to fetch log files'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchLogContent(path: string) {
    isLoading.value = true
    error.value = null
    try {
      const raw = await downloadLogFile(path)
      if (!raw) {
        logContent.value = []
        return
      }
      logContent.value = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as LogEntry
          } catch {
            return { level: 'info', time: '', msg: line } as LogEntry
          }
        })
    } catch (e) {
      error.value = 'Failed to fetch log content'
      logContent.value = []
    } finally {
      isLoading.value = false
    }
  }

  function selectApp(app: string) {
    selectedApp.value = app
    logFiles.value = []
    logContent.value = []
    fetchLogFiles(app)
  }

  function selectDate(date: string) {
    selectedDate.value = date
    const file = logFiles.value.find((f) => f.filename.includes(date))
    if (file) {
      fetchLogContent(file.path)
    }
  }

  return {
    logFiles,
    selectedApp,
    selectedDate,
    logContent,
    isLoading,
    error,
    APPS,
    fetchLogFiles,
    fetchLogContent,
    selectApp,
    selectDate,
  }
})