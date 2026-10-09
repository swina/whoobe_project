<template>
  <BaseModal :open="true" size="xl" @close="$emit('close')">
    <template #header>
      <div class="min-w-0">
      Insert an image
    </div>
    </template>
    <div class="space-y-4">
        <div class="flex items-center gap-2 px-4 pt-3 shrink-0">
        <button v-for="t in sources" :key="t.key" :data-testid="`docs-image-src-${t.key}`" @click="source = t.key"
          :class="['px-3 py-1.5 rounded-lg text-xs font-semibold transition', source === t.key ? 'bg-slate-800 light:bg-slate-200 text-slate-100 light:text-slate-900' : 'text-slate-500 hover:text-slate-300 light:hover:text-slate-700']">{{ t.name }}</button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        <div v-if="error" class="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{{ error }}</div>

        <!-- this documentation -->
        <template v-if="source === 'folder'">
          <p class="text-xs text-slate-500">Images already in the documentation folder.</p>
          <div v-if="folderImages.length === 0" class="text-xs text-slate-500 italic py-4 text-center">No image in the folder yet: upload one or take one from the library.</div>
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
            <button v-for="f in folderImages" :key="f.path" :data-testid="`docs-image-pick-${f.path}`" type="button" @click="pickFolder(f.path)"
              :class="['rounded-lg border p-1 text-left', chosen?.kind === 'folder' && chosen.path === f.path ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 light:border-slate-200 hover:border-slate-600']">
              <img :src="fileUrl(f.s3Key)" :alt="f.path" class="w-full h-20 object-contain rounded bg-slate-950/40" loading="lazy" />
              <div class="text-[10px] text-slate-400 truncate mt-1" :title="f.path">{{ f.path }}</div>
            </button>
          </div>
        </template>

        <!-- the asset library -->
        <template v-else-if="source === 'library'">
          <input v-model="libQuery" placeholder="Search the library by name…" class="field w-full" />
          <p class="text-xs text-slate-500">A library image outside the documentation folder is <strong>copied</strong> into <span class="font-mono">{{ imagesFolder }}/</span>, so the document refers to it with a relative path and the published site is self-contained.</p>
          <div v-if="libImages.length === 0" class="text-xs text-slate-500 italic py-4 text-center">No image found.</div>
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
            <button v-for="a in libImages" :key="a.id" type="button" :data-testid="`docs-image-lib-${a.filename}`" @click="pickLibrary(a)"
              :class="['rounded-lg border p-1 text-left', chosen?.kind === 'library' && chosen.asset.id === a.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 light:border-slate-200 hover:border-slate-600']">
              <img :src="a.thumbnailUrl || a.url" :alt="a.filename" class="w-full h-20 object-contain rounded bg-slate-950/40" loading="lazy" />
              <div class="text-[10px] text-slate-400 truncate mt-1" :title="a.pimcorePath">{{ a.filename }}</div>
            </button>
          </div>
        </template>

        <!-- upload -->
        <template v-else-if="source === 'upload'">
          <label class="block text-xs text-slate-400">Image file
            <input data-testid="docs-image-file" type="file" accept="image/*" class="mt-1 block w-full text-xs text-slate-300" @change="onFile" />
          </label>
          <label class="block text-xs text-slate-400">Stored in the folder
            <input v-model="uploadDir" class="field mt-1 w-full font-mono" />
          </label>
          <div v-if="uploadPreview" class="rounded-lg bg-slate-950/40 p-2 inline-block"><img :src="uploadPreview" alt="" class="max-h-40 rounded" /></div>
        </template>

        <!-- address -->
        <template v-else>
          <label class="block text-xs text-slate-400">Image address (https://…)
            <input v-model="urlText" data-testid="docs-image-url" placeholder="https://example.com/picture.png" class="field mt-1 w-full font-mono" @input="chooseUrl" />
          </label>
          <p class="text-xs text-slate-500">The image stays where it is: it is not copied into the folder or into a published site.</p>
          <img v-if="urlValid" :src="urlText" alt="" class="max-h-40 rounded" />
        </template>

        <!-- how it is shown -->
        <div class="grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800 light:border-slate-200">
          <label class="block text-xs text-slate-400 sm:col-span-3">Description (alternative text)
            <input v-model="alt" data-testid="docs-image-alt" class="field mt-1 w-full" />
          </label>
          <label class="block text-xs text-slate-400">Width
            <select v-model="widthChoice" data-testid="docs-image-width" class="field mt-1 w-full">
              <option value="">Original size</option>
              <option v-for="w in widths" :key="w" :value="w">{{ w }}</option>
              <option value="custom">Custom…</option>
            </select>
          </label>
          <label v-if="widthChoice === 'custom'" class="block text-xs text-slate-400">Custom width
            <input v-model="customWidth" data-testid="docs-image-custom-width" placeholder="320px or 40%" class="field mt-1 w-full font-mono" />
          </label>
          <label class="block text-xs text-slate-400">Position
            <select v-model="position" data-testid="docs-image-position" class="field mt-1 w-full">
              <option value="">Inline (as written)</option>
              <option value="align:left">Left, on its own line</option>
              <option value="align:center">Centered</option>
              <option value="align:right">Right, on its own line</option>
              <option value="float:left">Left, text wraps around it</option>
              <option value="float:right">Right, text wraps around it</option>
            </select>
          </label>
        </div>
        <div class="text-xs text-slate-500">Will insert: <span data-testid="docs-image-markdown" class="font-mono text-slate-300 break-all">{{ markdown || '(choose an image)' }}</span></div>
      </div>


    </div>
    <template #footer>
        <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
      <button data-testid="docs-image-insert" class="btn btn-primary" :disabled="!markdown || !!busy" @click="insert">{{ busy || 'Insert' }}</button>

    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
// Insert an image into a document (docs/plans/docs-sites/docs-site-plan.md): from the documentation folder, from the asset library
// (copied into the folder when it is elsewhere), by uploading, or by address - with a width and a position. What is written is
// ordinary Markdown: ![alt](relative/path.png){width=50% align=center}.
import { computed, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { useDamStore, type AssetItem } from '../../stores/damStore'
import { uploadAssetToDam } from '../../utils/dam-api'
import { imageMarkdown, isImagePath, relativeDocPath, cleanRelativePath, type DocsSiteTree } from '../../utils/docs-sites-api'

const props = defineProps<{ tree: DocsSiteTree; docPath: string }>()
const emit = defineEmits<{ close: []; insert: [markdown: string] }>()

const dam = useDamStore()
onMounted(() => { void dam.refreshAssets() })
const sources = [{ key: 'folder', name: 'This documentation' }, { key: 'library', name: 'Asset library' }, { key: 'upload', name: 'Upload' }, { key: 'url', name: 'Address' }] as const
const source = ref<'folder' | 'library' | 'upload' | 'url'>(props.tree.fileAssets.some((f) => isImagePath(f.path)) ? 'folder' : 'library')
const error = ref('')
const busy = ref('')
const alt = ref('')
const widths = ['25%', '33%', '50%', '66%', '75%', '100%']
const widthChoice = ref('')
const customWidth = ref('')
const position = ref('')
const imagesFolder = computed(() => `${props.tree.config.sourceFolder}/images`)

type Chosen = { kind: 'folder'; path: string } | { kind: 'library'; asset: AssetItem } | { kind: 'upload'; file: File } | { kind: 'url'; url: string }
const chosen = ref<Chosen | null>(null)

const fileUrl = (s3Key: string) => `${dam.config.assetProcessorUrl.replace(/\/+$/, '')}/dam-asset/${s3Key.split('/').map(encodeURIComponent).join('/')}`
const stem = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')

const folderImages = computed(() => props.tree.fileAssets.filter((f) => isImagePath(f.path)))
const libQuery = ref('')
const libImages = computed(() => {
  const q = libQuery.value.trim().toLowerCase()
  return dam.assets.filter((a) => a.mimeType.startsWith('image/') && (!q || a.filename.toLowerCase().includes(q) || a.pimcorePath.toLowerCase().includes(q))).slice(0, 60)
})

function pickFolder(path: string) { chosen.value = { kind: 'folder', path }; if (!alt.value) alt.value = stem(path.split('/').pop() as string) }
function pickLibrary(asset: AssetItem) { chosen.value = { kind: 'library', asset }; if (!alt.value) alt.value = stem(asset.filename) }

const uploadDir = ref('images')
const uploadPreview = ref('')
function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) { chosen.value = null; uploadPreview.value = ''; return }
  chosen.value = { kind: 'upload', file: f }
  if (!alt.value) alt.value = stem(f.name)
  uploadPreview.value = URL.createObjectURL(f)
}

