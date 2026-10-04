// Backdrops — a picture behind your Hermes Desktop chat, without changing your
// theme. Plain, a daily pick from the gallery, any gallery drop, or your own
// photo. Fresh drops arrive as data (backdrops.json), never as code.
//
// It paints with one stylesheet aimed at the documented `[data-chat-surface]`
// hook: the chat surface wears the image, and the surface token goes
// transparent inside it the same way glass mode does, so every theme and both
// light/dark modes keep working underneath.
import { cn, haptic, host, icons, atom, Popover, PopoverContent, PopoverTrigger, STATUSBAR_AREAS, useValue } from '@hermes/plugin-sdk'
import { useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

// New drops land here without a plugin update; relative paths resolve against it.
const MANIFEST_URL = 'https://raw.githubusercontent.com/DECRUX9812/hermes-backdrops/main/backdrops.json'

// The manifest at release time — first paint and the floor when it can't be reached.
const BUNDLED = [
  { id: 'nebula-drift', title: 'Nebula Drift', url: 'backgrounds/nebula-drift.jpg', thumb: 'backgrounds/thumbs/nebula-drift.jpg', added: '2026-10-03' },
  { id: 'aurora-summit', title: 'Aurora Summit', url: 'backgrounds/aurora-summit.jpg', thumb: 'backgrounds/thumbs/aurora-summit.jpg', added: '2026-10-03' },
  { id: 'abyssal-garden', title: 'Abyssal Garden', url: 'backgrounds/abyssal-garden.jpg', thumb: 'backgrounds/thumbs/abyssal-garden.jpg', added: '2026-10-03' },
  { id: 'ember-dunes', title: 'Ember Dunes', url: 'backgrounds/ember-dunes.jpg', thumb: 'backgrounds/thumbs/ember-dunes.jpg', added: '2026-10-03' },
  { id: 'rainline-city', title: 'Rainline City', url: 'backgrounds/rainline-city.jpg', thumb: 'backgrounds/thumbs/rainline-city.jpg', added: '2026-10-03' },
  { id: 'ink-tide', title: 'Ink Tide', url: 'backgrounds/ink-tide.jpg', thumb: 'backgrounds/thumbs/ink-tide.jpg', added: '2026-10-03' },
  { id: 'glowcap-forest', title: 'Glowcap Forest', url: 'backgrounds/glowcap-forest.jpg', thumb: 'backgrounds/thumbs/glowcap-forest.jpg', added: '2026-10-03' },
  { id: 'topo-waves', title: 'Topo Waves', url: 'backgrounds/topo-waves.jpg', thumb: 'backgrounds/thumbs/topo-waves.jpg', added: '2026-10-03' }
]

const NEW_DAYS = 30
const MAX_EDGE = 1920
const FETCH_MS = 6000
const REFRESH_MS = 6 * 60 * 60 * 1000
const DAY_MS = 86_400_000
const VEIL = { soft: 72, vivid: 38, darker: 88 } // % of the chat surface colour laid over the picture

const $drops = atom([])
const $origin = atom('loading') // 'live' | 'cached' | 'bundled' | 'loading'
const $choice = atom('plain') // 'plain' | 'daily' | 'own' | 'drop:<id>'
const $own = atom(null)
const $veil = atom('soft')
const $today = atom(Math.floor(Date.now() / DAY_MS))

const isHttp = url => /^https?:\/\//i.test(url)

const resolveAgainst = (base, path) => {
  try {
    return new URL(path, base).href
  } catch {
    return null
  }
}

/** Remote JSON is untrusted: shape-check every drop, keep only http(s) images. */
const readDrop = (base, value) => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const { id, title, url, thumb, added } = value

  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || typeof title !== 'string' || !title.trim()) {
    return null
  }

  const image = typeof url === 'string' ? resolveAgainst(base, url) : null

  if (!image || !isHttp(image)) {
    return null
  }

  const preview = typeof thumb === 'string' ? resolveAgainst(base, thumb) : null
  const stamp = typeof added === 'string' && !Number.isNaN(Date.parse(added)) ? added : null

  return { id, title: title.trim().slice(0, 60), url: image, thumb: preview && isHttp(preview) ? preview : image, added: stamp }
}

