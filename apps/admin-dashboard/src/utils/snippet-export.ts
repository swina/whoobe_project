function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve((e.target?.result as string) || '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}

function looksLikeRawPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

async function resolveToUrl(raw: string): Promise<string | null> {
  if (/^data:/i.test(raw)) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  if (looksLikeRawPath(raw)) {
    const { fetchAssetUrls } = await import('./dam-api')
    const { useDamStore } = await import('../stores/damStore')
    const damStore = useDamStore()
    try {
      const { url } = await fetchAssetUrls(damStore.config.assetProcessorUrl, raw, damStore.config.folderRules)
      return url
    } catch {
      return null
    }
  }
  return null
}

async function embedImage(ref: string): Promise<string> {
  const url = await resolveToUrl(ref)
  if (!url || /^data:/i.test(url)) return url || ref
  try {
    const res = await fetch(url)
    if (!res.ok) return ref
    const blob = await res.blob()
    const dataUri = await blobToBase64(blob)
    return dataUri || ref
  } catch {
    return ref
  }
}

export async function embedNodeImages(node: unknown): Promise<unknown> {
  const clone = JSON.parse(JSON.stringify(node))

  async function walk(n: Record<string, any>) {
    if (!n || typeof n !== 'object') return

    const promises: Promise<void>[] = []

    if (n.image?.url && typeof n.image.url === 'string') {
      promises.push(
        embedImage(n.image.url).then((dataUri) => { n.image.url = dataUri })
      )
    }

    if (n.props?.src && typeof n.props.src === 'string') {
      promises.push(
        embedImage(n.props.src).then((dataUri) => { n.props.src = dataUri })
      )
    }

    if (n.style?.backgroundImage && typeof n.style.backgroundImage === 'string') {
      const match = n.style.backgroundImage.match(/^url\((.+)\)$/)
      if (match && match[1]) {
        promises.push(
          embedImage(match[1]).then((dataUri) => {
            n.style.backgroundImage = `url(${dataUri})`
          })
        )
      }
    }

    if (Array.isArray(n.blocks)) {
      for (const child of n.blocks) {
        walk(child)
      }
    }

    if (Array.isArray(n.children)) {
      for (const child of n.children) {
        walk(child)
      }
    }

    await Promise.all(promises)
  }

  await walk(clone as Record<string, any>)
  return clone
}