const urlText = ref('')
const urlValid = computed(() => /^https?:\/\/[^\s<>"']+$/i.test(urlText.value.trim()))
function chooseUrl() { chosen.value = urlValid.value ? { kind: 'url', url: urlText.value.trim() } : null }

const width = computed(() => (widthChoice.value === 'custom' ? customWidth.value.trim() : widthChoice.value))

/** Where the file will be, relative to the source folder (null for an address). */
function targetPath(): string | null {
  const c = chosen.value
  if (!c || c.kind === 'url') return null
  if (c.kind === 'folder') return c.path
  if (c.kind === 'upload') { const dir = cleanRelativePath(uploadDir.value) ?? 'images'; return `${dir}/${c.file.name}` }
  const prefix = props.tree.config.sourceFolder + '/'
  return c.asset.pimcorePath.startsWith(prefix) ? c.asset.pimcorePath.slice(prefix.length) : `images/${c.asset.filename}`
}

const markdown = computed(() => {
  const c = chosen.value
  if (!c) return ''
  const t = c.kind === 'url' ? c.url : relativeDocPath(props.docPath, targetPath() as string)
  return imageMarkdown({
    alt: alt.value, target: t, width: width.value,
    align: position.value.startsWith('align:') ? (position.value.slice(6) as 'left' | 'center' | 'right') : '',
    float: position.value.startsWith('float:') ? (position.value.slice(6) as 'left' | 'right') : '',
  })
})

async function insert() {
  const c = chosen.value
  if (!c) return
  error.value = ''
  try {
    if (c.kind === 'upload' || (c.kind === 'library' && !c.asset.pimcorePath.startsWith(props.tree.config.sourceFolder + '/'))) {
      const rel = targetPath() as string
      busy.value = 'Storing the image…'
      const blob: Blob = c.kind === 'upload' ? c.file : await downloadAsset(c.asset)
      const name = rel.split('/').pop() as string
      await uploadAssetToDam(dam.config.assetProcessorUrl, blob, name, `${props.tree.config.sourceFolder}/${rel}`, true, dam.config.folderRules)
    }
    emit('insert', markdown.value)
  } catch (e: any) {
    error.value = e?.message || 'Could not store the image'
  } finally {
    busy.value = ''
  }
}

async function downloadAsset(a: AssetItem): Promise<Blob> {
  const url = a.url
  if (!url) throw new Error('This asset has no address to read it from')
  for (const credentials of ['include', 'omit'] as RequestCredentials[]) {
    try { const res = await fetch(url, { credentials }); if (res.ok) return await res.blob() } catch { /* try the other way */ }
  }
  throw new Error(`Could not read ${a.filename} from the library`)
}
</script>