const byNewest = (a, b) => (b.added ?? '').localeCompare(a.added ?? '') || a.title.localeCompare(b.title)

const normalize = (base, drops) =>
  (Array.isArray(drops) ? drops : [])
    .map(value => readDrop(base, value))
    .filter(Boolean)
    .slice(0, 60)
    .sort(byNewest)

const isNew = drop => Boolean(drop.added) && Date.now() - Date.parse(drop.added) < NEW_DAYS * DAY_MS

/** Stable per day, rotates through the whole gallery. */
const dailyDrop = (drops, day) => {
  if (drops.length === 0) {
    return null
  }

  const ordered = [...drops].sort((a, b) => a.id.localeCompare(b.id))

  return ordered[day % ordered.length]
}

const imageFor = (choice, drops, own, day) => {
  if (choice === 'own') {
    return own
  }

  if (choice === 'daily') {
    return dailyDrop(drops, day)?.url ?? null
  }

  if (choice.startsWith('drop:')) {
    return drops.find(drop => drop.id === choice.slice(5))?.url ?? null
  }

  return null
}

const cssUrl = url => `url("${url.replace(/["\\\n\r]/g, ch => encodeURIComponent(ch))}")`

const stylesheet = (url, veil) => {
  const tint = `color-mix(in srgb, var(--ui-bg-chrome) ${VEIL[veil] ?? VEIL.soft}%, transparent)`

  return `
[data-chat-surface] {
  --ui-chat-surface-background: transparent;
  background-color: var(--ui-bg-chrome);
  background-image: linear-gradient(${tint}, ${tint}), ${cssUrl(url)};
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
[data-chat-surface] [data-glass-opaque],
[data-chat-surface] [data-glass-raised] {
  --ui-chat-surface-background: var(--ui-bg-chrome);
}
`
}

/** The one place the picture is painted. Mounted with the status-bar item. */
function BackdropStyle() {
  const choice = useValue($choice)
  const drops = useValue($drops)
  const own = useValue($own)
  const veil = useValue($veil)
  const day = useValue($today)
  const url = imageFor(choice, drops, own, day)

  return url ? jsx('style', { 'data-backdrops': '', children: stylesheet(url, veil) }) : null
}

const downscaled = async file => {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return canvas.toDataURL('image/jpeg', 0.84)
}

const thumbBox = 'relative grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-(--ui-text-tertiary)'

function Row({ active, onClick, thumb, title, subtitle, trailing, label }) {
  return jsxs('div', {
    className: cn(
      'flex items-center gap-3 rounded-xl p-2 transition-colors',
      active ? 'bg-(--ui-control-active-background,var(--chrome-action-hover))' : 'hover:bg-(--chrome-action-hover)'
    ),
    children: [
      jsxs('button', {
        type: 'button',
        'aria-label': label,
        'aria-pressed': active,
        className: 'flex min-w-0 flex-1 items-center gap-3 text-left',
        onClick,
        children: [
          jsx('div', { className: thumbBox, children: thumb }),
          jsxs('div', {
            className: 'min-w-0',
            children: [
              jsx('div', { className: cn('truncate text-sm font-medium', active && 'text-primary'), children: title }),
              subtitle ? jsx('div', { className: 'truncate text-xs text-(--ui-text-tertiary)', children: subtitle }) : null
            ]
          })
        ]
      }),
      trailing ?? null
    ]
  })
}

const img = src => jsx('img', { alt: '', className: 'absolute inset-0 size-full object-cover', decoding: 'async', src })

function Picker({ ctx }) {
  const choice = useValue($choice)
  const drops = useValue($drops)
  const own = useValue($own)
  const veil = useValue($veil)
  const origin = useValue($origin)
  const day = useValue($today)
  const input = useRef(null)
  const today = dailyDrop(drops, day)

  const choose = next => {
    haptic('tap')
    $choice.set(next)
    ctx.storage.set('choice', next)
  }

  const upload = async file => {
    if (!file) {
      return
    }

    try {
      const dataUrl = await downscaled(file)
      $own.set(dataUrl)
      ctx.storage.set('own', dataUrl)
      choose('own')
    } catch (error) {
      host.notifyError(error, 'Could not read that image.')
    }
  }

  const iconButton = (label, icon, onClick) =>
    jsx('button', {
      type: 'button',
      'aria-label': label,
      title: label,
      className: 'grid size-8 shrink-0 place-items-center rounded-lg text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
      onClick,
      children: jsx(icon, { className: 'size-4' })
    })

  return jsxs('div', {
    className: 'flex w-80 flex-col gap-1 p-2',
    children: [
      jsx(Row, { active: choice === 'plain', label: 'Plain', onClick: () => choose('plain'), thumb: null, title: 'Plain' }),
      jsx(Row, {
        active: choice === 'daily',
        label: 'Daily inspiration',
        onClick: () => choose('daily'),
        thumb: today ? img(today.thumb) : null,
        title: 'Daily inspiration',
        subtitle: today?.title
      }),
      jsx(Row, {
        active: choice === 'own',
        label: own ? 'Your own image' : 'Upload an image',
        onClick: () => (own ? choose('own') : input.current?.click()),
        thumb: own ? img(own) : jsx(icons.Plus, { className: 'size-4' }),
        title: 'Your own',
        subtitle: own ? 'Your image' : 'Upload an image',
        trailing: jsxs('div', {
          className: 'flex items-center',
          children: [
            iconButton(own ? 'Replace image' : 'Upload an image', icons.Upload, () => input.current?.click()),
            own
              ? iconButton('Remove your image', icons.X, () => {
                  haptic('tap')
                  $own.set(null)
                  ctx.storage.remove('own')
                  if ($choice.get() === 'own') {
                    choose('plain')
                  }
                })
              : null
          ]
        })
      }),
      jsx('input', {
        accept: 'image/*',
        className: 'hidden',
        onChange: event => {
          void upload(event.target.files?.[0])
          event.target.value = ''
        },
        ref: input,
        type: 'file'
      }),
      jsx('div', { className: 'mx-2 my-1 h-px bg-(--ui-stroke-tertiary)' }),
      jsxs('div', {
        className: 'flex items-center justify-between px-2 pb-1 text-xs text-(--ui-text-tertiary)',
        children: [
          jsx('span', {
            children:
              origin === 'live' ? `Gallery · ${drops.length}` : origin === 'loading' ? 'Gallery · refreshing…' : `Gallery · ${drops.length} · offline`
          }),
          iconButton('Refresh gallery', icons.RefreshCw, () => {
            haptic('tap')
            void refresh(ctx)
          })
        ]
      }),
      jsx('div', {
        className: 'grid grid-cols-4 gap-1.5 px-2',
        children: drops.map(drop =>
          jsxs(
            'button',
            {
              type: 'button',
              'aria-label': drop.title,
              'aria-pressed': choice === `drop:${drop.id}`,
              title: drop.title,
              className: cn(
                'relative aspect-[4/3] overflow-hidden rounded-md border transition',
                choice === `drop:${drop.id}` ? 'border-primary ring-2 ring-primary/30' : 'border-(--ui-stroke-tertiary) hover:opacity-90'
              ),
              onClick: () => choose(`drop:${drop.id}`),
              children: [
                img(drop.thumb),
                isNew(drop)
                  ? jsx('span', {
                      className: 'absolute left-1 top-1 rounded bg-black/55 px-1 text-[0.5rem] font-semibold uppercase tracking-wide text-white',
                      children: 'New'
                    })
                  : null
              ]
            },
            drop.id
          )
        )
      }),
      jsxs('div', {
        className: 'mt-2 flex items-center justify-between px-2 pb-1',
        children: [
          jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Picture strength' }),
          jsx('div', {
            className: 'flex rounded-lg bg-(--ui-bg-quinary) p-0.5 text-xs',
            children: ['soft', 'vivid', 'darker'].map(level =>
              jsx(
                'button',
                {
                  type: 'button',
                  'aria-pressed': veil === level,
                  className: cn(
                    'rounded-md px-2.5 py-1 capitalize',
                    veil === level ? 'bg-(--ui-bg-elevated) text-foreground shadow-sm' : 'text-(--ui-text-tertiary)'
                  ),
                  onClick: () => {
                    haptic('tap')
                    $veil.set(level)
                    ctx.storage.set('veil', level)
                  },
                  children: level
                },
                level
              )
            )
          })
        ]
      })
    ]
  })
}

function Trigger({ ctx }) {
  const choice = useValue($choice)

  return jsxs(Popover, {
    children: [
      jsx(PopoverTrigger, {
        asChild: true,
        children: jsx('button', {
          type: 'button',
          title: 'Chat backdrop',
          'aria-label': 'Chat backdrop',
          className: cn(
            'inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem] hover:bg-(--chrome-action-hover) hover:text-foreground',
            choice === 'plain' ? 'text-(--ui-text-tertiary)' : 'text-foreground'
          ),
          children: jsx(icons.ImageIcon, { className: 'size-3.5' })
        })
      }),
      jsx(BackdropStyle, {}),
      jsx(PopoverContent, { align: 'end', side: 'top', className: 'w-auto p-0', children: jsx(Picker, { ctx }) })
    ]
  })
}

/** Fold the remote manifest over the bundled list. Never throws: a failed reach
 *  keeps the last good gallery, then the bundled one. */
const refresh = async ctx => {
  const base = ctx.storage.get('manifestUrl', MANIFEST_URL)

  try {
    const controller = new AbortController()
    const cancel = ctx.setTimeout(() => controller.abort(), FETCH_MS)
    const response = await fetch(base, { cache: 'no-store', signal: controller.signal })
    cancel()

    if (!response.ok) {
      throw new Error(`manifest ${response.status}`)
    }

    const remote = normalize(base, (await response.json())?.drops)

    if (remote.length === 0) {
      throw new Error('manifest carried no usable drops')
    }

    const merged = new Map(remote.map(drop => [drop.id, drop]))

    for (const drop of normalize(base, BUNDLED)) {
      if (!merged.has(drop.id)) {
        merged.set(drop.id, drop)
      }
    }

    const drops = [...merged.values()].sort(byNewest)
    $drops.set(drops)
    $origin.set('live')
    ctx.storage.set('gallery', drops)
  } catch {
    const cached = normalize(base, ctx.storage.get('gallery', null))
    $drops.set(cached.length > 0 ? cached : normalize(base, BUNDLED))
    $origin.set(cached.length > 0 ? 'cached' : 'bundled')
  }
}

export default {
  id: 'backdrops',
  name: 'Backdrops',
  description: 'A picture behind your chat — plain, a daily pick, the gallery, or your own photo — without changing your theme.',
  register(ctx) {
    const base = ctx.storage.get('manifestUrl', MANIFEST_URL)
    const stored = ctx.storage.get('choice', 'plain')

    $choice.set(typeof stored === 'string' ? stored : 'plain')
    $own.set(ctx.storage.get('own', null))
    const storedVeil = ctx.storage.get('veil', 'soft')
    $veil.set(['soft', 'vivid', 'darker'].includes(storedVeil) ? storedVeil : 'soft')
    const cached = normalize(base, ctx.storage.get('gallery', null))
    $drops.set(cached.length > 0 ? cached : normalize(base, BUNDLED))

    ctx.register({
      id: 'picker',
      area: STATUSBAR_AREAS.right,
      order: 140,
      render: () => jsx(Trigger, { ctx })
    })

    void refresh(ctx)
    ctx.setInterval(() => void refresh(ctx), REFRESH_MS)
    ctx.setInterval(() => $today.set(Math.floor(Date.now() / DAY_MS)), 60 * 60 * 1000)
  }
}
